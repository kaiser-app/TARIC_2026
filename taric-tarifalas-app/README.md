# TARIC / KN10 tarifálási kereső

FastAPI-alapú webalkalmazás a `TARIC_2026` repositoryban publikált NAV/eVÁM statikus adatkészlet fölött. Termékleírás alapján VTSZ-t keres, valamint VTSZ + származási ország + dátum szerint megjeleníti a nómenklatúrát, vámtételeket, ÁFA-kulcsot és importintézkedéseket.

> **Fontos:** tájékoztató jellegű, nem hivatalos eszköz. Kötelező érvényű besoroláshoz a NAV TARIC Web rendszerét vagy kötelező tarifális felvilágosítást kell használni.

## Adatfelépítés

A nagy SQLite-fájl nem kerül a Git repositoryba. A build során a `scripts/materialize_db.py` letölti a fő repóban lévő `taric-2026-render-site.zip` állományt, majd abból helyben felépíti és indexeli a `taric_tarifalas.db` adatbázist.

Az adatforrás felülírható a `TARIC_DATASET_URL` környezeti változóval.

## Helyi futtatás

```bash
pip install -r requirements.txt
python scripts/materialize_db.py
uvicorn app.main:app --reload --port 8000
```

Ezután: `http://localhost:8000`

## Render

A fő `TARIC_2026` repository gyökerében lévő `render.yaml` külön Python webszolgáltatásként tartalmazza ezt az alkalmazást, `rootDir: taric-tarifalas-app` beállítással.

Önálló repository esetén az ebben a mappában lévő `render.yaml` használható:

- Build: `pip install -r requirements.txt && python scripts/materialize_db.py`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/healthz`

## API

- `GET /api/kereses?q=<kulcsszó>` — keresés a KN10 megnevezésekben
- `GET /api/tarifalas?vtsz=<VTSZ>&orszag=<ISO2>&datum=YYYY-MM-DD` — tarifálási lánc
- `GET /api/orszagok` — országlista
- `GET /api/healthz` — állapotellenőrzés

## Korlátok

- A statikus adatkészlet összesített vámtétel-kifejezéseket tartalmaz; az összetett képletek nem kerülnek külön elemekre bontásra.
- Egyes preferenciális országcsoportok nem rendelhetők egyetlen ISO országkódhoz; ország nélkül lekérdezve ezek is megjelennek.
- Az ÁFA-kiegészítő kódok külön feloldása még nincs megvalósítva.
- A vámtétel- és intézkedéslisták lekérdezésenként legfeljebb 300 sort adnak vissza.
