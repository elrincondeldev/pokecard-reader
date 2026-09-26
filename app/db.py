import os

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://poke:poke@localhost:5432/poke",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def check_db() -> str:
    with engine.connect() as conn:
        return conn.execute(text("SELECT version()")).scalar_one()
