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

`POST /embeddings/index` explicitly creates missing chunk vectors. It does not run during PDF import or ordinary keyword search. The provider is OpenAI-compatible and defaults to `qwen3.7-text-embedding-flash`, 1024 dimensions, and batches of 16. In normal plugin use, credentials and provider configuration arrive only with the current localhost request. `RESEARCH_OS_EMBEDDING_API_KEY` plus optional environment overrides remain a developer fallback.

There is no local embedding model or vector database; vectors come from the configured remote provider and remain a rebuildable local cache.

## Research AI Beta

For ordinary plugin use, configure the local Engine URL plus embedding and chat providers in **Obsidian Settings → Research OS → Research AI / Library AI**. The plugin passes credentials only for the current localhost request; the backend never persists them. Environment variables remain a developer-only fallback.

The Engine runs locally and no local GPU is required. Your Vault files remain local, but text required for AI features is sent to the AI providers you configure: chunk text for embeddings, and your question plus retrieved evidence for grounded RAG answers. API costs belong to your chosen provider account.

## Grounded RAG

`POST /rag/query` reuses the existing keyword, vector, or hybrid retrieval path and assigns temporary evidence IDs `E1...En` in retrieval order. The chat model may cite only those IDs. Citation metadata, including paper, page, offsets, quote, and source-text hash, is created and validated by the backend from retrieval results, never supplied by the model.

Configure the optional OpenAI-compatible chat provider independently in the plugin's Research AI settings. `RESEARCH_OS_LLM_API_KEY`, `RESEARCH_OS_LLM_BASE_URL`, and `RESEARCH_OS_LLM_MODEL` remain a developer fallback. The key is runtime-only and is not persisted by the backend. If no relevant evidence is found, the backend does not call the chat provider.

`grounded: true` means only that the response contains at least one valid evidence marker and no invalid evidence IDs. It does not prove that every statement is factually correct or fully supported. There is currently no reranker, Obsidian RAG UI, citation click-to-PDF behavior, or Agent.

RAG errors use safe codes such as `LLM_NOT_CONFIGURED`, `LLM_AUTH_ERROR`, `LLM_RATE_LIMITED`, `LLM_PROVIDER_ERROR`, and `LLM_MALFORMED_RESPONSE`. Responses never include API keys, authorization headers, prompts, or raw provider bodies.
