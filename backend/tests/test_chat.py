from urllib.error import HTTPError, URLError

import pytest

import app.chat as chat_module
from app.chat import ChatConfigurationError, ChatProviderError, ChatSettings, OpenAICompatibleChatProvider


def settings() -> ChatSettings:
    return ChatSettings(api_key="private-test-key", base_url="https://example.invalid/v1", model="test-chat")


def test_chat_provider_request_and_malformed_response() -> None:
    captured = {}
    provider = OpenAICompatibleChatProvider(settings(), transport=lambda payload: captured.update(payload) or {
        "choices": [{"message": {"content": "Grounded answer [E1]"}}]
    })
    assert provider.complete([{"role": "user", "content": "question"}]) == "Grounded answer [E1]"
    assert captured["temperature"] == 0 and captured["max_tokens"] == 1600
    malformed = OpenAICompatibleChatProvider(settings(), transport=lambda _: {"choices": []})
    with pytest.raises(ChatProviderError, match="malformed"):
        malformed.complete([])


@pytest.mark.parametrize("status, expected", [(401, "authentication"), (403, "authentication"), (429, "rate limit"), (500, "provider")])
def test_chat_http_errors_are_sanitized(monkeypatch, status, expected) -> None:
    def fail(*_args, **_kwargs):
        raise HTTPError("https://example.invalid", status, "remote error private-test-key", {}, None)
    monkeypatch.setattr(chat_module, "urlopen", fail)
    with pytest.raises(ChatProviderError, match=expected) as error:
        OpenAICompatibleChatProvider(settings()).complete([])
    assert "private-test-key" not in str(error.value)


@pytest.mark.parametrize("failure", [TimeoutError(), URLError("offline")])
def test_chat_transport_failure_is_sanitized(monkeypatch, failure) -> None:
    def fail(*_args, **_kwargs):
        raise failure
    monkeypatch.setattr(chat_module, "urlopen", fail)
    with pytest.raises(ChatProviderError, match="unavailable"):
        OpenAICompatibleChatProvider(settings()).complete([])


def test_chat_settings_require_independent_environment(monkeypatch) -> None:
    monkeypatch.delenv("RESEARCH_OS_LLM_API_KEY", raising=False)
    monkeypatch.setenv("RESEARCH_OS_EMBEDDING_API_KEY", "embedding-only")
    with pytest.raises(ChatConfigurationError):
        ChatSettings.from_env()
