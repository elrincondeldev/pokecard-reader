import asyncio
import contextlib
import logging
import uuid

import httpx
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db import SessionLocal
from app.models import Card, CardPrice, Scan, ScanStatus
from app.pokemon_api import card_fields, find_card, flatten_prices
from app.vision import identify_card

log = logging.getLogger("poke_reader.worker")

IDLE_POLL_S = 5
_wake = asyncio.Event()


class ScanError(Exception):
    pass


def notify() -> None:
    _wake.set()


async def reset_stale() -> None:
    async with SessionLocal() as session:
        await session.execute(
            update(Scan)
            .where(Scan.status == ScanStatus.PROCESSING)
            .values(status=ScanStatus.PENDING)
        )
        await session.commit()


def start(http: httpx.AsyncClient, concurrency: int) -> list[asyncio.Task[None]]:
    return [asyncio.create_task(_run(http), name=f"scan-worker-{i}") for i in range(concurrency)]


async def _run(http: httpx.AsyncClient) -> None:
    while True:
        try:
            scan_id = await _claim_next()
            if scan_id is not None:
                await _process(http, scan_id)
                continue
        except Exception:
            log.exception("worker loop error")
        _wake.clear()
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(_wake.wait(), timeout=IDLE_POLL_S)


async def _claim_next() -> uuid.UUID | None:
    next_id = (
        select(Scan.id)
        .where(Scan.status == ScanStatus.PENDING)
        .order_by(Scan.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
        .scalar_subquery()
    )
    stmt = (
        update(Scan)
        .where(Scan.id == next_id)
        .values(
            status=ScanStatus.PROCESSING,
            attempts=Scan.attempts + 1,
            started_at=func.now(),
            error=None,
        )
        .returning(Scan.id)
        .execution_options(synchronize_session=False)
    )
    async with SessionLocal() as session:
        scan_id = (await session.execute(stmt)).scalar_one_or_none()
        await session.commit()
    return scan_id


async def _process(http: httpx.AsyncClient, scan_id: uuid.UUID) -> None:
    log.info("scan %s: started", scan_id)
    try:
        async with SessionLocal() as session:
            row = (
                await session.execute(
                    select(Scan.image, Scan.content_type).where(Scan.id == scan_id)
                )
            ).one()

        vision = await identify_card(http, row.image, row.content_type)
        await _update_scan(scan_id, vision=vision)
        log.info("scan %s: vision read %s #%s", scan_id, vision.get("name"), vision.get("card_number"))
        if not vision.get("is_pokemon_card") or not vision.get("name"):
            raise ScanError("no Pokémon card detected in the image")

        api_card = await find_card(http, vision)
        card_id = await _save_result(scan_id, api_card)
    except Exception as exc:
        log.warning("scan %s: failed: %s", scan_id, exc)
        await _update_scan(
            scan_id,
            status=ScanStatus.FAILED,
            error=(str(exc) or type(exc).__name__)[:2000],
            finished_at=func.now(),
        )
        return
    log.info("scan %s: done -> card %s", scan_id, card_id)


async def _update_scan(scan_id: uuid.UUID, **values) -> None:
    async with SessionLocal() as session:
        await session.execute(update(Scan).where(Scan.id == scan_id).values(**values))
        await session.commit()


async def _save_result(scan_id: uuid.UUID, api_card: dict) -> int:
    fields = card_fields(api_card)
    async with SessionLocal() as session, session.begin():
        card_id = (
            await session.execute(
                pg_insert(Card)
                .values(**fields)
                .on_conflict_do_update(
                    index_elements=[Card.tcggo_id],
                    set_={**fields, "updated_at": func.now()},
                )
                .returning(Card.id)
            )
        ).scalar_one()
        session.add_all(
            CardPrice(card_id=card_id, scan_id=scan_id, **row)
            for row in flatten_prices(api_card.get("prices"))
        )
        await session.execute(
            update(Scan)
            .where(Scan.id == scan_id)
            .values(status=ScanStatus.DONE, card_id=card_id, error=None, finished_at=func.now())
        )
    return card_id
