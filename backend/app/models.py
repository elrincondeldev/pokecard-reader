import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, LargeBinary, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ScanStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class Card(Base):

    __tablename__ = "cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    tcggo_id: Mapped[int] = mapped_column(unique=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    name_numbered: Mapped[str | None] = mapped_column(String(250))
    card_number: Mapped[str | None] = mapped_column(String(50))
    supertype: Mapped[str | None] = mapped_column(String(50), index=True)
    rarity: Mapped[str | None] = mapped_column(String(100), index=True)
    hp: Mapped[int | None]
    tcgid: Mapped[str | None] = mapped_column(String(100))
    episode_id: Mapped[int | None]
    episode_name: Mapped[str | None] = mapped_column(String(200), index=True)
    episode_code: Mapped[str | None] = mapped_column(String(20))
    artist: Mapped[str | None] = mapped_column(String(200))
    image_url: Mapped[str | None] = mapped_column(Text)
    tcggo_url: Mapped[str | None] = mapped_column(Text)
    latest_prices: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Scan(Base):

    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(String(20), default=ScanStatus.PENDING, index=True)
    device_id: Mapped[str | None] = mapped_column(String(100))
    image: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    content_type: Mapped[str] = mapped_column(String(50))
    vision: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    card_id: Mapped[int | None] = mapped_column(ForeignKey("cards.id"), index=True)
    error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CardPrice(Base):

    __tablename__ = "card_prices"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("cards.id"), index=True)
    scan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scans.id"))
    source: Mapped[str] = mapped_column(String(30))  # cardmarket, tcg_player, ebay
    tier: Mapped[str] = mapped_column(String(100))  # e.g. lowest_near_mint, graded.psa.10
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str | None] = mapped_column(String(10))
    sample_size: Mapped[int | None]
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
