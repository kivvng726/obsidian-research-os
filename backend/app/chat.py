"""Minimal OpenAI-compatible chat provider for grounded RAG answers."""

import json
import os
from dataclasses import dataclass
from typing import Callable, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class ChatConfigurationError(Exception):
    """The optional RAG chat provider is not configured."""


class ChatProviderError(Exception):
    """A sanitized remote chat-provider failure."""

    def __init__(self, code: str, message: str | None = None):
        # Keep one-argument construction compatible with test doubles while
        # ensuring every production failure exposes a stable, safe code.
        if message is None:
            message = code
            code = "LLM_PROVIDER_ERROR"
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class ChatSettings:
    api_key: str
    base_url: str
    model: str
    timeout_seconds: float = 60.0
    max_tokens: int = 1600

    @classmethod
    def from_env(cls) -> "ChatSettings":
        api_key = os.getenv("RESEARCH_OS_LLM_API_KEY", "").strip()
        base_url = os.getenv("RESEARCH_OS_LLM_BASE_URL", "").strip().rstrip("/")
        model = os.getenv("RESEARCH_OS_LLM_MODEL", "").strip()
        if not api_key or not base_url or not model:
            raise ChatConfigurationError("RAG chat provider is not configured")
        try:
            timeout_seconds = float(os.getenv("RESEARCH_OS_LLM_TIMEOUT", "60"))
            max_tokens = int(os.getenv("RESEARCH_OS_RAG_MAX_TOKENS", "1600"))
        except ValueError as error:
            raise ChatConfigurationError("RAG chat configuration has an invalid numeric value") from error
        if timeout_seconds <= 0 or max_tokens < 1:
            raise ChatConfigurationError("RAG chat configuration has an invalid value")
        return cls(api_key=api_key, base_url=base_url, model=model,
                   timeout_seconds=timeout_seconds, max_tokens=max_tokens)


class ChatProvider(Protocol):
    model: str

    def complete(self, messages: list[dict[str, str]]) -> str:
        ...


class OpenAICompatibleChatProvider:
    def __init__(self, settings: ChatSettings, transport: Callable[[dict], dict] | None = None):
        self.settings = settings
        self.model = settings.model
        self.transport = transport or self._request

    def _request(self, payload: dict) -> dict:
        request = Request(
            f"{self.settings.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.settings.api_key}"},
        )
        try:
            with urlopen(request, timeout=self.settings.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            if error.code in (401, 403):
                raise ChatProviderError("LLM_AUTH_ERROR", "Chat provider authentication failed") from None
            if error.code == 429:
                raise ChatProviderError("LLM_RATE_LIMITED", "Chat provider rate limit reached") from None
            raise ChatProviderError("LLM_PROVIDER_ERROR", f"Chat provider error ({error.code})") from None
        except (URLError, TimeoutError):
            raise ChatProviderError("LLM_PROVIDER_UNAVAILABLE", "Chat provider is unavailable") from None
        except json.JSONDecodeError:
            raise ChatProviderError("LLM_MALFORMED_RESPONSE", "Chat provider returned malformed JSON") from None

    def complete(self, messages: list[dict[str, str]]) -> str:
        payload = {
            "model": self.settings.model,
            "messages": messages,
            "stream": False,
            "temperature": 0,
            "max_tokens": self.settings.max_tokens,
        }
        try:
            response = self.transport(payload)
            choices = response.get("choices") if isinstance(response, dict) else None
            content = choices[0].get("message", {}).get("content") if isinstance(choices, list) and choices else None
            if not isinstance(content, str) or not content.strip():
                raise ChatProviderError("LLM_MALFORMED_RESPONSE", "Chat provider returned a malformed response")
            return content.strip()
        except ChatProviderError:
            raise
        except Exception:
            raise ChatProviderError("LLM_PROVIDER_ERROR", "Chat provider request failed") from None
