from pydantic import BaseModel, Field, field_validator

from .models import SearchResult
from .storage import RagStore


class SearchRequest(BaseModel):
    query: str
    topK: int = Field(default=10, ge=1, le=50)
    paperIds: list[str] = Field(default_factory=list)

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("query must not be empty")
        return value


class SearchResponse(BaseModel):
    mode: str = "keyword"
    query: str
    results: list[SearchResult]


def search_keyword(request: SearchRequest, store: RagStore) -> SearchResponse:
    return SearchResponse(query=request.query, results=store.search_chunks_keyword(request.query, request.topK, request.paperIds))
