# Research OS local backend

This is an optional localhost-only handshake service for Research OS. It does not read or write the Obsidian Vault, call AI providers, or implement RAG.

## Derived storage

`backend/.data/research-os.db` is rebuildable derived storage. The Obsidian Vault remains the source of truth. It stores indexed Documents, page-aware Chunks, SQLite FTS5 rows, and rebuildable embedding vectors; it never stores Vault binaries, Vault roots, or API keys.

## Development setup

Requires Python 3.11 or newer.

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

The service listens only on `127.0.0.1:8765`.

## Handshake endpoints

```powershell
curl http://127.0.0.1:8765/health
curl http://127.0.0.1:8765/version
python -m pytest
```

`/health` reports availability. `/version` reports backend version `0.1.0` and API protocol version `1`.

## PDF indexing API

`POST /documents/index` accepts a runtime Vault root plus a Vault-relative PDF path. The backend only reads that PDF after path-containment validation; it never writes to the Vault. It stores rebuildable page-aware chunks in SQLite.

## Keyword retrieval

`POST /search` performs chunk-level retrieval. `mode: "keyword"` uses SQLite FTS5/BM25 (`score = -bm25`, so higher is better). `mode: "vector"` uses cached remote embeddings with NumPy exact cosine. `mode: "hybrid"` combines the top 30 results from both paths using Reciprocal Rank Fusion (`k=60`); when vectors are unavailable it safely falls back to keyword results.

## Embeddings and hybrid retrieval

`POST /embeddings/index` explicitly creates missing chunk vectors. It does not run during PDF import or ordinary keyword search. The development provider is OpenAI-compatible and defaults to `qwen3.7-text-embedding-flash`, 1024 dimensions, and batches of 16. Set `RESEARCH_OS_EMBEDDING_API_KEY` only in the process environment; optional overrides are `RESEARCH_OS_EMBEDDING_BASE_URL`, `RESEARCH_OS_EMBEDDING_MODEL`, `RESEARCH_OS_EMBEDDING_DIMENSIONS`, and `RESEARCH_OS_EMBEDDING_BATCH_SIZE`.

There is no local embedding model, vector database, LLM answer generation, citation generation, or Agent in this backend.
