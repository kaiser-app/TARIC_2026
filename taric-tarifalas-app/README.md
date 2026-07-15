# TARIC / KN10 tarifálási kereső

FastAPI-alapú webalkalmazás a NAV eVÁM Törzsekből előállított, futáskor felépített SQLite-adatbázissal. Termékleírás alapján VTSZ-t keres, valamint VTSZ + származási ország + dátum szerint lekéri a nómenklatúrát, vámtételeket, ÁFA-kiegészítő kódokat és importintézkedéseket.

> **Fontos:** tájékoztató jellegű, nem hivatalos eszköz. Kötelező érvényű besoroláshoz a NAV TARIC Web rendszerét vagy kötelező tarifális felvilágosítást kell használni.

## Helyi futtatás

```bash
python scripts/materialize_db.py
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Ezután: `http://localhost:8000`

A `taric_tarifalas.db` nincs verziókezelésben. A `data/taric_data.tar.xz` tömörített, az alkalmazás által ténylegesen használt táblákat tartalmazza; a `scripts/materialize_db.py` ebből építi fel az adatbázist és az indexeket.

## Render

A fő `TARIC_2026` repository gyökerében lévő `render.yaml` külön Python webszolgáltatásként tartalmazza ezt az alkalmazást, `rootDir: taric-tarifalas-app` beállítással.

Önálló repository esetén az ebben a mappában lévő `render.yaml` is használható:

- Build command: `python scripts/materialize_db.py && pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/healthz`

## API

- `GET /api/kereses?q=<kulcsszó>` — keresés a KN10 megnevezésekben
- `GET /api/tarifalas?vtsz=<VTSZ>&orszag=<ISO2>&datum=YYYY-MM-DD` — tarifálási lánc
- `GET /api/orszagok` — országlista
- `GET /api/healthz` — állapotellenőrzés

## Ismert korlátok

- Az intézkedéstípusok magyar megnevezése részben a NAV TARIC_WEB kézikönyv régebbi kódlistájára épül, ezért új típusoknál hiányozhat.
- A kiegészítő kódokhoz kötött összetett vámtételképletek teljes feloldása még nincs megvalósítva.
- A vámtétel- és intézkedéslisták lekérdezésenként legfeljebb 300 sort adnak vissza.
