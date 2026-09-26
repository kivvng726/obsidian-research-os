from fastapi.testclient import TestClient

import app.main as main_module
from app.chat import ChatConfigurationError, ChatSettings
from app.config import EmbeddingConfigurationError, EmbeddingRuntimeConfig, EmbeddingSettings
from app.embeddings import OpenAICompatibleEmbeddingProvider
from app.embeddings import EmbeddingProviderError
from app.chat import ChatProviderError
from app.main import app


def test_runtime_embedding_overrides_env_and_keeps_key_runtime_only(monkeypatch) -> None:
    monkeypatch.setenv("RESEARCH_OS_EMBEDDING_API_KEY", "env-secret")
    monkeypatch.setenv("RESEARCH_OS_EMBEDDING_BASE_URL", "https://env.invalid/v1")
    settings = EmbeddingSettings.from_runtime(
        EmbeddingRuntimeConfig(provider="qwen", baseUrl="https://runtime.invalid/v1", model="runtime-model", dimensions=3),
        "request-secret",
    )
    assert settings.api_key == "request-secret"
    assert settings.base_url == "https://runtime.invalid/v1"
    assert settings.model == "runtime-model" and settings.dimensions == 3
    assert "request-secret" not in repr({"provider": settings.provider, "model": settings.model, "dimensions": settings.dimensions})


def test_runtime_missing_secret_uses_env_then_reports_safe_error(monkeypatch) -> None:
    monkeypatch.delenv("RESEARCH_OS_EMBEDDING_API_KEY", raising=False)
    try:
        EmbeddingSettings.from_runtime(EmbeddingRuntimeConfig())
        assert False, "missing credential must fail"
    except EmbeddingConfigurationError as error:
        assert "secret" not in str(error).lower()
    monkeypatch.delenv("RESEARCH_OS_LLM_API_KEY", raising=False)
    try:
        ChatSettings.from_runtime()
        assert False, "missing credential must fail"
    except ChatConfigurationError as error:
        assert "secret" not in str(error).lower()


def test_provider_test_endpoints_use_headers_without_persistence(monkeypatch, tmp_path) -> None:
    calls = {}
    monkeypatch.setenv("RESEARCH_OS_DB_PATH", str(tmp_path / "derived.db"))

    def make_embedding(runtime=None, api_key=None):
        calls["embedding"] = (runtime, api_key)
        settings = EmbeddingSettings.from_runtime(runtime, api_key)
        return OpenAICompatibleEmbeddingProvider(settings, transport=lambda _: {"data": [{"index": 0, "embedding": [0.0] * settings.dimensions}]})

    monkeypatch.setattr(main_module, "embedding_provider", make_embedding)
    monkeypatch.setattr(main_module.OpenAICompatibleChatProvider, "complete", lambda self, _: "OK")
    client = TestClient(app)
    embedding = client.post("/providers/embedding/test", headers={"X-Research-OS-Embedding-Key": "TEST_SECRET_KEY_123"}, json={"embedding": {"provider": "qwen", "baseUrl": "https://runtime.invalid/v1", "model": "test-model", "dimensions": 3}})
    assert embedding.status_code == 200 and embedding.json() == {"ok": True, "model": "test-model", "dimensions": 3}
    assert calls["embedding"][1] == "TEST_SECRET_KEY_123"
    assert "TEST_SECRET_KEY_123" not in embedding.text
    chat = client.post("/providers/chat/test", headers={"X-Research-OS-LLM-Key": "TEST_SECRET_KEY_123"}, json={"chat": {"provider": "deepseek", "baseUrl": "https://runtime.invalid", "model": "test-chat"}})
    assert chat.status_code == 200 and chat.json() == {"ok": True, "model": "test-chat"}
    assert "TEST_SECRET_KEY_123" not in chat.text


def test_health_and_version_ignore_runtime_credentials() -> None:
    client = TestClient(app)
    headers = {"X-Research-OS-Embedding-Key": "TEST_SECRET_KEY_123", "X-Research-OS-LLM-Key": "TEST_SECRET_KEY_123"}
    assert client.get("/health", headers=headers).status_code == 200
    assert client.get("/version", headers=headers).status_code == 200


def test_provider_failures_do_not_echo_request_key(monkeypatch) -> None:
    client = TestClient(app)
    monkeypatch.setattr(main_module, "embedding_provider", lambda *_: (_ for _ in ()).throw(EmbeddingProviderError("EMBEDDING_PROVIDER_UNAVAILABLE", "TEST_SECRET_KEY_123")))
    embedding = client.post("/providers/embedding/test", headers={"X-Research-OS-Embedding-Key": "TEST_SECRET_KEY_123"}, json={})
    assert embedding.status_code == 503 and "TEST_SECRET_KEY_123" not in embedding.text
    monkeypatch.setattr(main_module, "chat_provider", lambda *_: (_ for _ in ()).throw(ChatProviderError("LLM_PROVIDER_ERROR", "TEST_SECRET_KEY_123")))
    chat = client.post("/providers/chat/test", headers={"X-Research-OS-LLM-Key": "TEST_SECRET_KEY_123"}, json={})
    assert chat.status_code == 503 and "TEST_SECRET_KEY_123" not in chat.text
