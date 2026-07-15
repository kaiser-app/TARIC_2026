#!/usr/bin/env python3
"""Build the runtime SQLite database from the compressed repository dataset."""
from __future__ import annotations

import csv
import io
import sqlite3
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "data" / "taric_data.tar.xz"
DB_PATH = ROOT / "taric_tarifalas.db"

TABLES: dict[str, tuple[str, int]] = {
    "kn10": ("CREATE TABLE kn10 (VTSZ TEXT, INDENT TEXT, PRODUCT_LINE TEXT, MEGNEVEZES TEXT, AFA_KULCSOK TEXT)", 5),
    "kn10_afa_kiegkod": ("CREATE TABLE kn10_afa_kiegkod (VTSZ TEXT, KIEG_KOD TEXT)", 2),
    "kiegkod_afa_leiras": ("CREATE TABLE kiegkod_afa_leiras (KOD TEXT, MEGNEVEZES TEXT)", 2),
    "orszagcsoport_import": ("CREATE TABLE orszagcsoport_import (ORSZAG_CSOPORT TEXT, ORSZAG TEXT)", 2),
    "vamtetel": ("CREATE TABLE vamtetel (VTSZ TEXT, SZARMAZASI_HELY TEXT, SZARMAZASI_HELY_NEV TEXT, INTEZKEDES_TIPUS TEXT, VAMTETEL TEXT, DEVIZANEM_KOD TEXT, MENNYISEGI_EGYSEG TEXT, JOGSZABALY TEXT, ERVENYESSEG_KEZDETE TEXT, ERVENYESSEG_VEGE TEXT)", 10),
    "ref_intezkedes_tipus": ("CREATE TABLE ref_intezkedes_tipus (KOD TEXT, MEGNEVEZES TEXT, IMPORT INTEGER, EXPORT INTEGER)", 4),
    "import_intezkedes_eu": ("CREATE TABLE import_intezkedes_eu (VTSZ TEXT, TERULET TEXT, FELTETEL_SORSZ TEXT, IGAZOLAS_KOD TEXT, IGAZOLAS_LEIR TEXT, EKEZD TEXT, EVEGE TEXT)", 7),
    "igazolaskod": ("CREATE TABLE igazolaskod (KODAZON TEXT, MEGNEVEZES TEXT)", 2),
    "ref_feltetel_kod": ("CREATE TABLE ref_feltetel_kod (KOD TEXT, LEIRAS TEXT)", 2),
    "import_intezkedes_hu": ("CREATE TABLE import_intezkedes_hu (VTSZ TEXT, TERULET TEXT, KIEG_KOD TEXT, EKEZD TEXT, EVEGE TEXT)", 5),
    "orszag": ("CREATE TABLE orszag (ORSZAGKOD TEXT, ORSZAGNEV TEXT)", 2),
}

INDEXES = (
    "CREATE INDEX idx_kn10_desc ON kn10(MEGNEVEZES)",
    "CREATE INDEX idx_kn10_vtsz ON kn10(VTSZ)",
    "CREATE INDEX idx_afa_vtsz ON kn10_afa_kiegkod(VTSZ)",
    "CREATE INDEX idx_afa_kod ON kiegkod_afa_leiras(KOD)",
    "CREATE INDEX idx_oc_orszag ON orszagcsoport_import(ORSZAG)",
    "CREATE INDEX idx_vam_vtsz ON vamtetel(VTSZ)",
    "CREATE INDEX idx_vam_filter ON vamtetel(SZARMAZASI_HELY, ERVENYESSEG_KEZDETE, ERVENYESSEG_VEGE)",
    "CREATE INDEX idx_it_kod ON ref_intezkedes_tipus(KOD)",
    "CREATE INDEX idx_eu_vtsz ON import_intezkedes_eu(VTSZ)",
    "CREATE INDEX idx_eu_filter ON import_intezkedes_eu(TERULET, EKEZD, EVEGE)",
    "CREATE INDEX idx_ig_kod ON igazolaskod(KODAZON)",
    "CREATE INDEX idx_fk_kod ON ref_feltetel_kod(KOD)",
    "CREATE INDEX idx_hu_vtsz ON import_intezkedes_hu(VTSZ)",
    "CREATE INDEX idx_hu_filter ON import_intezkedes_hu(TERULET, EKEZD, EVEGE)",
    "CREATE INDEX idx_country ON orszag(ORSZAGKOD)",
)


def build_database() -> None:
    if not ARCHIVE.is_file():
        raise FileNotFoundError(f"Missing dataset archive: {ARCHIVE}")

    temp_db = DB_PATH.with_suffix(".db.tmp")
    temp_db.unlink(missing_ok=True)
    conn = sqlite3.connect(temp_db)
    seen: set[str] = set()

    try:
        conn.execute("PRAGMA journal_mode=OFF")
        conn.execute("PRAGMA synchronous=OFF")
        for table, (schema, _) in TABLES.items():
            conn.execute(schema)

        with tarfile.open(ARCHIVE, mode="r:xz") as archive:
            for member in archive:
                if not member.isfile():
                    continue
                table = Path(member.name).name.removesuffix(".csv")
                if table not in TABLES or not member.name.endswith(".csv"):
                    raise RuntimeError(f"Unexpected archive entry: {member.name}")
                if table in seen:
                    raise RuntimeError(f"Duplicate table in archive: {table}")
                seen.add(table)
                raw = archive.extractfile(member)
                if raw is None:
                    raise RuntimeError(f"Cannot read archive entry: {member.name}")
                expected = TABLES[table][1]
                placeholders = ",".join("?" for _ in range(expected))
                reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8", newline=""))

                def checked_rows():
                    for row in reader:
                        if len(row) != expected:
                            raise RuntimeError(
                                f"Invalid column count in {member.name}: {len(row)} != {expected}"
                            )
                        yield row

                conn.executemany(f'INSERT INTO "{table}" VALUES ({placeholders})', checked_rows())

        missing = set(TABLES) - seen
        if missing:
            raise RuntimeError(f"Missing tables: {', '.join(sorted(missing))}")

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
        print(f"Created {DB_PATH} ({DB_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build_database()
