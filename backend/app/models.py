"""Derived RAG records. They never contain Vault binary data."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def validate_vault_relative_path(value: str) -> str:
    path = value.replace("\\", "/").strip()
    if not path or path.startswith("/") or ":" in path.split("/")[0] or path.startswith("../"):
        raise ValueError("source_path must be Vault-relative")
    return path


class Document(BaseModel):
    id: str = Field(min_length=1)
    paper_id: str = Field(min_length=1)
    type: Literal["pdf"]
    source_path: str
    content_hash: str = Field(min_length=1)
    parser_version: str = Field(min_length=1)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    _relative_source_path = field_validator("source_path")(validate_vault_relative_path)


class Chunk(BaseModel):
    id: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    paper_id: str = Field(min_length=1)
    page_number: int | None = Field(default=None, ge=1)
    text: str = Field(min_length=1)
    start_offset: int | None = Field(default=None, ge=0)
    end_offset: int | None = Field(default=None, ge=0)
    chunk_index: int = Field(ge=0)
    content_hash: str = Field(min_length=1)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class EvidenceSpan(BaseModel):
    """A citeable subrange selected from a retrieved Chunk; not persisted yet."""

    id: str = Field(min_length=1)
    chunk_id: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    paper_id: str = Field(min_length=1)
    page_number: int | None = Field(default=None, ge=1)
    quote: str = Field(min_length=1)
    start_offset: int | None = Field(default=None, ge=0)
    end_offset: int | None = Field(default=None, ge=0)
    source_text_hash: str = Field(min_length=1)


class SearchResult(BaseModel):
    model_config = ConfigDict(serialize_by_alias=True)
    chunk_id: str = Field(serialization_alias="chunkId")
    document_id: str = Field(serialization_alias="documentId")
    paper_id: str = Field(serialization_alias="paperId")
    page_number: int | None = Field(serialization_alias="pageNumber")
    text: str
    start_offset: int | None = Field(serialization_alias="startOffset")
    end_offset: int | None = Field(serialization_alias="endOffset")
    score: float
    rank: int = Field(ge=1)
