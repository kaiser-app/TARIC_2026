# -*- coding: utf-8 -*-
"""TARIC/KN10 tarifálási kereső FastAPI backend."""
from datetime import date
import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request

from . import db

app = FastAPI(title="TARIC/KN10 tarifálási kereső")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/kereses")
def api_kereses(
    q: str = Query(..., min_length=2),
    limit: int = Query(default=50, ge=1, le=100),
):
    return {"talalatok": db.search_nomenklatura(q.strip(), limit=limit)}


@app.get("/api/orszagok")
def api_orszagok():
    return {"orszagok": db.list_orszagok()}


@app.get("/api/tarifalas")
def api_tarifalas(
    vtsz: str = Query(..., min_length=2, max_length=10, pattern=r"^\d{2,10}$"),
    orszag: str | None = Query(default=None, min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$"),
    datum: str | None = Query(default=None, description="YYYY-MM-DD, üres = ma"),
):
    try:
        on_date = date.fromisoformat(datum) if datum else date.today()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="A dátum formátuma YYYY-MM-DD legyen.") from exc

    return db.tarifalas(
        vtsz=vtsz,
        orszag=orszag.upper() if orszag else None,
        on_date=on_date,
    )


@app.get("/api/healthz")
def healthz():
    return {"status": "ok"}
