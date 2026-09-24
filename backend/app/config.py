import os
from dataclasses import dataclass

DEFAULT_EMBEDDING_BASE_URL = "https://maas.qianwenaiapi.com/compatible-mode/v1"
DEFAULT_EMBEDDING_MODEL = "qwen3.7-text-embedding-flash"
DEFAULT_EMBEDDING_DIMENSIONS = 1024
DEFAULT_EMBEDDING_BATCH_SIZE = 16


class EmbeddingConfigurationError(Exception):
    pass


@dataclass(frozen=True)
class EmbeddingSettings:
    api_key: str
    base_url: str
    model: str
    dimensions: int
    batch_size: int
    timeout_seconds: float
    provider: str = "openai-compatible"

    @classmethod
    def from_env(cls) -> "EmbeddingSettings":
        api_key = os.getenv("RESEARCH_OS_EMBEDDING_API_KEY", "").strip()
        if not api_key:
            raise EmbeddingConfigurationError("Embedding API key is not configured")
        try:
            dimensions = int(os.getenv("RESEARCH_OS_EMBEDDING_DIMENSIONS", DEFAULT_EMBEDDING_DIMENSIONS))
            batch_size = max(1, min(16, int(os.getenv("RESEARCH_OS_EMBEDDING_BATCH_SIZE", DEFAULT_EMBEDDING_BATCH_SIZE))))
            timeout_seconds = float(os.getenv("RESEARCH_OS_EMBEDDING_TIMEOUT", "20"))
        except ValueError as error:
            raise EmbeddingConfigurationError("Embedding configuration has an invalid numeric value") from error
        if dimensions < 1 or timeout_seconds <= 0:
            raise EmbeddingConfigurationError("Embedding configuration has an invalid value")
        return cls(
            api_key=api_key,
            base_url=os.getenv("RESEARCH_OS_EMBEDDING_BASE_URL", DEFAULT_EMBEDDING_BASE_URL).rstrip("/"),
            model=os.getenv("RESEARCH_OS_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL),
            dimensions=dimensions,
            batch_size=batch_size,
            timeout_seconds=timeout_seconds,
        )
