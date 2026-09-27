"""Identify a Pokémon card from a photo using Gemini on Replicate."""

import asyncio
import base64
import json
import re
from typing import Any

import httpx

from app import config

REPLICATE_API = "https://api.replicate.com/v1"
DATA_URI_MAX_BYTES = 256 * 1024
PREDICTION_TIMEOUT_S = 180

PROMPT = """You are looking at a photo of a single Pokémon Trading Card Game card.
Return ONLY a JSON object (no markdown, no explanation) with these keys:
- "is_pokemon_card": true if the image shows a Pokémon TCG card, else false
- "name": the card name exactly as printed, including suffixes like ex, V, VMAX, VSTAR, GX (e.g. "Charizard ex")
- "card_number": the collector number at the bottom, only the part before the slash
  (e.g. "199" from "199/165", "GG69" from "GG69/GG70"), or the promo code (e.g. "SWSH050")
- "printed_total": the number after the slash, or null
- "set_name": the expansion name if you can tell, else null
- "set_code": the set abbreviation if printed (e.g. "PAF", "SVI"), else null
- "hp": HP as an integer, or null
- "rarity": the rarity if identifiable, else null
- "supertype": "Pokemon", "Trainer" or "Energy"
- "language": two-letter language code of the card text
- "confidence": number from 0 to 1, how sure you are about name and card_number
Use null for anything you cannot read."""


class VisionError(Exception):
    pass


async def identify_card(http: httpx.AsyncClient, image: bytes, content_type: str) -> dict[str, Any]:
    if not config.REPLICATE_API_TOKEN:
        raise VisionError("REPLICATE_API_TOKEN is not set")
    headers = {"Authorization": f"Bearer {config.REPLICATE_API_TOKEN}"}

    image_input = await _image_input(http, headers, image, content_type)
    resp = await http.post(
        f"{REPLICATE_API}/models/{config.REPLICATE_MODEL}/predictions",
        headers={**headers, "Prefer": "wait=60"},
        json={
            "input": {
                "prompt": PROMPT,
                "images": [image_input],
                "thinking_level": "low",
                "max_output_tokens": 2048,
            }
        },
        timeout=90,
    )
    _raise_for_status(resp)
    prediction = await _wait_for(http, headers, resp.json())
    return parse_json_output("".join(prediction.get("output") or []))


async def _image_input(
    http: httpx.AsyncClient, headers: dict[str, str], image: bytes, content_type: str
) -> str:
    if len(image) <= DATA_URI_MAX_BYTES:
        return f"data:{content_type};base64,{base64.b64encode(image).decode()}"
    resp = await http.post(
        f"{REPLICATE_API}/files",
        headers=headers,
        files={"content": ("card", image, content_type)},
        timeout=60,
    )
    _raise_for_status(resp)
    return resp.json()["urls"]["get"]


async def _wait_for(
    http: httpx.AsyncClient, headers: dict[str, str], prediction: dict[str, Any]
) -> dict[str, Any]:
    deadline = asyncio.get_running_loop().time() + PREDICTION_TIMEOUT_S
    while prediction["status"] not in ("succeeded", "failed", "canceled"):
        if asyncio.get_running_loop().time() > deadline:
            raise VisionError(f"Replicate prediction {prediction.get('id')} timed out")
        await asyncio.sleep(1)
        resp = await http.get(prediction["urls"]["get"], headers=headers)
        _raise_for_status(resp)
        prediction = resp.json()
    if prediction["status"] != "succeeded":
        raise VisionError(f"Replicate prediction {prediction['status']}: {prediction.get('error')}")
    return prediction


def _raise_for_status(resp: httpx.Response) -> None:
    if resp.is_error:
        raise VisionError(f"Replicate HTTP {resp.status_code}: {resp.text[:300]}")


def parse_json_output(text: str) -> dict[str, Any]:
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise VisionError(f"model did not return JSON: {text[:300]!r}")
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise VisionError(f"model returned invalid JSON: {exc}") from exc
