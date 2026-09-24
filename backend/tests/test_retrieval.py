import sqlite3

import fitz
import pytest
from fastapi.testclient import TestClient

from app.identifiers import chunk_id, document_id, sha256_text
from app.indexing import IndexDocumentRequest, index_pdf
from app.main import app
from app.models import Chunk, Document
from app.retrieval import SearchRequest
from app.storage import DB_SCHEMA_VERSION, RagStore, get_connection


def document(paper_id="paper-001", source_path="09 Attachments/example.pdf", content_hash="pdf-hash") -> Document:
    return Document(id=document_id(paper_id, "pdf", source_path), paper_id=paper_id, type="pdf", source_path=source_path, content_hash=content_hash, parser_version="pdf-index-v1")


def chunk(doc: Document, index: int, text: str) -> Chunk:
    text_hash = sha256_text(text)
    return Chunk(id=chunk_id(doc.id, index, text_hash), document_id=doc.id, paper_id=doc.paper_id,
                 page_number=index + 1, text=text, start_offset=0, end_offset=len(text),
                 chunk_index=index, content_hash=text_hash)


def make_v1_database(path) -> None:
    with sqlite3.connect(path) as connection:
        connection.executescript("""
            CREATE TABLE documents (id TEXT PRIMARY KEY, paper_id TEXT NOT NULL, type TEXT NOT NULL, source_path TEXT NOT NULL, content_hash TEXT NOT NULL, parser_version TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, paper_id TEXT NOT NULL, page_number INTEGER, text TEXT NOT NULL, start_offset INTEGER, end_offset INTEGER, chunk_index INTEGER NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(document_id, chunk_index), FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE);
            PRAGMA user_version = 1;
        """)
        doc = document(); old = chunk(doc, 0, "legacy keyword retrieval")
        connection.execute("INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (doc.id, doc.paper_id, doc.type, doc.source_path, doc.content_hash, doc.parser_version, doc.created_at.isoformat(), doc.updated_at.isoformat()))
        connection.execute("INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (old.id, old.document_id, old.paper_id, old.page_number, old.text, old.start_offset, old.end_offset, old.chunk_index, old.content_hash, old.created_at.isoformat(), old.updated_at.isoformat()))


def test_v1_migration_backfills_fts_and_searches(tmp_path) -> None:
    path = tmp_path / "v1.db"; make_v1_database(path)
    store = RagStore(path)
    with get_connection(path) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == DB_SCHEMA_VERSION == 2
        assert connection.execute("SELECT count(*) FROM chunk_fts").fetchone()[0] == 1
    assert store.search_chunks_keyword("legacy keyword")[0].text == "legacy keyword retrieval"


def test_keyword_ranking_filters_and_safe_query(tmp_path) -> None:
    store = RagStore(tmp_path / "search.db")
    first = document("paper-a", "09 Attachments/a.pdf"); second = document("paper-b", "09 Attachments/b.pdf")
    store.replace_document(first, [chunk(first, 0, "graph neural networks graph neural networks"), chunk(first, 1, "unrelated biology")])
    store.replace_document(second, [chunk(second, 0, "graph neural networks")])
    results = store.search_chunks_keyword("graph neural networks", top_k=10)
    assert [result.paper_id for result in results] == ["paper-a", "paper-b"]
    assert results[0].score >= results[1].score and [result.rank for result in results] == [1, 2]
    assert store.search_chunks_keyword("graph", top_k=1)[0].paper_id == "paper-a"
    assert [result.paper_id for result in store.search_chunks_keyword("graph", paper_ids=["paper-b"])] == ["paper-b"]
    assert store.search_chunks_keyword("zzzxxyy_nonexistent_token") == []
    assert isinstance(store.search_chunks_keyword('" OR NEAR * : --'), list)
    with pytest.raises(ValueError):
        store.search_chunks_keyword("   ")


def test_fts_sync_delete_and_transaction_rollback(tmp_path) -> None:
    store = RagStore(tmp_path / "sync.db"); doc = document()
    old = chunk(doc, 0, "old searchable phrase")
    store.replace_document(doc, [old])
    assert store.search_chunks_keyword("old searchable")
    replacement = chunk(doc, 0, "new searchable phrase")
    store.replace_document(doc, [replacement])
    assert store.search_chunks_keyword("old searchable") == []
    assert store.search_chunks_keyword("new searchable")[0].chunk_id == replacement.id
    duplicate = [chunk(doc, 0, "broken one"), chunk(doc, 0, "broken two")]
    with pytest.raises(sqlite3.IntegrityError):
        store.replace_document(doc.model_copy(update={"content_hash": "new-pdf-hash"}), duplicate)
    assert store.search_chunks_keyword("new searchable")[0].chunk_id == replacement.id
    store.delete_document(doc.id)
    assert store.search_chunks_keyword("new searchable") == []


def make_pdf(path, text: str) -> None:
    pdf = fitz.open(); page = pdf.new_page(); page.insert_text((72, 72), text); pdf.save(path); pdf.close()


def test_pdf_reindex_replaces_searchable_fts_rows_and_api(tmp_path, monkeypatch) -> None:
    vault = tmp_path / "vault"; attachments = vault / "09 Attachments"; attachments.mkdir(parents=True)
    pdf_path = attachments / "fixture.pdf"; make_pdf(pdf_path, "oldindexterm")
    database = tmp_path / "api.db"; store = RagStore(database)
    request = IndexDocumentRequest(vaultRoot=str(vault), paperId="paper-index", sourcePath="09 Attachments/fixture.pdf")
    index_pdf(request, store)
    assert store.search_chunks_keyword("oldindexterm")
    pdf_path.unlink(); make_pdf(pdf_path, "newindexterm")
    index_pdf(request, store)
    assert store.search_chunks_keyword("oldindexterm") == []
    assert store.search_chunks_keyword("newindexterm")
    monkeypatch.setenv("RESEARCH_OS_DB_PATH", str(database))
    response = TestClient(app).post("/search", json={"query": "newindexterm", "topK": 5, "paperIds": ["paper-index"]})
    assert response.status_code == 200
    body = response.json(); assert body["mode"] == "keyword" and body["results"][0]["paperId"] == "paper-index"
    assert TestClient(app).post("/search", json={"query": "   "}).status_code == 422
