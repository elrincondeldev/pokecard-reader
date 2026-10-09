import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://poke:poke@localhost:5432/poke",
)

REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN", "")
REPLICATE_MODEL = os.getenv("REPLICATE_MODEL", "google/gemini-3-flash")

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
POKEMON_API_HOST = os.getenv("POKEMON_API_HOST", "pokemon-tcg-api.p.rapidapi.com")

WORKER_CONCURRENCY = int(os.getenv("WORKER_CONCURRENCY", "2"))

MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(5 * 1024 * 1024)))
