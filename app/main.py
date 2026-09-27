import asyncio
import logging
import secrets
import uuid
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from starlette.datastructures import UploadFile

from app import config, worker
from app.db import SessionLocal, check_db, init_db
from app.models import Card, CardPrice, Scan, ScanStatus

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await worker.reset_stale()
    async with httpx.AsyncClient(timeout=30) as http:
        tasks = worker.start(http, config.WORKER_CONCURRENCY)
        yield
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="poke-reader", lifespan=lifespan)


@app.get("/")
def root():
    return {"message": "poke-reader is running"}


@app.get("/health")
async def health():
    try:
        version = await check_db()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"database unavailable: {exc}")
    return {"status": "ok", "database": version}

@app.post("/scans", status_code=202)
async def create_scan(request: Request, x_device_id: str | None = Header(default=None)):
    image, content_type = await _read_image(request)
    scan = Scan(
        id=uuid.uuid4(),
        status=ScanStatus.PENDING,
        image=image,
        content_type=content_type,
        device_id=x_device_id,
    )
    async with SessionLocal() as session:
        session.add(scan)
        await session.commit()
    worker.notify()
    return {"scan_id": scan.id, "status": scan.status, "status_url": f"/scans/{scan.id}"}


@app.get("/scans")
async def list_scans(
    status: ScanStatus | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    stmt = select(Scan).order_by(Scan.created_at.desc()).limit(limit).offset(offset)
    if status:
        stmt = stmt.where(Scan.status == status)
    async with SessionLocal() as session:
        scans = (await session.scalars(stmt)).all()
    return [_scan_out(s) for s in scans]


@app.get("/scans/{scan_id}")
async def get_scan(scan_id: uuid.UUID):
    async with SessionLocal() as session:
        scan = await session.get(Scan, scan_id)
        if scan is None:
            raise HTTPException(status_code=404, detail="scan not found")
        card = await session.get(Card, scan.card_id) if scan.card_id else None
    return _scan_out(scan, card)


@app.post("/scans/{scan_id}/retry", status_code=202)
async def retry_scan(scan_id: uuid.UUID):
    async with SessionLocal() as session:
        scan = await session.get(Scan, scan_id)
        if scan is None:
            raise HTTPException(status_code=404, detail="scan not found")
        if scan.status != ScanStatus.FAILED:
            raise HTTPException(status_code=409, detail=f"scan is {scan.status}, only failed scans can be retried")
        scan.status = ScanStatus.PENDING
        scan.error = None
        await session.commit()
    worker.notify()
    return {"scan_id": scan_id, "status": ScanStatus.PENDING}

@app.get("/cards")
async def list_cards(
    name: str | None = None,
    set: str | None = Query(None, description="Set name or code, e.g. 'Crown Zenith' or 'CRZ'"),
    rarity: str | None = None,
    supertype: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    times_scanned = (
        select(func.count(Scan.id))
        .where(Scan.card_id == Card.id, Scan.status == ScanStatus.DONE)
        .correlate(Card)
        .scalar_subquery()
    )
    stmt = select(Card, times_scanned).order_by(Card.updated_at.desc()).limit(limit).offset(offset)
    if name:
        stmt = stmt.where(Card.name.ilike(f"%{name}%"))
    if set:
        stmt = stmt.where(or_(Card.episode_name.ilike(f"%{set}%"), Card.episode_code.ilike(set)))
    if rarity:
        stmt = stmt.where(Card.rarity.ilike(rarity))
    if supertype:
        stmt = stmt.where(Card.supertype.ilike(supertype))
    async with SessionLocal() as session:
        rows = (await session.execute(stmt)).all()
    return [{**_card_out(card), "times_scanned": count} for card, count in rows]


@app.get("/cards/{card_id}")
async def get_card(card_id: int, history_limit: int = Query(100, ge=1, le=1000)):
    async with SessionLocal() as session:
        card = await session.get(Card, card_id)
        if card is None:
            raise HTTPException(status_code=404, detail="card not found")
        history = (
            await session.scalars(
                select(CardPrice)
                .where(CardPrice.card_id == card_id)
                .order_by(CardPrice.fetched_at.desc(), CardPrice.source, CardPrice.tier)
                .limit(history_limit)
            )
        ).all()
    return {
        **_card_out(card),
        "price_history": [
            {
                "source": p.source,
                "tier": p.tier,
                "price": p.price,
                "currency": p.currency,
                "sample_size": p.sample_size,
                "fetched_at": p.fetched_at,
            }
            for p in history
        ],
    }

def _sniff_image_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def _read_image(request: Request) -> tuple[bytes, str]:
    if request.headers.get("content-type", "").startswith("multipart/form-data"):
        form = await request.form()
        upload = next((v for v in form.values() if isinstance(v, UploadFile)), None)
        if upload is None:
            raise HTTPException(status_code=400, detail="multipart request has no file field")
        data = await upload.read()
    else:
        data = await request.body()

    if not data:
        raise HTTPException(status_code=400, detail="empty image")
    if len(data) > config.MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=f"image larger than {config.MAX_IMAGE_BYTES} bytes")
    content_type = _sniff_image_type(data)
    if content_type is None:
        raise HTTPException(status_code=415, detail="image must be JPEG, PNG or WebP")
    return data, content_type


def _card_out(card: Card) -> dict:
    return {
        "id": card.id,
        "tcggo_id": card.tcggo_id,
        "name": card.name,
        "card_number": card.card_number,
        "supertype": card.supertype,
        "rarity": card.rarity,
        "hp": card.hp,
        "set": {"id": card.episode_id, "name": card.episode_name, "code": card.episode_code},
        "artist": card.artist,
        "image_url": card.image_url,
        "tcggo_url": card.tcggo_url,
        "prices": card.latest_prices,
        "updated_at": card.updated_at,
    }


def _scan_out(scan: Scan, card: Card | None = None) -> dict:
    return {
        "scan_id": scan.id,
        "status": scan.status,
        "device_id": scan.device_id,
        "error": scan.error,
        "vision": scan.vision,
        "card_id": scan.card_id,
        "card": _card_out(card) if card else None,
        "attempts": scan.attempts,
        "created_at": scan.created_at,
        "started_at": scan.started_at,
        "finished_at": scan.finished_at,
    }
