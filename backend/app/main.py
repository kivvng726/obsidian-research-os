from dataclasses import replace
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from .chat import ChatConfigurationError, ChatProviderError, ChatRuntimeConfig, ChatSettings, OpenAICompatibleChatProvider
from .config import EmbeddingConfigurationError, EmbeddingRuntimeConfig, EmbeddingSettings
from .embeddings import EmbeddingIndexRequest, EmbeddingIndexResponse, EmbeddingIndexStats, EmbeddingProviderError, OpenAICompatibleEmbeddingProvider, index_chunk_embeddings
from .indexing import IndexDocumentRequest, IndexDocumentResponse, IndexingError, index_pdf
from .storage import RagStore
from .retrieval import SearchRequest, SearchResponse, VectorIndexEmptyError, search_hybrid, search_keyword, search_vector
from .rag import RagQueryRequest, RagQueryResponse, run_rag_query

BACKEND_VERSION = "0.1.0"
API_VERSION = 1

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


class EmbeddingProviderTestRequest(BaseModel):
    embedding: EmbeddingRuntimeConfig | None = None


class ChatProviderTestRequest(BaseModel):
    chat: ChatRuntimeConfig | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "research-os-backend"}


@app.get("/version")
def version() -> dict[str, str | int]:
    return {"backendVersion": BACKEND_VERSION, "apiVersion": API_VERSION}


@app.post("/documents/index", response_model=IndexDocumentResponse)
def index_document(request: IndexDocumentRequest) -> IndexDocumentResponse:
    try:
        return index_pdf(request, RagStore())
    except IndexingError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from None


def embedding_provider(runtime: EmbeddingRuntimeConfig | None = None, api_key: str | None = None) -> OpenAICompatibleEmbeddingProvider:
    return OpenAICompatibleEmbeddingProvider(EmbeddingSettings.from_runtime(runtime, api_key))


def chat_provider(runtime: ChatRuntimeConfig | None = None, api_key: str | None = None) -> OpenAICompatibleChatProvider:
    return OpenAICompatibleChatProvider(ChatSettings.from_runtime(runtime, api_key))


def embedding_http_error(error: Exception) -> HTTPException:
    if isinstance(error, EmbeddingConfigurationError):
        return HTTPException(status_code=503, detail={"code": "EMBEDDING_CONFIG_ERROR", "message": "Embedding provider is not configured"})
    if isinstance(error, VectorIndexEmptyError):
        return HTTPException(status_code=409, detail={"code": "EMBEDDING_INDEX_EMPTY", "message": "No compatible cached embeddings are available"})
    code = getattr(error, "code", "EMBEDDING_PROVIDER_UNAVAILABLE")
    messages = {
        "EMBEDDING_CREDENTIAL_INVALID": "Embedding credential is invalid",
        "EMBEDDING_MODEL_CONFIG_INVALID": "Embedding model or configuration is invalid",
        "EMBEDDING_RATE_LIMITED": "Embedding provider rate limited",
        "EMBEDDING_PROVIDER_UNAVAILABLE": "Embedding provider is unavailable",
    }
    return HTTPException(status_code=503, detail={"code": code, "message": messages.get(code, "Embedding provider is unavailable")})


def chat_http_error(error: ChatProviderError) -> HTTPException:
    messages = {
        "LLM_AUTH_ERROR": "Chat credential is invalid",
        "LLM_MODEL_CONFIG_INVALID": "Chat model or configuration is invalid",
        "LLM_RATE_LIMITED": "Chat provider rate limited",
        "LLM_PROVIDER_UNAVAILABLE": "Chat provider is unavailable",
        "LLM_MALFORMED_RESPONSE": "Chat provider returned an invalid response",
        "LLM_PROVIDER_ERROR": "Chat provider is unavailable",
    }
    return HTTPException(status_code=503, detail={"code": error.code, "message": messages.get(error.code, "Chat provider is unavailable")})


@app.post("/embeddings/index", response_model=EmbeddingIndexResponse)
def index_embeddings(request: EmbeddingIndexRequest,
                     embedding_key: Annotated[str | None, Header(alias="X-Research-OS-Embedding-Key")] = None) -> EmbeddingIndexResponse:
    try:
        stats: EmbeddingIndexStats = index_chunk_embeddings(RagStore(), embedding_provider(request.embedding, embedding_key), request.paperIds, request.force)
    except (EmbeddingConfigurationError, EmbeddingProviderError) as error:
        raise embedding_http_error(error) from None
    return EmbeddingIndexResponse(status=stats.status, model=stats.model, dimensions=stats.dimensions,
                                  totalChunks=stats.total_chunks, cachedChunks=stats.cached_chunks,
                                  embeddedChunks=stats.embedded_chunks, failedChunks=stats.failed_chunks,
                                  apiRequests=stats.api_requests)


@app.post("/search", response_model=SearchResponse)
def search(request: SearchRequest,
           embedding_key: Annotated[str | None, Header(alias="X-Research-OS-Embedding-Key")] = None) -> SearchResponse:
    store = RagStore()
    if request.mode == "keyword":
        return search_keyword(request, store)
    try:
        provider = embedding_provider(request.embedding, embedding_key)
        if request.mode == "vector":
            return search_vector(request, store, provider, provider.settings.provider, provider.settings.model, provider.settings.dimensions)
        return search_hybrid(request, store, provider, provider.settings.provider, provider.settings.model, provider.settings.dimensions)
    except (EmbeddingConfigurationError, EmbeddingProviderError, VectorIndexEmptyError) as error:
        if request.mode == "hybrid":
            return SearchResponse(mode="hybrid", query=request.query,
                                  results=store.search_chunks_keyword(request.query, request.topK, request.paperIds),
                                  vectorAvailable=False, fallback="keyword", warning="Vector retrieval is unavailable")
        raise embedding_http_error(error) from None


@app.post("/rag/query", response_model=RagQueryResponse)
def rag_query(request: RagQueryRequest,
              embedding_key: Annotated[str | None, Header(alias="X-Research-OS-Embedding-Key")] = None,
              llm_key: Annotated[str | None, Header(alias="X-Research-OS-LLM-Key")] = None) -> RagQueryResponse:
    try:
        return run_rag_query(request, RagStore(),
                             lambda: embedding_provider(request.embedding, embedding_key),
                             lambda: chat_provider(request.chat, llm_key))
    except ChatConfigurationError:
        raise HTTPException(status_code=503, detail={"code": "LLM_NOT_CONFIGURED", "message": "RAG chat provider is not configured"}) from None
    except ChatProviderError as error:
        raise chat_http_error(error) from None
    except (EmbeddingConfigurationError, EmbeddingProviderError, VectorIndexEmptyError) as error:
        raise embedding_http_error(error) from None


@app.post("/providers/embedding/test")
def test_embedding_provider(request: EmbeddingProviderTestRequest,
                            embedding_key: Annotated[str | None, Header(alias="X-Research-OS-Embedding-Key")] = None) -> dict[str, str | int | bool]:
    try:
        provider = embedding_provider(request.embedding, embedding_key)
        provider.embed_texts(["Research OS embedding test"])
        return {"ok": True, "model": provider.settings.model, "dimensions": provider.settings.dimensions}
    except (EmbeddingConfigurationError, EmbeddingProviderError) as error:
        raise embedding_http_error(error) from None


@app.post("/providers/chat/test")
def test_chat_provider(request: ChatProviderTestRequest,
                       llm_key: Annotated[str | None, Header(alias="X-Research-OS-LLM-Key")] = None) -> dict[str, str | bool]:
    try:
        provider = chat_provider(request.chat, llm_key)
        provider = OpenAICompatibleChatProvider(replace(provider.settings, max_tokens=16))
        provider.complete([{"role": "system", "content": "You are a connection test."}, {"role": "user", "content": "Reply with OK."}])
        return {"ok": True, "model": provider.model}
    except ChatConfigurationError:
        raise HTTPException(status_code=503, detail={"code": "LLM_NOT_CONFIGURED", "message": "Chat provider is not configured"}) from None
    except ChatProviderError as error:
        raise chat_http_error(error) from None
