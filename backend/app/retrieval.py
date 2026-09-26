"""Keyword, exact-vector, and rank-fusion retrieval over derived chunks."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .config import EmbeddingRuntimeConfig
from .embeddings import EmbeddingProvider, EmbeddingProviderError
from .models import SearchResult
from .storage import RagStore

RRF_K = 60
RETRIEVAL_CANDIDATE_LIMIT = 30


class VectorIndexEmptyError(Exception):
    """The selected scope has no compatible cached vectors."""


class SearchRequest(BaseModel):
    query: str
    topK: int = Field(default=10, ge=1, le=50)
    paperIds: list[str] = Field(default_factory=list)
    mode: Literal["keyword", "vector", "hybrid"] = "keyword"
    embedding: EmbeddingRuntimeConfig | None = None

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("query must not be empty")
        return value


class SearchResponse(BaseModel):
    mode: Literal["keyword", "vector", "hybrid"]
    query: str
    results: list[SearchResult]
    vectorAvailable: bool | None = None
    fallback: str | None = None
    warning: str | None = None


def search_keyword(request: SearchRequest, store: RagStore, top_k: int | None = None) -> SearchResponse:
    return SearchResponse(mode="keyword", query=request.query,
                          results=store.search_chunks_keyword(request.query, top_k or request.topK, request.paperIds))


def search_vector(request: SearchRequest, store: RagStore, provider: EmbeddingProvider,
                  provider_name: str, model: str, dimensions: int, top_k: int | None = None) -> SearchResponse:
    if not store.has_compatible_embeddings(provider_name, model, dimensions, request.paperIds):
        raise VectorIndexEmptyError("No compatible cached embeddings are available for this search")
    vector = provider.embed_texts([request.query])[0]
    results = store.search_chunks_vector(vector, top_k or request.topK, provider_name, model, dimensions, request.paperIds)
    if not results:
        raise VectorIndexEmptyError("No compatible cached embeddings are available for this search")
    return SearchResponse(mode="vector", query=request.query, results=results, vectorAvailable=True)


def reciprocal_rank_fusion(keyword_results: list[SearchResult], vector_results: list[SearchResult], top_k: int,
                           rrf_k: int = RRF_K) -> list[SearchResult]:
    merged: dict[str, SearchResult] = {}
    scores: dict[str, float] = {}
    for label, results in (("keyword", keyword_results), ("vector", vector_results)):
        for result in results:
            prior = merged.get(result.chunk_id)
            if prior is None:
                prior = result.model_copy(update={"keyword_rank": None, "vector_rank": None})
                merged[result.chunk_id] = prior
                scores[result.chunk_id] = 0.0
            rank_field = "keyword_rank" if label == "keyword" else "vector_rank"
            merged[result.chunk_id] = prior.model_copy(update={rank_field: result.rank})
            scores[result.chunk_id] += 1.0 / (rrf_k + result.rank)
    ranked = sorted(merged.values(), key=lambda value: (-scores[value.chunk_id], value.chunk_id))[:top_k]
    return [value.model_copy(update={"score": scores[value.chunk_id], "rank": index + 1})
            for index, value in enumerate(ranked)]


def search_hybrid(request: SearchRequest, store: RagStore, provider: EmbeddingProvider,
                  provider_name: str, model: str, dimensions: int) -> SearchResponse:
    keyword = store.search_chunks_keyword(request.query, RETRIEVAL_CANDIDATE_LIMIT, request.paperIds)
    try:
        vector = search_vector(request, store, provider, provider_name, model, dimensions,
                               RETRIEVAL_CANDIDATE_LIMIT).results
    except (EmbeddingProviderError, VectorIndexEmptyError) as error:
        return SearchResponse(mode="hybrid", query=request.query, results=keyword[:request.topK],
                              vectorAvailable=False, fallback="keyword", warning=str(error))
    return SearchResponse(mode="hybrid", query=request.query,
                          results=reciprocal_rank_fusion(keyword, vector, request.topK), vectorAvailable=True)
