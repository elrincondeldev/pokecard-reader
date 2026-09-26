from fastapi import FastAPI, HTTPException

from app.db import check_db

app = FastAPI(title="poke-reader")


@app.get("/")
def root():
    return {"message": "poke-reader is running"}


@app.get("/health")
def health():
    try:
        version = check_db()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"database unavailable: {exc}")
    return {"status": "ok", "database": version}
