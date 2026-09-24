"""Safe, deterministic PDF-to-Chunk indexing. No Vault writes occur here."""

import re
from pathlib import Path

import fitz
from pydantic import BaseModel, Field, field_validator

from .identifiers import chunk_id, document_id, sha256_bytes, sha256_text
from .models import Chunk, Document, validate_vault_relative_path
from .storage import RagStore

PDF_INDEX_VERSION = "pdf-index-v1"
CHUNK_SIZE = 4000
CHUNK_OVERLAP = 500


class IndexDocumentRequest(BaseModel):
    vaultRoot: str = Field(min_length=1)
    paperId: str = Field(min_length=1)
    sourcePath: str
    contentHash: str | None = None

    _relative_source_path = field_validator("sourcePath")(validate_vault_relative_path)


class IndexDocumentResponse(BaseModel):
    status: str
    documentId: str
    paperId: str
    sourcePath: str
    contentHash: str
    pageCount: int
    chunkCount: int
    parserVersion: str
    warning: str | None = None


class IndexingError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def resolve_pdf_path(vault_root: str, source_path: str) -> Path:
    root = Path(vault_root).expanduser().resolve()
    if not root.is_absolute() or not root.is_dir():
        raise IndexingError(400, "Vault root is invalid")
    try:
        relative = validate_vault_relative_path(source_path)
        resolved = (root / relative).resolve()
        resolved.relative_to(root)
    except (ValueError, OSError):
        raise IndexingError(400, "Source path must remain inside the Vault") from None
    if resolved.suffix.lower() != ".pdf":
        raise IndexingError(400, "Source path must reference a PDF")
    if not resolved.is_file():
        raise IndexingError(404, "PDF was not found")
    return resolved


def clean_page_text(text: str) -> str:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = "\n".join(re.sub(r"[ \t]+", " ", line).strip() for line in normalized.split("\n"))
    return re.sub(r"\n{3,}", "\n\n", normalized).strip()


def extract_page_texts(pdf_path: Path) -> list[tuple[int, str]]:
    try:
        with fitz.open(pdf_path) as pdf:
            return [(page_number, clean_page_text(page.get_text("text"))) for page_number, page in enumerate(pdf, start=1)]
    except fitz.FileDataError:
        raise IndexingError(400, "PDF could not be parsed") from None


def chunk_page_texts(document: Document, pages: list[tuple[int, str]]) -> list[Chunk]:
    chunks: list[Chunk] = []
    global_index = 0
    for page_number, text in pages:
        if not text:
            continue
        start = 0
        while start < len(text):
            end = min(start + CHUNK_SIZE, len(text))
            chunk_text = text[start:end]
            content_hash = sha256_text(chunk_text)
            chunks.append(Chunk(
                id=chunk_id(document.id, global_index, content_hash), document_id=document.id,
                paper_id=document.paper_id, page_number=page_number, text=chunk_text,
                start_offset=start, end_offset=end, chunk_index=global_index, content_hash=content_hash,
            ))
            global_index += 1
            if end == len(text):
                break
            start = max(start + 1, end - CHUNK_OVERLAP)
    return chunks


def index_pdf(request: IndexDocumentRequest, store: RagStore) -> IndexDocumentResponse:
    pdf_path = resolve_pdf_path(request.vaultRoot, request.sourcePath)
    pdf_bytes = pdf_path.read_bytes()
    actual_hash = sha256_bytes(pdf_bytes)
    if request.contentHash and request.contentHash != actual_hash:
        raise IndexingError(409, "Provided content hash does not match the PDF")

    existing = store.get_document_by_source_path(request.sourcePath)
    if existing and existing.paper_id == request.paperId and existing.content_hash == actual_hash and existing.parser_version == PDF_INDEX_VERSION:
        existing_chunks = store.list_chunks_by_document(existing.id)
        return IndexDocumentResponse(status="unchanged", documentId=existing.id, paperId=existing.paper_id,
                                     sourcePath=existing.source_path, contentHash=existing.content_hash,
                                     pageCount=0, chunkCount=len(existing_chunks), parserVersion=existing.parser_version)

    pages = extract_page_texts(pdf_path)
    doc = Document(id=document_id(request.paperId, "pdf", request.sourcePath), paper_id=request.paperId, type="pdf",
                   source_path=request.sourcePath, content_hash=actual_hash, parser_version=PDF_INDEX_VERSION)
    chunks = chunk_page_texts(doc, pages)
    store.replace_document(doc, chunks)
    return IndexDocumentResponse(status="indexed", documentId=doc.id, paperId=doc.paper_id,
                                 sourcePath=doc.source_path, contentHash=actual_hash, pageCount=len(pages),
                                 chunkCount=len(chunks), parserVersion=PDF_INDEX_VERSION,
                                 warning="no_extractable_text" if not chunks else None)
