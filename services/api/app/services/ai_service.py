"""Core Gemini AI service — rate-limited, retry-safe, JSON-aware."""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

logger = logging.getLogger(__name__)

_RATE_LIMIT_RPM = 15  # free-tier: 15 requests/minute
_MODEL = "gemini-2.0-flash"


class AIServiceError(Exception):
    """Raised when AI is unavailable or returns unparseable output."""


class AIService:
    """Thread-safe Gemini wrapper with in-process rate limiting."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._request_timestamps: list[float] = []

    # ------------------------------------------------------------------ #
    #  Rate limiting                                                       #
    # ------------------------------------------------------------------ #
    def _throttle(self) -> None:
        now = time.monotonic()
        # Keep only timestamps within the last 60 s
        self._request_timestamps = [t for t in self._request_timestamps if now - t < 60]
        if len(self._request_timestamps) >= _RATE_LIMIT_RPM:
            oldest = self._request_timestamps[0]
            wait = 61 - (now - oldest)
            if wait > 0:
                logger.info("AI rate limit: sleeping %.1fs", wait)
                time.sleep(wait)
            self._request_timestamps = []
        self._request_timestamps.append(time.monotonic())

    # ------------------------------------------------------------------ #
    #  Core generation                                                     #
    # ------------------------------------------------------------------ #
    def generate(self, prompt: str, *, max_retries: int = 3) -> str:
        if not self._api_key:
            raise AIServiceError("GEMINI_API_KEY is not configured")

        import google.generativeai as genai  # lazy import — not available in dev env

        genai.configure(api_key=self._api_key)
        model = genai.GenerativeModel(_MODEL)

        last_exc: Exception | None = None
        for attempt in range(max_retries):
            try:
                self._throttle()
                response = model.generate_content(prompt)
                return response.text
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    logger.warning("Gemini attempt %d failed (%s); retrying in %ds", attempt + 1, exc, wait)
                    time.sleep(wait)

        raise AIServiceError(f"Gemini failed after {max_retries} attempts: {last_exc}") from last_exc

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

    return AIService(api_key=get_settings().gemini_api_key)
