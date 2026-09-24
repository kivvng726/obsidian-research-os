import fitz
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.identifiers import sha256_bytes
from app.indexing import CHUNK_OVERLAP, CHUNK_SIZE, IndexDocumentRequest, IndexingError, chunk_page_texts, clean_page_text, index_pdf
from app.main import app
from app.models import Document
from app.storage import RagStore


def make_pdf(path, pages: list[str]) -> None:
    if path.exists():
        path.unlink()
    pdf = fitz.open()
    for text in pages:
        page = pdf.new_page()
        if text:
            page.insert_text((72, 72), text)
    pdf.save(path)
    pdf.close()


def request(vault, source_path="09 Attachments/example.pdf", content_hash=None) -> IndexDocumentRequest:
    return IndexDocumentRequest(vaultRoot=str(vault), paperId="paper-001", sourcePath=source_path, contentHash=content_hash)


def test_page_aware_indexing_unchanged_and_changed_pdf(tmp_path) -> None:
    vault = tmp_path / "vault"; attachment_dir = vault / "09 Attachments"; attachment_dir.mkdir(parents=True)
    pdf_path = attachment_dir / "example.pdf"; make_pdf(pdf_path, ["page one text", "page two text"])
    store = RagStore(tmp_path / "derived.db")
    first = index_pdf(request(vault), store)
    assert first.status == "indexed" and first.pageCount == 2 and first.chunkCount == 2
    chunks = store.list_chunks_by_document(first.documentId)
    assert [chunk.page_number for chunk in chunks] == [1, 2]
    assert [chunk.chunk_index for chunk in chunks] == [0, 1]
    assert all(chunk.text == ["page one text", "page two text"][chunk.page_number - 1][chunk.start_offset:chunk.end_offset] for chunk in chunks)
    second = index_pdf(request(vault), store)
    assert second.status == "unchanged" and second.chunkCount == first.chunkCount
    make_pdf(pdf_path, ["changed content"])
    changed = index_pdf(request(vault), store)
    assert changed.status == "indexed" and changed.contentHash != first.contentHash
    assert [chunk.text for chunk in store.list_chunks_by_document(changed.documentId)] == ["changed content"]


def test_chunk_offsets_overlap_and_determinism() -> None:
    text = "x" * (CHUNK_SIZE + 100)
    doc = Document(id="doc-test", paper_id="paper-001", type="pdf", source_path="09 Attachments/a.pdf", content_hash="hash", parser_version="pdf-index-v1")
    chunks = chunk_page_texts(doc, [(1, text), (2, "second page")])
    assert [chunk.chunk_index for chunk in chunks] == [0, 1, 2]
    assert chunks[0].end_offset - chunks[1].start_offset == CHUNK_OVERLAP
    assert all(chunk.text == ([text, "second page"][chunk.page_number - 1][chunk.start_offset:chunk.end_offset]) for chunk in chunks)
    assert [chunk.id for chunk in chunks] == [chunk.id for chunk in chunk_page_texts(doc, [(1, text), (2, "second page")])]


def test_hash_validation_path_safety_missing_non_pdf_and_no_text(tmp_path) -> None:
    vault = tmp_path / "vault"; attachment_dir = vault / "09 Attachments"; attachment_dir.mkdir(parents=True)
    pdf_path = attachment_dir / "empty.pdf"; make_pdf(pdf_path, [""])
    store = RagStore(tmp_path / "derived.db")
    actual_hash = sha256_bytes(pdf_path.read_bytes())
    assert index_pdf(request(vault, "09 Attachments/empty.pdf", actual_hash), store).warning == "no_extractable_text"
    with pytest.raises(IndexingError) as mismatch:
        index_pdf(request(vault, "09 Attachments/empty.pdf", "wrong"), store)
    assert mismatch.value.status_code == 409
    with pytest.raises(ValidationError):
        request(vault, "../secret.pdf")
    with pytest.raises(IndexingError):
        index_pdf(request(vault, "09 Attachments/missing.pdf"), store)
    with pytest.raises(IndexingError):
        index_pdf(request(vault, "09 Attachments/not-pdf.txt"), store)


def test_vault_root_is_not_persisted(tmp_path) -> None:
    vault = tmp_path / "vault"; attachment_dir = vault / "09 Attachments"; attachment_dir.mkdir(parents=True)
    make_pdf(attachment_dir / "example.pdf", ["synthetic"])
    db_path = tmp_path / "derived.db"; store = RagStore(db_path)
    index_pdf(request(vault), store)
    assert str(vault) not in db_path.read_text(encoding="latin1", errors="ignore")


def test_index_route_returns_contract_and_safe_errors(tmp_path, monkeypatch) -> None:
    vault = tmp_path / "vault"; attachment_dir = vault / "09 Attachments"; attachment_dir.mkdir(parents=True)
    make_pdf(attachment_dir / "route.pdf", ["route fixture"])
    monkeypatch.setenv("RESEARCH_OS_DB_PATH", str(tmp_path / "route.db"))
    client = TestClient(app)
    response = client.post("/documents/index", json={"vaultRoot": str(vault), "paperId": "paper-route", "sourcePath": "09 Attachments/route.pdf"})
    assert response.status_code == 200
    assert response.json()["status"] == "indexed"
    assert client.post("/documents/index", json={"vaultRoot": str(vault), "paperId": "paper-route", "sourcePath": "../secret.pdf"}).status_code == 422
