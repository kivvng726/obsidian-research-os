from fastapi import FastAPI, HTTPException

from .config import EmbeddingConfigurationError, EmbeddingSettings
from .embeddings import EmbeddingIndexRequest, EmbeddingIndexResponse, EmbeddingIndexStats, EmbeddingProviderError, OpenAICompatibleEmbeddingProvider, index_chunk_embeddings
from .indexing import IndexDocumentRequest, IndexDocumentResponse, IndexingError, index_pdf
from .storage import RagStore
from .retrieval import SearchRequest, SearchResponse, VectorIndexEmptyError, search_hybrid, search_keyword, search_vector

BACKEND_VERSION = "0.1.0"
API_VERSION = 1

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


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


def embedding_provider() -> OpenAICompatibleEmbeddingProvider:
    return OpenAICompatibleEmbeddingProvider(EmbeddingSettings.from_env())


def embedding_http_error(error: Exception) -> HTTPException:
    if isinstance(error, EmbeddingConfigurationError):
        return HTTPException(status_code=503, detail={"code": "EMBEDDING_CONFIG_ERROR", "message": "Embedding provider is not configured"})
    if isinstance(error, VectorIndexEmptyError):
        return HTTPException(status_code=409, detail={"code": "EMBEDDING_INDEX_EMPTY", "message": "No compatible cached embeddings are available"})
    return HTTPException(status_code=503, detail={"code": "EMBEDDING_PROVIDER_UNAVAILABLE", "message": "Embedding provider is unavailable"})


@app.post("/embeddings/index", response_model=EmbeddingIndexResponse)
def index_embeddings(request: EmbeddingIndexRequest) -> EmbeddingIndexResponse:
    try:
        stats: EmbeddingIndexStats = index_chunk_embeddings(RagStore(), embedding_provider(), request.paperIds, request.force)
    except (EmbeddingConfigurationError, EmbeddingProviderError) as error:
        raise embedding_http_error(error) from None
    return EmbeddingIndexResponse(status=stats.status, model=stats.model, dimensions=stats.dimensions,
                                  totalChunks=stats.total_chunks, cachedChunks=stats.cached_chunks,
                                  embeddedChunks=stats.embedded_chunks, failedChunks=stats.failed_chunks,
                                  apiRequests=stats.api_requests)


@app.post("/search", response_model=SearchResponse)
def search(request: SearchRequest) -> SearchResponse:
    store = RagStore()
    if request.mode == "keyword":
        return search_keyword(request, store)
    try:
        provider = embedding_provider()
        if request.mode == "vector":
            return search_vector(request, store, provider, provider.settings.provider, provider.settings.model, provider.settings.dimensions)
        return search_hybrid(request, store, provider, provider.settings.provider, provider.settings.model, provider.settings.dimensions)
    except (EmbeddingConfigurationError, EmbeddingProviderError, VectorIndexEmptyError) as error:
        if request.mode == "hybrid":
            return SearchResponse(mode="hybrid", query=request.query,
                                  results=store.search_chunks_keyword(request.query, request.topK, request.paperIds),
                                  vectorAvailable=False, fallback="keyword", warning="Vector retrieval is unavailable")
        raise embedding_http_error(error) from None
