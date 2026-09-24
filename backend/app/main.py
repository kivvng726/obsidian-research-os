from fastapi import FastAPI

from .indexing import IndexDocumentRequest, IndexDocumentResponse, IndexingError, index_pdf
from .storage import RagStore
from .retrieval import SearchRequest, SearchResponse, search_keyword

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
        from fastapi import HTTPException
        raise HTTPException(status_code=error.status_code, detail=error.message) from None


@app.post("/search", response_model=SearchResponse)
def search(request: SearchRequest) -> SearchResponse:
    return search_keyword(request, RagStore())
