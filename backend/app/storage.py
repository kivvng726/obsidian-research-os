"""Small sqlite3 store for rebuildable Document and Chunk records."""

import os
import sqlite3
from pathlib import Path

from .models import Chunk, Document

DB_SCHEMA_VERSION = 1


def default_database_path() -> Path:
    override = os.getenv("RESEARCH_OS_DB_PATH")
    return Path(override) if override else Path(__file__).resolve().parent.parent / ".data" / "research-os.db"


def get_connection(path: str | Path) -> sqlite3.Connection:
    connection = sqlite3.connect(Path(path))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_database(path: str | Path | None = None) -> Path:
    database_path = Path(path) if path else default_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with get_connection(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
              id TEXT PRIMARY KEY,
              paper_id TEXT NOT NULL,
              type TEXT NOT NULL,
              source_path TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              parser_version TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_documents_paper_id ON documents(paper_id);
            CREATE INDEX IF NOT EXISTS idx_documents_source_path ON documents(source_path);
            CREATE TABLE IF NOT EXISTS chunks (
              id TEXT PRIMARY KEY,
              document_id TEXT NOT NULL,
              paper_id TEXT NOT NULL,
              page_number INTEGER,
              text TEXT NOT NULL,
              start_offset INTEGER,
              end_offset INTEGER,
              chunk_index INTEGER NOT NULL,
              content_hash TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(document_id, chunk_index),
              FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_paper_id ON chunks(paper_id);
            """
        )
        connection.execute(f"PRAGMA user_version = {DB_SCHEMA_VERSION}")
    return database_path


def _timestamp(value) -> str:
    return value.isoformat()


def _document_from_row(row: sqlite3.Row | None) -> Document | None:
    if row is None:
        return None
    return Document.model_validate(dict(row))


def _chunk_from_row(row: sqlite3.Row | None) -> Chunk | None:
    if row is None:
        return None
    return Chunk.model_validate(dict(row))


class RagStore:
    def __init__(self, path: str | Path | None = None):
        self.path = init_database(path)

    def _connection(self) -> sqlite3.Connection:
        return get_connection(self.path)

    def upsert_document(self, document: Document) -> Document:
        with self._connection() as connection:
            connection.execute(
                """INSERT INTO documents (id, paper_id, type, source_path, content_hash, parser_version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET paper_id=excluded.paper_id, type=excluded.type,
                source_path=excluded.source_path, content_hash=excluded.content_hash,
                parser_version=excluded.parser_version, updated_at=excluded.updated_at""",
                (document.id, document.paper_id, document.type, document.source_path, document.content_hash,
                 document.parser_version, _timestamp(document.created_at), _timestamp(document.updated_at)),
            )
        return self.get_document(document.id)  # type: ignore[return-value]

    def get_document(self, document_id: str) -> Document | None:
        with self._connection() as connection:
            return _document_from_row(connection.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone())

    def get_document_by_source_path(self, source_path: str) -> Document | None:
        with self._connection() as connection:
            return _document_from_row(connection.execute("SELECT * FROM documents WHERE source_path = ? ORDER BY updated_at DESC LIMIT 1", (source_path,)).fetchone())

    def list_documents_by_paper(self, paper_id: str) -> list[Document]:
        with self._connection() as connection:
            return [_document_from_row(row) for row in connection.execute("SELECT * FROM documents WHERE paper_id = ? ORDER BY source_path", (paper_id,))]

    def delete_document(self, document_id: str) -> bool:
        with self._connection() as connection:
            return connection.execute("DELETE FROM documents WHERE id = ?", (document_id,)).rowcount > 0

    def upsert_chunk(self, chunk: Chunk) -> Chunk:
        with self._connection() as connection:
            connection.execute(
                """INSERT INTO chunks (id, document_id, paper_id, page_number, text, start_offset, end_offset, chunk_index, content_hash, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(document_id, chunk_index) DO UPDATE SET id=excluded.id, paper_id=excluded.paper_id,
                page_number=excluded.page_number, text=excluded.text, start_offset=excluded.start_offset,
                end_offset=excluded.end_offset, content_hash=excluded.content_hash, updated_at=excluded.updated_at""",
                (chunk.id, chunk.document_id, chunk.paper_id, chunk.page_number, chunk.text, chunk.start_offset,
                 chunk.end_offset, chunk.chunk_index, chunk.content_hash, _timestamp(chunk.created_at), _timestamp(chunk.updated_at)),
            )
        return self.get_chunk(chunk.id)  # type: ignore[return-value]

    def get_chunk(self, chunk_id_value: str) -> Chunk | None:
        with self._connection() as connection:
            return _chunk_from_row(connection.execute("SELECT * FROM chunks WHERE id = ?", (chunk_id_value,)).fetchone())

    def list_chunks_by_document(self, document_id: str) -> list[Chunk]:
        with self._connection() as connection:
            return [_chunk_from_row(row) for row in connection.execute("SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index", (document_id,))]

    def delete_chunks_by_document(self, document_id: str) -> int:
        with self._connection() as connection:
            return connection.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,)).rowcount

    def replace_document_chunks(self, document_id: str, chunks: list[Chunk]) -> list[Chunk]:
        if any(chunk.document_id != document_id for chunk in chunks):
            raise ValueError("all chunks must belong to document_id")
        with self._connection() as connection:
            connection.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
            for chunk in chunks:
                connection.execute(
                    """INSERT INTO chunks (id, document_id, paper_id, page_number, text, start_offset, end_offset, chunk_index, content_hash, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (chunk.id, chunk.document_id, chunk.paper_id, chunk.page_number, chunk.text, chunk.start_offset,
                     chunk.end_offset, chunk.chunk_index, chunk.content_hash, _timestamp(chunk.created_at), _timestamp(chunk.updated_at)),
                )
        return self.list_chunks_by_document(document_id)

    def replace_document(self, document: Document, chunks: list[Chunk]) -> list[Chunk]:
        """Atomically update one Document and replace all of its derived chunks."""
        if any(chunk.document_id != document.id or chunk.paper_id != document.paper_id for chunk in chunks):
            raise ValueError("all chunks must belong to the document")
        with self._connection() as connection:
            connection.execute(
                """INSERT INTO documents (id, paper_id, type, source_path, content_hash, parser_version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET paper_id=excluded.paper_id, type=excluded.type,
                source_path=excluded.source_path, content_hash=excluded.content_hash,
                parser_version=excluded.parser_version, updated_at=excluded.updated_at""",
                (document.id, document.paper_id, document.type, document.source_path, document.content_hash,
                 document.parser_version, _timestamp(document.created_at), _timestamp(document.updated_at)),
            )
            connection.execute("DELETE FROM chunks WHERE document_id = ?", (document.id,))
            for chunk in chunks:
                connection.execute(
                    """INSERT INTO chunks (id, document_id, paper_id, page_number, text, start_offset, end_offset, chunk_index, content_hash, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (chunk.id, chunk.document_id, chunk.paper_id, chunk.page_number, chunk.text, chunk.start_offset,
                     chunk.end_offset, chunk.chunk_index, chunk.content_hash, _timestamp(chunk.created_at), _timestamp(chunk.updated_at)),
                )
        return self.list_chunks_by_document(document.id)
