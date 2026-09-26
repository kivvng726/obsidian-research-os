"""OpenAI-compatible remote embeddings; API keys stay runtime-only."""

import json
from dataclasses import dataclass
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import numpy as np
from pydantic import BaseModel, Field

from .config import EmbeddingRuntimeConfig, EmbeddingSettings
from .models import Chunk
from .storage import RagStore


class EmbeddingProviderError(Exception):
    def __init__(self, code: str = "EMBEDDING_PROVIDER_UNAVAILABLE", message: str | None = None):
        self.code = code
        super().__init__(message or code)


class EmbeddingProvider:
    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError


class OpenAICompatibleEmbeddingProvider(EmbeddingProvider):
    def __init__(self, settings: EmbeddingSettings, transport: Callable | None = None):
        self.settings = settings
        self.transport = transport or self._request

    def _request(self, payload: dict) -> dict:
        request = Request(f"{self.settings.base_url}/embeddings", data=json.dumps(payload).encode("utf-8"), method="POST",
                          headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.settings.api_key}"})
        try:
            with urlopen(request, timeout=self.settings.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            if error.code in (401, 403): raise EmbeddingProviderError("EMBEDDING_CREDENTIAL_INVALID", "Embedding credential is invalid") from None
            if error.code == 429: raise EmbeddingProviderError("EMBEDDING_RATE_LIMITED", "Embedding provider rate limited") from None
            if error.code in (400, 404): raise EmbeddingProviderError("EMBEDDING_MODEL_CONFIG_INVALID", "Embedding model or configuration is invalid") from None
            raise EmbeddingProviderError("EMBEDDING_PROVIDER_UNAVAILABLE", "Embedding provider is unavailable") from None
        except (URLError, TimeoutError):
            raise EmbeddingProviderError("EMBEDDING_PROVIDER_UNAVAILABLE", "Embedding provider is unavailable") from None
        except json.JSONDecodeError:
            raise EmbeddingProviderError("EMBEDDING_PROVIDER_UNAVAILABLE", "Embedding provider returned malformed JSON") from None

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        output: list[list[float]] = []
        for start in range(0, len(texts), self.settings.batch_size):
            batch = texts[start:start + self.settings.batch_size]
            try:
                response = self.transport({"model": self.settings.model, "input": batch, "dimensions": self.settings.dimensions, "encoding_format": "float"})
                data = response.get("data") if isinstance(response, dict) else None
                if not isinstance(data, list) or len(data) != len(batch):
                    raise EmbeddingProviderError("Embedding provider returned an unexpected vector count")
                vectors = [None] * len(batch)
                for fallback_index, item in enumerate(data):
                    index = item.get("index", fallback_index) if isinstance(item, dict) else -1
                    if not isinstance(index, int) or index < 0 or index >= len(batch) or vectors[index] is not None:
                        raise EmbeddingProviderError("Embedding provider returned invalid vector ordering")
                    vectors[index] = item.get("embedding") if isinstance(item, dict) else None
                if any(not isinstance(vector, list) or len(vector) != self.settings.dimensions for vector in vectors):
                    raise EmbeddingProviderError("Embedding provider returned an unexpected vector dimension")
                output.extend(vectors)
            except EmbeddingProviderError:
                raise
            except Exception:
                raise EmbeddingProviderError("Embedding provider request failed") from None
        return output


@dataclass
class EmbeddingIndexStats:
    status: str
    model: str
    dimensions: int
    total_chunks: int
    cached_chunks: int
    embedded_chunks: int
    failed_chunks: int
    api_requests: int


class EmbeddingIndexRequest(BaseModel):
    paperIds: list[str] = Field(default_factory=list)
    force: bool = False
    embedding: EmbeddingRuntimeConfig | None = None


class EmbeddingIndexResponse(BaseModel):
    status: str
    model: str
    dimensions: int
    totalChunks: int
    cachedChunks: int
    embeddedChunks: int
    failedChunks: int
    apiRequests: int


def index_chunk_embeddings(store: RagStore, provider: OpenAICompatibleEmbeddingProvider, paper_ids: list[str] | None = None, force: bool = False) -> EmbeddingIndexStats:
    chunks = store.list_chunks_for_embedding(paper_ids)
    missing: list[Chunk] = []; cached = 0
    for chunk in chunks:
        if not force and store.get_chunk_embedding(chunk.id, provider.settings.provider, provider.settings.model, provider.settings.dimensions, chunk.content_hash):
            cached += 1
        else:
            missing.append(chunk)
    embedded = 0; requests = 0
    for start in range(0, len(missing), provider.settings.batch_size):
        batch = missing[start:start + provider.settings.batch_size]
        try:
            vectors = provider.embed_texts([chunk.text for chunk in batch]); requests += 1
            for chunk, vector in zip(batch, vectors):
                store.upsert_chunk_embedding(chunk, provider.settings.provider, provider.settings.model, provider.settings.dimensions, vector)
                embedded += 1
        except EmbeddingProviderError:
            return EmbeddingIndexStats("partial", provider.settings.model, provider.settings.dimensions, len(chunks), cached, embedded, len(missing) - embedded, requests)
    return EmbeddingIndexStats("completed", provider.settings.model, provider.settings.dimensions, len(chunks), cached, embedded, 0, requests)
