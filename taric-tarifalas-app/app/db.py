# -*- coding: utf-8 -*-
"""Adatbázis-hozzáférési réteg a taric_tarifalas.db-hez."""
import os
import sqlite3
from datetime import date

DB_PATH = os.environ.get(
    "TARIC_DB_PATH",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "taric_tarifalas.db"),
)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def fmt_date(d: date) -> str:
    """Python date -> a törzsekben használt ÉÉÉÉ.HH.NN formátum."""
    return d.strftime("%Y.%m.%d")


def search_nomenklatura(keyword: str, limit: int = 50):
    """Kulcsszavas keresés a kn10 MEGNEVEZES mezőjében."""
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT VTSZ, INDENT, PRODUCT_LINE, MEGNEVEZES, AFA_KULCSOK
            FROM kn10
            WHERE MEGNEVEZES LIKE ? COLLATE NOCASE
            ORDER BY VTSZ
            LIMIT ?
            """,
            (f"%{keyword}%", limit),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_kn10(vtsz: str):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM kn10 WHERE VTSZ = ? ORDER BY PRODUCT_LINE", (vtsz,)
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def resolve_country_codes(conn, orszag: str):
    """Visszaadja az országot, import országcsoportjait és az ERGA OMNES kódot."""
    groups = {
        row["ORSZAG_CSOPORT"]
        for row in conn.execute(
            "SELECT DISTINCT ORSZAG_CSOPORT FROM orszagcsoport_import WHERE ORSZAG = ?",
            (orszag,),
        ).fetchall()
    }
    groups.add("1011")
    groups.add(orszag)
    return groups


def _valid_at(alias_kezd: str, alias_vege: str) -> str:
    return f"({alias_kezd} <= ? AND ({alias_vege} = '' OR {alias_vege} >= ?))"


def tarifalas(vtsz: str, orszag: str | None, on_date: date):
    """Teljes tarifálási lánc VTSZ, származási hely és dátum alapján."""
    conn = get_conn()
    try:
        d = fmt_date(on_date)

        nomenklatura = [
            dict(row)
            for row in conn.execute(
                "SELECT VTSZ, INDENT, PRODUCT_LINE, MEGNEVEZES, AFA_KULCSOK FROM kn10 WHERE VTSZ = ?",
                (vtsz,),
            ).fetchall()
        ]

        afa_kiegkod = [
            dict(row)
            for row in conn.execute(
                """
                SELECT k.KIEG_KOD, l.MEGNEVEZES
                FROM kn10_afa_kiegkod k
                LEFT JOIN kiegkod_afa_leiras l ON l.KOD = k.KIEG_KOD
                WHERE k.VTSZ = ?
                """,
                (vtsz,),
            ).fetchall()
        ]

        valid_sql = _valid_at("ERVENYESSEG_KEZDETE", "ERVENYESSEG_VEGE")
        if orszag:
            codes = sorted(resolve_country_codes(conn, orszag))
            placeholders = ",".join("?" * len(codes))
            vamtetel_rows = conn.execute(
                f"""
                SELECT v.*, it.MEGNEVEZES AS INTEZKEDES_NEV, it.IMPORT, it.EXPORT
                FROM vamtetel v
                LEFT JOIN ref_intezkedes_tipus it ON it.KOD = v.INTEZKEDES_TIPUS
                WHERE v.VTSZ != ''
                  AND ? LIKE (v.VTSZ || '%')
                  AND v.SZARMAZASI_HELY IN ({placeholders})
                  AND {valid_sql}
                ORDER BY LENGTH(v.VTSZ) DESC, v.SZARMAZASI_HELY
                LIMIT 300
                """,
                (vtsz, *codes, d, d),
            ).fetchall()
        else:
            vamtetel_rows = conn.execute(
                f"""
                SELECT v.*, it.MEGNEVEZES AS INTEZKEDES_NEV, it.IMPORT, it.EXPORT
                FROM vamtetel v
                LEFT JOIN ref_intezkedes_tipus it ON it.KOD = v.INTEZKEDES_TIPUS
                WHERE v.VTSZ != ''
                  AND ? LIKE (v.VTSZ || '%')
                  AND {valid_sql}
                ORDER BY LENGTH(v.VTSZ) DESC, v.SZARMAZASI_HELY
                LIMIT 300
                """,
                (vtsz, d, d),
            ).fetchall()

        valid_sql_ekezd = _valid_at("i.EKEZD", "i.EVEGE")
        area_codes = sorted(resolve_country_codes(conn, orszag)) if orszag else None

        if area_codes:
            placeholders = ",".join("?" * len(area_codes))
            intezkedes_eu = conn.execute(
                f"""
                SELECT i.*, ig.MEGNEVEZES AS IGAZOLAS_NEV, fk.LEIRAS AS FELTETEL_LEIRAS
                FROM import_intezkedes_eu i
                LEFT JOIN igazolaskod ig ON ig.KODAZON = i.IGAZOLAS_KOD
                LEFT JOIN ref_feltetel_kod fk
                  ON fk.KOD = substr(trim(i.FELTETEL_SORSZ), 1, 1)
                WHERE i.VTSZ != ''
                  AND ? LIKE (i.VTSZ || '%')
                  AND i.TERULET IN ({placeholders})
                  AND {valid_sql_ekezd}
                ORDER BY LENGTH(i.VTSZ) DESC
                LIMIT 300
                """,
                (vtsz, *area_codes, d, d),
            ).fetchall()
            intezkedes_hu = conn.execute(
                f"""
                SELECT i.*
                FROM import_intezkedes_hu i
                WHERE i.VTSZ != ''
                  AND ? LIKE (i.VTSZ || '%')
                  AND i.TERULET IN ({placeholders})
                  AND {valid_sql_ekezd}
                ORDER BY LENGTH(i.VTSZ) DESC
                LIMIT 300
                """,
                (vtsz, *area_codes, d, d),
            ).fetchall()
        else:
            intezkedes_eu = conn.execute(
                f"""
                SELECT i.*, ig.MEGNEVEZES AS IGAZOLAS_NEV, fk.LEIRAS AS FELTETEL_LEIRAS
                FROM import_intezkedes_eu i
                LEFT JOIN igazolaskod ig ON ig.KODAZON = i.IGAZOLAS_KOD
                LEFT JOIN ref_feltetel_kod fk
                  ON fk.KOD = substr(trim(i.FELTETEL_SORSZ), 1, 1)
                WHERE i.VTSZ != ''
                  AND ? LIKE (i.VTSZ || '%')
                  AND {valid_sql_ekezd}
                ORDER BY LENGTH(i.VTSZ) DESC
                LIMIT 300
                """,
                (vtsz, d, d),
            ).fetchall()
            intezkedes_hu = conn.execute(
                f"""
                SELECT i.*
                FROM import_intezkedes_hu i
                WHERE i.VTSZ != ''
                  AND ? LIKE (i.VTSZ || '%')
                  AND {valid_sql_ekezd}
                ORDER BY LENGTH(i.VTSZ) DESC
                LIMIT 300
                """,
                (vtsz, d, d),
            ).fetchall()

        return {
            "vtsz": vtsz,
            "orszag": orszag,
            "datum": d,
            "nomenklatura": nomenklatura,
            "afa_kiegkod": afa_kiegkod,
            "vamtetel": [dict(row) for row in vamtetel_rows],
            "import_intezkedes_eu": [dict(row) for row in intezkedes_eu],
            "import_intezkedes_hu": [dict(row) for row in intezkedes_hu],
        }
    finally:
        conn.close()


def list_orszagok(limit: int = 300):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT ORSZAGKOD, ORSZAGNEV FROM orszag ORDER BY ORSZAGNEV LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()
