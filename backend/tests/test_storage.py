import sqlite3

import pytest
from pydantic import ValidationError

from app.identifiers import chunk_id, document_id, sha256_bytes, sha256_text
from app.models import Chunk, Document, EvidenceSpan
from app.storage import DB_SCHEMA_VERSION, RagStore, get_connection, init_database


def document() -> Document:
    path = "09 Attachments/example.pdf"
    return Document(id=document_id("paper-001", "pdf", path), paper_id="paper-001", type="pdf", source_path=path, content_hash=sha256_bytes(b"synthetic pdf"), parser_version="parser-1")


def chunk(doc: Document, index: int, text: str) -> Chunk:
    content_hash = sha256_text(text)
    return Chunk(id=chunk_id(doc.id, index, content_hash), document_id=doc.id, paper_id=doc.paper_id, page_number=1, text=text, start_offset=index * 10, end_offset=index * 10 + len(text), chunk_index=index, content_hash=content_hash)


def test_init_is_idempotent_and_sets_version(tmp_path) -> None:
    path = tmp_path / "derived.db"
    assert init_database(path) == path
    init_database(path)
    with get_connection(path) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == DB_SCHEMA_VERSION
        assert {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")} >= {"documents", "chunks"}


def test_document_and_chunk_crud_with_cascade(tmp_path) -> None:
    store = RagStore(tmp_path / "derived.db"); doc = document()
    assert store.upsert_document(doc).id == doc.id
    updated = doc.model_copy(update={"parser_version": "parser-2"})
    assert store.upsert_document(updated).parser_version == "parser-2"
    assert store.get_document_by_source_path(doc.source_path).id == doc.id
    assert [item.id for item in store.list_documents_by_paper("paper-001")] == [doc.id]
    first, second = chunk(doc, 0, "first chunk"), chunk(doc, 1, "second chunk")
    store.upsert_chunk(second); store.upsert_chunk(first)
    assert [item.chunk_index for item in store.list_chunks_by_document(doc.id)] == [0, 1]
    assert store.delete_document(doc.id) is True
    assert store.list_chunks_by_document(doc.id) == []


def test_chunk_unique_index_and_replace_is_transactional(tmp_path) -> None:
    store = RagStore(tmp_path / "derived.db"); doc = store.upsert_document(document())
    old = chunk(doc, 0, "old")
    store.upsert_chunk(old)
    replacement = [chunk(doc, 0, "new first"), chunk(doc, 1, "new second")]
    assert [item.text for item in store.replace_document_chunks(doc.id, replacement)] == ["new first", "new second"]
    duplicate_index = [chunk(doc, 0, "broken one"), chunk(doc, 0, "broken two")]
    with pytest.raises(sqlite3.IntegrityError):
        store.replace_document_chunks(doc.id, duplicate_index)
    assert [item.text for item in store.list_chunks_by_document(doc.id)] == ["new first", "new second"]


def test_ids_models_and_path_validation() -> None:
    assert document_id("paper-001", "pdf", "09 Attachments/example.pdf") == document_id("paper-001", "pdf", "09 Attachments/example.pdf")
    assert chunk_id("doc-a", 0, sha256_text("same")) == chunk_id("doc-a", 0, sha256_text("same"))
    assert chunk_id("doc-a", 0, sha256_text("same")) != chunk_id("doc-a", 0, sha256_text("different"))
    evidence = EvidenceSpan(id="evidence-1", chunk_id="chunk-1", document_id="doc-1", paper_id="paper-001", quote="synthetic quote", source_text_hash=sha256_text("synthetic quote"))
    assert EvidenceSpan.model_validate_json(evidence.model_dump_json()).quote == "synthetic quote"
    with pytest.raises(ValidationError):
        Document(id="doc", paper_id="paper", type="pdf", source_path="C:/absolute/file.pdf", content_hash="hash", parser_version="v1")
