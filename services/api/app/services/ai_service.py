"""OpenRouter AI service — rate-limited, retry-safe, JSON-aware."""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

logger = logging.getLogger(__name__)

_MODEL = "meta-llama/llama-3.1-8b-instruct:free"
_MAX_TOKENS = 4096
_BASE_URL = "https://openrouter.ai/api/v1"


class AIServiceError(Exception):
    """Raised when AI is unavailable or returns unparseable output."""


class AIService:
    """Thread-safe OpenRouter wrapper with retry backoff."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def validate_key(self) -> tuple[bool, str]:
        """Test the API key with a minimal call. Returns (ok, error_message)."""
        if not self._api_key:
            return False, "OPENROUTER_API_KEY is not configured. Set it in your .env file."
        try:
            from openai import OpenAI  # noqa: PLC0415
            client = OpenAI(api_key=self._api_key, base_url=_BASE_URL)
            client.chat.completions.create(
                model=_MODEL,
                max_tokens=1,
                messages=[{"role": "user", "content": "hi"}],
            )
            return True, ""
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            if "401" in msg or "authentication" in msg.lower() or "api_key" in msg.lower():
                return False, "API key is invalid or expired. Check your OPENROUTER_API_KEY."
            if "403" in msg or "permission" in msg.lower():
                return False, "API key does not have permission to use this model."
            return False, f"API key validation failed: {msg[:200]}"

    def generate(self, prompt: str, *, max_retries: int = 3) -> str:
        if not self._api_key:
            raise AIServiceError("OPENROUTER_API_KEY is not configured. Set it in your .env file.")

        from openai import OpenAI  # lazy import

        client = OpenAI(api_key=self._api_key, base_url=_BASE_URL)

        last_exc: Exception | None = None
        for attempt in range(max_retries):
            try:
                response = client.chat.completions.create(
                    model=_MODEL,
                    max_tokens=_MAX_TOKENS,
                    messages=[{"role": "user", "content": prompt}],
                )
                return response.choices[0].message.content or ""
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    logger.warning("OpenRouter attempt %d failed (%s); retrying in %ds", attempt + 1, exc, wait)
                    time.sleep(wait)

        raise AIServiceError(f"OpenRouter failed after {max_retries} attempts: {last_exc}") from last_exc

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

    return AIService(api_key=get_settings().openrouter_api_key)
