"""Look up cards and prices on pokemon-api.com (RapidAPI)."""

from decimal import Decimal
from typing import Any

import httpx

from app import config


NON_PRICE_KEYS = {"currency", "available_items", "sample_size"}


class PokemonApiError(Exception):
    pass


class CardNotFound(PokemonApiError):
    pass


async def find_card(http: httpx.AsyncClient, vision: dict[str, Any]) -> dict[str, Any]:
    name = (vision.get("name") or "").strip()
    number = str(vision.get("card_number") or "").strip()
    if not name:
        raise CardNotFound("vision model could not read a card name")

    queries: list[dict[str, str]] = []
    if number:
        stripped = number.lstrip("0") or number
        queries.append({"name": name, "card_number": stripped})
        if stripped != number:
            queries.append({"name": name, "card_number": number})
        queries.append({"search": f"{name} {stripped}"})
    else:
        queries.append({"search": name})

    for params in queries:
        best = pick_best(await list_cards(http, params), vision)
        if best:
            return best
    raise CardNotFound(f"no match on pokemon-api.com for {name!r} #{number or '?'}")


async def list_cards(http: httpx.AsyncClient, params: dict[str, str]) -> list[dict[str, Any]]:
    if not config.RAPIDAPI_KEY:
        raise PokemonApiError("RAPIDAPI_KEY is not set")
    resp = await http.get(
        f"https://{config.POKEMON_API_HOST}/cards",
        params={**params, "per_page": 20},
        headers={"x-rapidapi-key": config.RAPIDAPI_KEY, "x-rapidapi-host": config.POKEMON_API_HOST},
        timeout=30,
    )
    if resp.status_code == 429:
        raise PokemonApiError("pokemon-api.com rate limit / monthly quota reached")
    if resp.is_error:
        raise PokemonApiError(f"pokemon-api.com HTTP {resp.status_code}: {resp.text[:300]}")
    return resp.json().get("data") or []


def _norm_number(value: Any) -> str:
    return str(value or "").strip().upper().lstrip("0")


def pick_best(cards: list[dict[str, Any]], vision: dict[str, Any]) -> dict[str, Any] | None:
    if not cards:
        return None
    number = _norm_number(vision.get("card_number"))
    set_name = (vision.get("set_name") or "").lower()
    set_code = (vision.get("set_code") or "").upper()
    name = (vision.get("name") or "").lower()

    def score(card: dict[str, Any]) -> int:
        episode = card.get("episode") or {}
        s = 0
        if number and _norm_number(card.get("card_number")) == number:
            s += 4
        if set_code and (episode.get("code") or "").upper() == set_code:
            s += 2
        episode_name = (episode.get("name") or "").lower()
        if set_name and episode_name and (set_name in episode_name or episode_name in set_name):
            s += 2
        if vision.get("hp") and card.get("hp") == vision.get("hp"):
            s += 1
        if (card.get("name") or "").lower() == name:
            s += 1
        return s

    best = max(cards, key=score)
    best_score = score(best)
    if number:
        return best if best_score >= 4 else None
    return best if len(cards) == 1 or best_score >= 2 else None


def card_fields(card: dict[str, Any]) -> dict[str, Any]:
    episode = card.get("episode") or {}
    artist = card.get("artist") or {}
    return {
        "tcggo_id": card["id"],
        "name": card.get("name") or "?",
        "name_numbered": card.get("name_numbered"),
        "card_number": str(card["card_number"]) if card.get("card_number") is not None else None,
        "supertype": card.get("supertype"),
        "rarity": card.get("rarity"),
        "tcgid": card.get("tcgid"),
        "episode_id": episode.get("id"),
        "episode_name": episode.get("name"),
        "episode_code": episode.get("code"),
        "artist": artist.get("name"),
        "image_url": card.get("image"),
        "tcggo_url": card.get("tcggo_url"),
        "latest_prices": card.get("prices"),
        "raw": card,
    }


def flatten_prices(prices: dict[str, Any] | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for source, data in (prices or {}).items():
        if not isinstance(data, dict):
            continue
        currency = data.get("currency")

        def walk(node: Any, path: list[str]) -> None:
            if isinstance(node, dict):
                if "median_price" in node:
                    if node["median_price"] is not None:
                        rows.append(_row(source, path, node["median_price"], currency, node.get("sample_size")))
                    return
                for key, value in node.items():
                    if key not in NON_PRICE_KEYS:
                        walk(value, [*path, str(key)])
            elif isinstance(node, (int, float)) and not isinstance(node, bool):
                rows.append(_row(source, path, node, currency, None))

        walk(data, [])
    return rows


def _row(source: str, path: list[str], price: float, currency: str | None, sample_size: Any) -> dict[str, Any]:
    return {
        "source": source,
        "tier": ".".join(path),
        "price": Decimal(str(price)),
        "currency": currency,
        "sample_size": sample_size if isinstance(sample_size, int) else None,
    }
