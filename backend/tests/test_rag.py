import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.chat import ChatConfigurationError, ChatProviderError
from app.config import EmbeddingConfigurationError, EmbeddingSettings
from app.embeddings import OpenAICompatibleEmbeddingProvider
from app.identifiers import chunk_id, document_id, sha256_text
from app.main import app
from app.models import Chunk, Document, SearchResult
from app.rag import (MAX_CONTEXT_CHARS, NO_EVIDENCE_ANSWER, RagQueryRequest, build_evidence_spans,
                     build_rag_context, extract_citation_ids, run_rag_query, validate_citations)
from app.storage import RagStore


def result(index: int, text: str, *, chunk_value: str | None = None) -> SearchResult:
    return SearchResult(chunk_id=chunk_value or f"chunk-{index}", document_id="doc-1", paper_id="paper-1",
                        page_number=index, text=text, start_offset=100, end_offset=100 + len(text),
                        score=1 / index, rank=index)


def document(paper_id="paper-1") -> Document:
    path = f"09 Attachments/{paper_id}.pdf"
    return Document(id=document_id(paper_id, "pdf", path), paper_id=paper_id, type="pdf", source_path=path,
                    content_hash="pdf-hash", parser_version="pdf-index-v1")


def chunk(doc: Document, index: int, text: str) -> Chunk:
    content_hash = sha256_text(text)
    return Chunk(id=chunk_id(doc.id, index, content_hash), document_id=doc.id, paper_id=doc.paper_id,
                 page_number=index + 1, text=text, start_offset=0, end_offset=len(text),
                 chunk_index=index, content_hash=content_hash)


class FakeChat:
    model = "test-chat"

    def __init__(self, answer: str):
        self.answer = answer
        self.calls = []

    def complete(self, messages):
        self.calls.append(messages)
        return self.answer


def test_evidence_construction_preserves_source_and_truncates_offsets() -> None:
    full_text = "x" * 4000
    evidence = build_evidence_spans([result(1, full_text), result(2, "duplicate", chunk_value="chunk-1")])
    assert [item.id for item in evidence] == ["E1"]
    assert len(evidence[0].quote) == 3000
    assert evidence[0].start_offset == 100 and evidence[0].end_offset == 3100
    assert evidence[0].source_text_hash == sha256_text(full_text)
    assert len(build_rag_context(build_evidence_spans([result(index, "z" * 4000) for index in range(1, 8)]))) <= MAX_CONTEXT_CHARS


def test_citation_parser_and_validator() -> None:
    assert extract_citation_ids("[E1][E2] again [E1] and [E12]") == ["E1", "E2", "E12"]
    assert extract_citation_ids("[E] [E-1] [1]") == []
    evidence = build_evidence_spans([result(1, "one"), result(2, "two")])
    valid, invalid, grounded = validate_citations("Claim [E1][E2]", evidence)
    assert [item.id for item in valid] == ["E1", "E2"] and invalid == [] and grounded is True
    valid, invalid, grounded = validate_citations("Claim [E1][E999]", evidence)
    assert [item.id for item in valid] == ["E1"] and invalid == ["E999"] and grounded is False
    assert validate_citations("No citation", evidence)[2] is False
    assert validate_citations("Only invalid [E999]", evidence)[2] is False


def test_no_evidence_never_constructs_chat_provider(tmp_path) -> None:
    calls = {"chat": 0}
    def chat_factory():
        calls["chat"] += 1
        raise AssertionError("chat provider must not be constructed")
    response = run_rag_query(RagQueryRequest(query="missing", searchMode="keyword"), RagStore(tmp_path / "empty.db"),
                             lambda: (_ for _ in ()).throw(AssertionError("embedding not needed")), chat_factory)
    assert response.answer == NO_EVIDENCE_ANSWER and response.grounded is False and calls["chat"] == 0


def test_rag_pipeline_valid_invalid_no_citation_and_filter(tmp_path) -> None:
    store = RagStore(tmp_path / "rag.db"); first = document("paper-1"); second = document("paper-2")
    store.replace_document(first, [chunk(first, 0, "multi agent collaboration evidence")])
    store.replace_document(second, [chunk(second, 0, "other paper collaboration evidence")])
    chat = FakeChat("The method uses collaboration [E1].")
    response = run_rag_query(RagQueryRequest(query="collaboration", paperIds=["paper-1"], retrievalTopK=1, searchMode="keyword"),
                             store, lambda: None, lambda: chat)
    assert response.grounded is True and response.citations[0].paper_id == "paper-1" and len(chat.calls) == 1
    invalid = FakeChat("Unsupported marker [E999].")
    response = run_rag_query(RagQueryRequest(query="collaboration", searchMode="keyword"), store, lambda: None, lambda: invalid)
    assert response.grounded is False and response.invalidCitationIds == ["E999"] and response.citations == []
    uncited = FakeChat("An answer without a marker.")
    assert run_rag_query(RagQueryRequest(query="collaboration", searchMode="keyword"), store, lambda: None, lambda: uncited).grounded is False


def test_hybrid_falls_back_to_keyword_and_provider_failure_preserves_storage(tmp_path) -> None:
    store = RagStore(tmp_path / "fallback.db"); doc = document(); item = chunk(doc, 0, "fallback searchable evidence")
    store.replace_document(doc, [item])
    chat = FakeChat("Fallback answer [E1].")
    response = run_rag_query(RagQueryRequest(query="fallback searchable", searchMode="hybrid"), store,
                             lambda: (_ for _ in ()).throw(EmbeddingConfigurationError("missing embedding")), lambda: chat)
    assert response.retrieval.fallback == "keyword" and response.grounded is True
    failing = FakeChat("")
    failing.complete = lambda _messages: (_ for _ in ()).throw(ChatProviderError("unavailable"))
    with pytest.raises(ChatProviderError):
        run_rag_query(RagQueryRequest(query="fallback", searchMode="keyword"), store, lambda: None, lambda: failing)
    assert store.get_chunk(item.id).text == item.text


def test_rag_api_success_no_evidence_and_config_error(tmp_path, monkeypatch) -> None:
    database = tmp_path / "api.db"; store = RagStore(database); doc = document(); item = chunk(doc, 0, "api grounded evidence")
    store.replace_document(doc, [item]); monkeypatch.setenv("RESEARCH_OS_DB_PATH", str(database))
    monkeypatch.setattr(main_module, "chat_provider", lambda: FakeChat("API answer [E1]."))
    client = TestClient(app)
    response = client.post("/rag/query", json={"query": "api grounded", "paperIds": ["paper-1"], "retrievalTopK": 6, "searchMode": "keyword"})
    assert response.status_code == 200 and response.json()["grounded"] is True and response.json()["citations"][0]["pageNumber"] == 1
    no_evidence = client.post("/rag/query", json={"query": "zzzxxyy", "searchMode": "keyword"})
    assert no_evidence.status_code == 200 and no_evidence.json()["model"] is None
    monkeypatch.setattr(main_module, "chat_provider", lambda: (_ for _ in ()).throw(ChatConfigurationError("missing")))
    not_configured = client.post("/rag/query", json={"query": "api grounded", "searchMode": "keyword"})
    assert not_configured.status_code == 503 and not_configured.json()["detail"]["code"] == "LLM_NOT_CONFIGURED"
    monkeypatch.setattr(main_module, "chat_provider", lambda: (_ for _ in ()).throw(ChatProviderError("private remote detail")))
    provider_error = client.post("/rag/query", json={"query": "api grounded", "searchMode": "keyword"})
    assert provider_error.status_code == 503 and provider_error.json()["detail"]["code"] == "LLM_PROVIDER_ERROR"
    assert client.post("/rag/query", json={"query": ""}).status_code == 422


def test_rag_api_vector_and_hybrid_modes(tmp_path, monkeypatch) -> None:
    database = tmp_path / "api-semantic.db"; store = RagStore(database); doc = document(); item = chunk(doc, 0, "semantic evidence")
    store.replace_document(doc, [item]); store.upsert_chunk_embedding(item, "openai-compatible", "test-embedding", 3, [1, 0, 0])
    monkeypatch.setenv("RESEARCH_OS_DB_PATH", str(database))
    embedding_settings = EmbeddingSettings(api_key="test", base_url="https://example.invalid/v1", model="test-embedding",
                                           dimensions=3, batch_size=1, timeout_seconds=1)
    embedding = OpenAICompatibleEmbeddingProvider(embedding_settings,
                                                   transport=lambda _: {"data": [{"index": 0, "embedding": [1, 0, 0]}]})
    monkeypatch.setattr(main_module, "embedding_provider", lambda: embedding)
    monkeypatch.setattr(main_module, "chat_provider", lambda: FakeChat("Semantic answer [E1]."))
    client = TestClient(app)
    vector = client.post("/rag/query", json={"query": "semantic", "searchMode": "vector"})
    hybrid = client.post("/rag/query", json={"query": "semantic", "searchMode": "hybrid"})
    assert vector.status_code == 200 and vector.json()["retrieval"]["mode"] == "vector"
    assert hybrid.status_code == 200 and hybrid.json()["retrieval"]["mode"] == "hybrid"
