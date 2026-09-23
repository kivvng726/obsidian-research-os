# Research OS local backend

This is an optional localhost-only handshake service for Research OS. It does not read or write the Obsidian Vault, call AI providers, or implement RAG.

## Derived storage

`backend/.data/research-os.db` is rebuildable derived storage. The Obsidian Vault remains the source of truth. The current database only stores Document and Chunk metadata/text fixtures; it has no PDF parsing, embeddings, retrieval, or RAG.

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
