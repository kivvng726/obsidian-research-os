import sqlite3

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.config import EmbeddingSettings
from app.embeddings import EmbeddingProviderError, OpenAICompatibleEmbeddingProvider, index_chunk_embeddings
from app.identifiers import chunk_id, document_id, sha256_text
from app.main import app
from app.models import Chunk, Document
from app.retrieval import RRF_K, SearchRequest, reciprocal_rank_fusion, search_hybrid, search_vector
from app.storage import RagStore, get_connection


def make_document(paper_id="paper-a") -> Document:
    path = f"09 Attachments/{paper_id}.pdf"
    return Document(id=document_id(paper_id, "pdf", path), paper_id=paper_id, type="pdf", source_path=path,
                    content_hash="pdf-hash", parser_version="pdf-index-v1")


def make_chunk(document: Document, index: int, text: str) -> Chunk:
    text_hash = sha256_text(text)
    return Chunk(id=chunk_id(document.id, index, text_hash), document_id=document.id, paper_id=document.paper_id,
                 page_number=1, text=text, start_offset=0, end_offset=len(text), chunk_index=index, content_hash=text_hash)


def settings() -> EmbeddingSettings:
    return EmbeddingSettings(api_key="test-secret", base_url="https://example.invalid/v1", model="test-model",
                             dimensions=3, batch_size=2, timeout_seconds=1)


def provider(vectors, *, batch_size=2):
    config = settings().__class__(**{**settings().__dict__, "batch_size": batch_size})
    calls = []
    def transport(payload):
        calls.append(payload)
        return {"data": [{"index": index, "embedding": vectors[text]} for index, text in enumerate(payload["input"])]}
    instance = OpenAICompatibleEmbeddingProvider(config, transport=transport)
    instance.calls = calls
    return instance


def test_provider_batches_orders_and_sanitizes_errors() -> None:
    vectors = {"one": [1, 0, 0], "two": [0, 1, 0], "three": [0, 0, 1]}
    instance = provider(vectors)
    assert instance.embed_texts(["one", "two", "three"]) == [vectors["one"], vectors["two"], vectors["three"]]
    assert len(instance.calls) == 2
    bad = OpenAICompatibleEmbeddingProvider(settings(), transport=lambda _: {"data": [{"embedding": [1, 2]}]})
    with pytest.raises(EmbeddingProviderError, match="unexpected vector"):
        bad.embed_texts(["x"])
    auth = OpenAICompatibleEmbeddingProvider(settings(), transport=lambda _: (_ for _ in ()).throw(Exception("test-secret")))
    with pytest.raises(EmbeddingProviderError) as error:
        auth.embed_texts(["x"])
    assert "test-secret" not in str(error.value)


def test_embedding_cache_vector_search_rrf_and_cascade(tmp_path) -> None:
    store = RagStore(tmp_path / "vectors.db")
    first, second = make_document("paper-a"), make_document("paper-b")
    first_chunk = make_chunk(first, 0, "credit assignment for multiple agents")
    second_chunk = make_chunk(second, 0, "unrelated biology article")
    store.replace_document(first, [first_chunk]); store.replace_document(second, [second_chunk])
    instance = provider({first_chunk.text: [1, 0, 0], second_chunk.text: [0, 1, 0]})
    stats = index_chunk_embeddings(store, instance)
    assert (stats.total_chunks, stats.embedded_chunks, stats.cached_chunks) == (2, 2, 0)
    assert index_chunk_embeddings(store, instance).cached_chunks == 2
    vector = store.search_chunks_vector([1, 0, 0], 10, "openai-compatible", "test-model", 3)
    assert vector[0].chunk_id == first_chunk.id and vector[0].score > vector[1].score
    assert [result.paper_id for result in store.search_chunks_vector([1, 0, 0], 10, "openai-compatible", "test-model", 3, ["paper-b"])] == ["paper-b"]
    keyword = store.search_chunks_keyword("credit assignment", 10)
    fused = reciprocal_rank_fusion(keyword, vector, 10)
    assert fused[0].chunk_id == first_chunk.id and fused[0].keyword_rank == 1 and fused[0].vector_rank == 1
    assert fused[0].score == pytest.approx(2 / (RRF_K + 1))
    store.delete_document(first.id)
    assert store.count_chunk_embeddings() == 1


def test_embedding_force_and_replacement_rolls_back(tmp_path) -> None:
    store = RagStore(tmp_path / "force.db"); document = make_document(); old = make_chunk(document, 0, "old embedding text")
    store.replace_document(document, [old])
    instance = provider({old.text: [1, 0, 0]})
    assert index_chunk_embeddings(store, instance).embedded_chunks == 1
    assert index_chunk_embeddings(store, instance, force=True).embedded_chunks == 1
    replacement = make_chunk(document, 0, "new embedding text")
    store.replace_document(document, [replacement])
    assert store.count_chunk_embeddings() == 0
    duplicate = [make_chunk(document, 0, "broken one"), make_chunk(document, 0, "broken two")]
    with pytest.raises(sqlite3.IntegrityError):
        store.replace_document(document, duplicate)
    assert store.list_chunks_by_document(document.id)[0].id == replacement.id


def test_vector_and_hybrid_behaviors_without_real_provider(tmp_path) -> None:
    store = RagStore(tmp_path / "hybrid.db"); document = make_document(); chunk = make_chunk(document, 0, "graph credit assignment")
    store.replace_document(document, [chunk])
    request = SearchRequest(query="credit assignment", mode="hybrid")
    unavailable = OpenAICompatibleEmbeddingProvider(settings(), transport=lambda _: (_ for _ in ()).throw(EmbeddingProviderError("provider unavailable")))
    response = search_hybrid(request, store, unavailable, "openai-compatible", "test-model", 3)
    assert response.fallback == "keyword" and response.vectorAvailable is False and response.results
    empty_provider = provider({request.query: [1, 0, 0]})
    with pytest.raises(Exception):
        search_vector(SearchRequest(query=request.query, mode="vector"), store, empty_provider, "openai-compatible", "test-model", 3)


def test_api_keyword_works_without_key_and_embedding_config_is_safe(tmp_path, monkeypatch) -> None:
    database = tmp_path / "api.db"; store = RagStore(database); document = make_document(); chunk = make_chunk(document, 0, "keyword survives")
    store.replace_document(document, [chunk]); monkeypatch.setenv("RESEARCH_OS_DB_PATH", str(database)); monkeypatch.delenv("RESEARCH_OS_EMBEDDING_API_KEY", raising=False)
    client = TestClient(app)
    assert client.post("/search", json={"query": "keyword", "mode": "keyword"}).status_code == 200
    vector = client.post("/search", json={"query": "keyword", "mode": "vector"})
    assert vector.status_code == 503 and vector.json()["detail"]["code"] == "EMBEDDING_CONFIG_ERROR"
    hybrid = client.post("/search", json={"query": "keyword", "mode": "hybrid"})
    assert hybrid.status_code == 200 and hybrid.json()["fallback"] == "keyword"
    indexing = client.post("/embeddings/index", json={"paperIds": ["paper-a"], "force": False})
    assert indexing.status_code == 503 and "API" not in str(indexing.json())


def test_api_embedding_index_vector_and_hybrid_with_mock_provider(tmp_path, monkeypatch) -> None:
    database = tmp_path / "api-vector.db"; store = RagStore(database); document = make_document(); chunk = make_chunk(document, 0, "multi agent credit assignment")
    store.replace_document(document, [chunk]); monkeypatch.setenv("RESEARCH_OS_DB_PATH", str(database))
    instance = provider({chunk.text: [1, 0, 0], "credit assignment": [1, 0, 0]})
    monkeypatch.setattr(main_module, "embedding_provider", lambda *_: instance)
    client = TestClient(app)
    indexed = client.post("/embeddings/index", json={"paperIds": ["paper-a"], "force": False})
    assert indexed.status_code == 200 and indexed.json()["embeddedChunks"] == 1
    vector = client.post("/search", json={"query": "credit assignment", "mode": "vector"})
    assert vector.status_code == 200 and vector.json()["mode"] == "vector" and vector.json()["results"][0]["paperId"] == "paper-a"
    hybrid = client.post("/search", json={"query": "credit assignment", "mode": "hybrid"})
    assert hybrid.status_code == 200 and hybrid.json()["vectorAvailable"] is True
