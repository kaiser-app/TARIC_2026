#!/usr/bin/env python3
"""Build the runtime SQLite database from the published TARIC static dataset."""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import tempfile
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

import pycountry

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "taric_tarifalas.db"
SOURCE_URL = os.environ.get(
    "TARIC_DATASET_URL",
    "https://raw.githubusercontent.com/kaiser-app/TARIC_2026/main/taric-2026-render-site.zip",
)

TABLE_SCHEMAS = (
    "CREATE TABLE kn10 (VTSZ TEXT, INDENT TEXT, PRODUCT_LINE TEXT, MEGNEVEZES TEXT, AFA_KULCSOK TEXT)",
    "CREATE TABLE kn10_afa_kiegkod (VTSZ TEXT, KIEG_KOD TEXT)",
    "CREATE TABLE kiegkod_afa_leiras (KOD TEXT, MEGNEVEZES TEXT)",
    "CREATE TABLE orszagcsoport_import (ORSZAG_CSOPORT TEXT, ORSZAG TEXT)",
    "CREATE TABLE vamtetel (VTSZ TEXT, SZARMAZASI_HELY TEXT, SZARMAZASI_HELY_NEV TEXT, INTEZKEDES_TIPUS TEXT, VAMTETEL TEXT, DEVIZANEM_KOD TEXT, MENNYISEGI_EGYSEG TEXT, JOGSZABALY TEXT, ERVENYESSEG_KEZDETE TEXT, ERVENYESSEG_VEGE TEXT)",
    "CREATE TABLE ref_intezkedes_tipus (KOD TEXT, MEGNEVEZES TEXT, IMPORT INTEGER, EXPORT INTEGER)",
    "CREATE TABLE import_intezkedes_eu (VTSZ TEXT, TERULET TEXT, FELTETEL_SORSZ TEXT, IGAZOLAS_KOD TEXT, IGAZOLAS_LEIR TEXT, EKEZD TEXT, EVEGE TEXT)",
    "CREATE TABLE igazolaskod (KODAZON TEXT, MEGNEVEZES TEXT)",
    "CREATE TABLE ref_feltetel_kod (KOD TEXT, LEIRAS TEXT)",
    "CREATE TABLE import_intezkedes_hu (VTSZ TEXT, TERULET TEXT, KIEG_KOD TEXT, EKEZD TEXT, EVEGE TEXT)",
    "CREATE TABLE orszag (ORSZAGKOD TEXT, ORSZAGNEV TEXT)",
    "CREATE TABLE adatforras (KULCS TEXT PRIMARY KEY, ERTEK TEXT)",
)

INDEXES = (
    "CREATE INDEX idx_kn10_desc ON kn10(MEGNEVEZES)",
    "CREATE INDEX idx_kn10_vtsz ON kn10(VTSZ)",
    "CREATE INDEX idx_afa_vtsz ON kn10_afa_kiegkod(VTSZ)",
    "CREATE INDEX idx_oc_orszag ON orszagcsoport_import(ORSZAG)",
    "CREATE INDEX idx_vam_vtsz ON vamtetel(VTSZ)",
    "CREATE INDEX idx_vam_filter ON vamtetel(SZARMAZASI_HELY, ERVENYESSEG_KEZDETE, ERVENYESSEG_VEGE)",
    "CREATE INDEX idx_it_kod ON ref_intezkedes_tipus(KOD)",
    "CREATE INDEX idx_eu_vtsz ON import_intezkedes_eu(VTSZ)",
    "CREATE INDEX idx_eu_filter ON import_intezkedes_eu(TERULET, EKEZD, EVEGE)",
    "CREATE INDEX idx_ig_kod ON igazolaskod(KODAZON)",
    "CREATE INDEX idx_hu_vtsz ON import_intezkedes_hu(VTSZ)",
    "CREATE INDEX idx_hu_filter ON import_intezkedes_hu(TERULET, EKEZD, EVEGE)",
    "CREATE INDEX idx_country ON orszag(ORSZAGKOD)",
)

COUNTRY_ALIASES = {
    "bolivia": "BO",
    "brunei darussalam": "BN",
    "cabo verde": "CV",
    "china": "CN",
    "congo": "CG",
    "democratic republic of the congo": "CD",
    "iran": "IR",
    "ivory coast": "CI",
    "korea republic of south korea": "KR",
    "laos": "LA",
    "moldova republic of": "MD",
    "north macedonia": "MK",
    "occupied palestinian territory": "PS",
    "russia": "RU",
    "syria": "SY",
    "tanzania": "TZ",
    "turkiye": "TR",
    "venezuela": "VE",
    "viet nam": "VN",
}


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def country_code(area_name: str) -> str:
    normalized = normalize_name(area_name)
    if normalized in COUNTRY_ALIASES:
        return COUNTRY_ALIASES[normalized]
    try:
        return pycountry.countries.lookup(area_name).alpha_2
    except LookupError:
        digest = hashlib.sha1(area_name.encode("utf-8")).hexdigest()[:8].upper()
        return f"P{digest}"


def vat_for_code(code: str, default_rate: int | float, by_prefix: dict[str, int | float]) -> str:
    best_prefix = ""
    rate: int | float = default_rate
    for prefix, candidate in by_prefix.items():
        if code.startswith(prefix) and len(prefix) > len(best_prefix):
            best_prefix = prefix
            rate = candidate
    return str(rate)


def read_json(archive: zipfile.ZipFile, relative_path: str):
    path = f"render_site/{relative_path}"
    try:
        with archive.open(path) as handle:
            return json.load(handle)
    except KeyError:
        return None


def download_dataset(target: Path) -> None:
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "TARIC-2026-Render-Build/1.0"},
    )
    with urllib.request.urlopen(request, timeout=180) as response, target.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)


def build_database() -> None:
    temp_db = DB_PATH.with_suffix(".db.tmp")
    temp_db.unlink(missing_ok=True)

    with tempfile.TemporaryDirectory(prefix="taric-build-") as temp_dir:
        archive_path = Path(temp_dir) / "dataset.zip"
        download_dataset(archive_path)

        with zipfile.ZipFile(archive_path) as archive:
            if archive.testzip() is not None:
                raise RuntimeError("A letöltött TARIC-adatcsomag sérült.")
            meta = read_json(archive, "meta.json")
            if not isinstance(meta, dict):
                raise RuntimeError("Hiányzó vagy hibás meta.json.")

            conn = sqlite3.connect(temp_db)
            try:
                conn.execute("PRAGMA journal_mode=OFF")
                conn.execute("PRAGMA synchronous=OFF")
                for schema in TABLE_SCHEMAS:
                    conn.execute(schema)

                vat = meta.get("vat") or {}
                default_vat = vat.get("default", 27)
                vat_prefixes = vat.get("by_prefix") or {}
                duty_date = str(meta.get("duties") or meta.get("kn10") or "2026.01.01")

                countries = sorted(
                    ((country.alpha_2, country.name) for country in pycountry.countries),
                    key=lambda row: row[1],
                )
                conn.executemany("INSERT INTO orszag VALUES (?, ?)", countries)
                conn.executemany(
                    "INSERT INTO orszagcsoport_import VALUES (?, ?)",
                    ((code, code) for code, _name in countries),
                )
                conn.executemany(
                    "INSERT INTO ref_intezkedes_tipus VALUES (?, ?, ?, ?)",
                    (
                        ("103", "Harmadik országos vámtétel", 1, 0),
                        ("142", "Preferenciális vámtétel", 1, 0),
                    ),
                )

                certificate_names: dict[str, str] = {}
                nomenclature_rows = []
                duty_rows = []
                eu_measure_rows = []
                hu_measure_rows = []

                for chapter in range(1, 100):
                    chapter_code = f"{chapter:02d}"
                    nomenclature = read_json(archive, f"n/{chapter_code}.json") or {}
                    for code, description in (nomenclature.get("c") or {}).items():
                        nomenclature_rows.append(
                            (code, "", "", description, vat_for_code(code, default_vat, vat_prefixes))
                        )

                    duties = read_json(archive, f"d/{chapter_code}.json") or {}
                    for code, duty in duties.items():
                        mfn = duty.get("mfn") if isinstance(duty, dict) else None
                        if mfn:
                            duty_rows.append(
                                (code, "1011", "ERGA OMNES", "103", str(mfn), "", "", "", duty_date, "")
                            )
                        for preference in (duty.get("pref") or []) if isinstance(duty, dict) else []:
                            if not isinstance(preference, list) or len(preference) < 2:
                                continue
                            area_name, expression = str(preference[0]), str(preference[1])
                            duty_rows.append(
                                (code, country_code(area_name), area_name, "142", expression, "", "", "", duty_date, "")
                            )

                    measures = read_json(archive, f"m/{chapter_code}.json") or {}
                    for code, rows in measures.items():
                        for row in rows or []:
                            if not isinstance(row, list) or len(row) < 8:
                                continue
                            measure_type, territory, additional_code, certificate, description, start, end, scope = row[:8]
                            certificate = str(certificate or "")
                            description = str(description or "")
                            if certificate and description:
                                certificate_names.setdefault(certificate, description)
                            if scope == "HU":
                                hu_measure_rows.append(
                                    (code, str(territory or ""), str(additional_code or certificate), str(start or ""), str(end or ""))
                                )
                            else:
                                eu_measure_rows.append(
                                    (code, str(territory or ""), str(measure_type or ""), certificate, description, str(start or ""), str(end or ""))
                                )

                conn.executemany("INSERT INTO kn10 VALUES (?, ?, ?, ?, ?)", nomenclature_rows)
                conn.executemany("INSERT INTO vamtetel VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", duty_rows)
                conn.executemany("INSERT INTO import_intezkedes_eu VALUES (?, ?, ?, ?, ?, ?, ?)", eu_measure_rows)
                conn.executemany("INSERT INTO import_intezkedes_hu VALUES (?, ?, ?, ?, ?)", hu_measure_rows)
                conn.executemany(
                    "INSERT INTO igazolaskod VALUES (?, ?)",
                    sorted(certificate_names.items()),
                )
                conn.executemany(
                    "INSERT INTO adatforras VALUES (?, ?)",
                    (
                        ("source_url", SOURCE_URL),
                        ("kn10", str(meta.get("kn10", ""))),
                        ("duties", str(meta.get("duties", ""))),
                        ("cnen", str(meta.get("cnen", ""))),
                    ),
                )

                for statement in INDEXES:
                    conn.execute(statement)
                conn.commit()
                integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
                if integrity != "ok":
                    raise RuntimeError(f"SQLite integrity check failed: {integrity}")
            except Exception:
                conn.close()
                temp_db.unlink(missing_ok=True)
                raise
            else:
                conn.close()

    temp_db.replace(DB_PATH)
    print(f"Created {DB_PATH} ({DB_PATH.stat().st_size:,} bytes) from {SOURCE_URL}")


if __name__ == "__main__":
    build_database()
