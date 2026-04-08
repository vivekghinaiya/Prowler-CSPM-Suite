"""Core Anthropic Claude AI service — rate-limited, retry-safe, JSON-aware."""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

logger = logging.getLogger(__name__)

_MODEL = "claude-haiku-4-5-20251001"  # fast + affordable; change to claude-sonnet-4-6 for higher quality
_MAX_TOKENS = 4096


class AIServiceError(Exception):
    """Raised when AI is unavailable or returns unparseable output."""


class AIService:
    """Thread-safe Anthropic Claude wrapper with retry backoff."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def generate(self, prompt: str, *, max_retries: int = 3) -> str:
        if not self._api_key:
            raise AIServiceError("ANTHROPIC_API_KEY is not configured")

        import anthropic  # lazy import — not available in dev env

        client = anthropic.Anthropic(api_key=self._api_key)

        last_exc: Exception | None = None
        for attempt in range(max_retries):
            try:
                message = client.messages.create(
                    model=_MODEL,
                    max_tokens=_MAX_TOKENS,
                    messages=[{"role": "user", "content": prompt}],
                )
                return message.content[0].text
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    logger.warning("Claude attempt %d failed (%s); retrying in %ds", attempt + 1, exc, wait)
                    time.sleep(wait)

        raise AIServiceError(f"Claude failed after {max_retries} attempts: {last_exc}") from last_exc

    def generate_json(self, prompt: str, **kw: Any) -> Any:
        """Generate and parse JSON from the model response."""
        raw = self.generate(prompt, **kw)
        # Strip markdown code fences if the model wraps output
        cleaned = re.sub(r"^```(?:json)?\s*\n?", "", raw.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"\n?```$", "", cleaned.strip())
        try:
            return json.loads(cleaned.strip())
        except json.JSONDecodeError as exc:
            logger.error("AI response is not valid JSON:\n%s", raw[:500])
            raise AIServiceError(f"AI returned non-JSON: {exc}") from exc


def get_ai_service() -> AIService:
    from app.config import get_settings

    return AIService(api_key=get_settings().anthropic_api_key)
