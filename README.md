# poke-reader

Scan a Pokémon card with an ESP32 camera (or your phone), identify it with AI and get its market price.

```
backend/   FastAPI + Postgres scan queue, vision (Replicate) and pricing (pokemon-api.com)
frontend/  React + TypeScript + Tailwind live dashboard
esp32/     Camera firmware that POSTs photos to /scans
```

## Run everything

Put your keys in `.env` (`REPLICATE_API_TOKEN`, `RAPIDAPI_KEY`), then:

```bash
docker compose up -d --build
```

- Web app: http://localhost:3000 (the API is proxied under `/api`)
- API: http://localhost:8000 (the ESP32 posts here)

Ports can be changed with `WEB_PORT` and `API_PORT`.

## Frontend dev

```bash
cd frontend && npm install && npm run dev
```

Vite proxies `/api` to `http://localhost:8000`; override with `API_URL=http://host:port npm run dev`.
