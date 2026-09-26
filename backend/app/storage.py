"""Small sqlite3 store for rebuildable Document and Chunk records."""

import sqlite3
from pathlib import Path

from .models import Chunk, Document, SearchResult
from .runtime_paths import get_db_path

DB_SCHEMA_VERSION = 3


def default_database_path() -> Path:
    return get_db_path()


def get_connection(path: str | Path) -> sqlite3.Connection:
    connection = sqlite3.connect(Path(path))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_database(path: str | Path | None = None) -> Path:
    database_path = Path(path) if path else default_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with get_connection(database_path) as connection:
        current_version = connection.execute("PRAGMA user_version").fetchone()[0]
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
        connection.execute("""CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
            chunk_id UNINDEXED, paper_id UNINDEXED, document_id UNINDEXED, text,
            tokenize='unicode61'
        )""")
        if current_version < 2:
            connection.execute("DELETE FROM chunk_fts")
            connection.execute("""INSERT INTO chunk_fts (chunk_id, paper_id, document_id, text)
                                SELECT id, paper_id, document_id, text FROM chunks""")
        connection.execute("""CREATE TABLE IF NOT EXISTS chunk_embeddings (
            chunk_id TEXT NOT NULL, model TEXT NOT NULL, dimensions INTEGER NOT NULL,
            provider TEXT NOT NULL, content_hash TEXT NOT NULL, vector BLOB NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            UNIQUE(chunk_id, model, dimensions, provider),
            FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
        )""")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_lookup ON chunk_embeddings(provider, model, dimensions, chunk_id)")
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

    @staticmethod
    def _insert_fts(connection: sqlite3.Connection, chunk: Chunk) -> None:
        connection.execute("INSERT INTO chunk_fts (chunk_id, paper_id, document_id, text) VALUES (?, ?, ?, ?)",
                           (chunk.id, chunk.paper_id, chunk.document_id, chunk.text))

    @staticmethod
    def _delete_document_fts(connection: sqlite3.Connection, document_id: str) -> None:
        connection.execute("DELETE FROM chunk_fts WHERE document_id = ?", (document_id,))

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
            self._delete_document_fts(connection, document_id)
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
            self._delete_document_fts(connection, chunk.document_id)
            for indexed_chunk in connection.execute("SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index", (chunk.document_id,)):
                self._insert_fts(connection, _chunk_from_row(indexed_chunk))
        return self.get_chunk(chunk.id)  # type: ignore[return-value]

    def get_chunk(self, chunk_id_value: str) -> Chunk | None:
        with self._connection() as connection:
            return _chunk_from_row(connection.execute("SELECT * FROM chunks WHERE id = ?", (chunk_id_value,)).fetchone())

    def list_chunks_by_document(self, document_id: str) -> list[Chunk]:
        with self._connection() as connection:
            return [_chunk_from_row(row) for row in connection.execute("SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index", (document_id,))]

    def delete_chunks_by_document(self, document_id: str) -> int:
        with self._connection() as connection:
            self._delete_document_fts(connection, document_id)
            return connection.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,)).rowcount

    def replace_document_chunks(self, document_id: str, chunks: list[Chunk]) -> list[Chunk]:
        if any(chunk.document_id != document_id for chunk in chunks):
            raise ValueError("all chunks must belong to document_id")
        with self._connection() as connection:
            self._delete_document_fts(connection, document_id)
            connection.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
            for chunk in chunks:
                connection.execute(
                    """INSERT INTO chunks (id, document_id, paper_id, page_number, text, start_offset, end_offset, chunk_index, content_hash, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (chunk.id, chunk.document_id, chunk.paper_id, chunk.page_number, chunk.text, chunk.start_offset,
                     chunk.end_offset, chunk.chunk_index, chunk.content_hash, _timestamp(chunk.created_at), _timestamp(chunk.updated_at)),
                )
                self._insert_fts(connection, chunk)
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
            self._delete_document_fts(connection, document.id)
            connection.execute("DELETE FROM chunks WHERE document_id = ?", (document.id,))
            for chunk in chunks:
                connection.execute(
                    """INSERT INTO chunks (id, document_id, paper_id, page_number, text, start_offset, end_offset, chunk_index, content_hash, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (chunk.id, chunk.document_id, chunk.paper_id, chunk.page_number, chunk.text, chunk.start_offset,
                     chunk.end_offset, chunk.chunk_index, chunk.content_hash, _timestamp(chunk.created_at), _timestamp(chunk.updated_at)),
                )
                self._insert_fts(connection, chunk)
        return self.list_chunks_by_document(document.id)

    def search_chunks_keyword(self, query: str, top_k: int = 10, paper_ids: list[str] | None = None) -> list[SearchResult]:
        safe_query = safe_fts_query(query)
        if not safe_query:
            raise ValueError("query must contain searchable text")
        limit = min(50, max(1, int(top_k)))
        filters = ["chunk_fts MATCH ?"]
        params: list[object] = [safe_query]
        if paper_ids:
            filters.append(f"chunk_fts.paper_id IN ({','.join('?' for _ in paper_ids)})")
            params.extend(paper_ids)
        sql = f"""SELECT chunk_fts.chunk_id, chunk_fts.document_id, chunk_fts.paper_id,
                         chunks.page_number, chunks.text, chunks.start_offset, chunks.end_offset,
                         -bm25(chunk_fts) AS score
                  FROM chunk_fts JOIN chunks ON chunks.id = chunk_fts.chunk_id
                  WHERE {' AND '.join(filters)}
                  ORDER BY bm25(chunk_fts), chunks.chunk_index, chunk_fts.chunk_id
                  LIMIT ?"""
        params.append(limit)
        with self._connection() as connection:
            rows = connection.execute(sql, params).fetchall()
        return [SearchResult(chunk_id=row["chunk_id"], document_id=row["document_id"], paper_id=row["paper_id"],
                             page_number=row["page_number"], text=row["text"], start_offset=row["start_offset"],
                             end_offset=row["end_offset"], score=float(row["score"]), rank=index + 1)
                for index, row in enumerate(rows)]

    def list_chunks_for_embedding(self, paper_ids: list[str] | None = None) -> list[Chunk]:
        sql = "SELECT * FROM chunks"; params: list[object] = []
        if paper_ids:
            sql += f" WHERE paper_id IN ({','.join('?' for _ in paper_ids)})"; params.extend(paper_ids)
        sql += " ORDER BY paper_id, document_id, chunk_index"
        with self._connection() as connection:
            return [_chunk_from_row(row) for row in connection.execute(sql, params)]

    def get_chunk_embedding(self, chunk_id: str, provider: str, model: str, dimensions: int, content_hash: str):
        with self._connection() as connection:
            return connection.execute("""SELECT vector FROM chunk_embeddings WHERE chunk_id=? AND provider=? AND model=? AND dimensions=? AND content_hash=?""",
                                      (chunk_id, provider, model, dimensions, content_hash)).fetchone()

    def count_chunk_embeddings(self, document_id: str | None = None) -> int:
        sql = "SELECT count(*) FROM chunk_embeddings"
        params: tuple[object, ...] = ()
        if document_id is not None:
            sql += " JOIN chunks ON chunks.id = chunk_embeddings.chunk_id WHERE chunks.document_id = ?"
            params = (document_id,)
        with self._connection() as connection:
            return int(connection.execute(sql, params).fetchone()[0])

    def has_compatible_embeddings(self, provider: str, model: str, dimensions: int,
                                  paper_ids: list[str] | None = None) -> bool:
        sql = """SELECT 1 FROM chunk_embeddings JOIN chunks ON chunks.id = chunk_embeddings.chunk_id
                 WHERE chunk_embeddings.provider=? AND chunk_embeddings.model=? AND chunk_embeddings.dimensions=?
                 AND chunk_embeddings.content_hash=chunks.content_hash"""
        params: list[object] = [provider, model, dimensions]
        if paper_ids:
            sql += f" AND chunks.paper_id IN ({','.join('?' for _ in paper_ids)})"
            params.extend(paper_ids)
        sql += " LIMIT 1"
        with self._connection() as connection:
            return connection.execute(sql, params).fetchone() is not None

    def upsert_chunk_embedding(self, chunk: Chunk, provider: str, model: str, dimensions: int, vector) -> None:
        import numpy as np
        array = np.asarray(vector, dtype=np.float32)
        if array.ndim != 1 or array.size != dimensions: raise ValueError("embedding dimension mismatch")
        timestamp = _timestamp(chunk.updated_at)
        with self._connection() as connection:
            connection.execute("""INSERT INTO chunk_embeddings (chunk_id, model, dimensions, provider, content_hash, vector, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(chunk_id, model, dimensions, provider) DO UPDATE SET
                content_hash=excluded.content_hash, vector=excluded.vector, updated_at=excluded.updated_at""",
                (chunk.id, model, dimensions, provider, chunk.content_hash, array.tobytes(), timestamp, timestamp))

    def search_chunks_vector(self, query_vector, top_k: int, provider: str, model: str, dimensions: int, paper_ids: list[str] | None = None) -> list[SearchResult]:
        import numpy as np
        query = np.asarray(query_vector, dtype=np.float32)
        if query.ndim != 1 or query.size != dimensions: raise ValueError("query vector dimension mismatch")
        sql = """SELECT chunks.*, chunk_embeddings.vector FROM chunks JOIN chunk_embeddings ON chunks.id=chunk_embeddings.chunk_id
                 WHERE chunk_embeddings.provider=? AND chunk_embeddings.model=? AND chunk_embeddings.dimensions=? AND chunk_embeddings.content_hash=chunks.content_hash"""
        params: list[object] = [provider, model, dimensions]
        if paper_ids: sql += f" AND chunks.paper_id IN ({','.join('?' for _ in paper_ids)})"; params.extend(paper_ids)
        with self._connection() as connection: rows = connection.execute(sql, params).fetchall()
        valid = [(row, np.frombuffer(row["vector"], dtype=np.float32)) for row in rows]
        valid = [(row, vector) for row, vector in valid if vector.size == dimensions and np.isfinite(vector).all() and np.linalg.norm(vector) > 0]
        query_norm = np.linalg.norm(query)
        if not valid or query_norm == 0: return []
        matrix = np.stack([vector for _, vector in valid]); scores = matrix.dot(query) / (np.linalg.norm(matrix, axis=1) * query_norm)
        ranked = sorted(zip(valid, scores), key=lambda item: (-float(item[1]), item[0][0]["chunk_index"], item[0][0]["id"]))[:min(50, max(1, int(top_k)))]
        return [SearchResult(chunk_id=row["id"], document_id=row["document_id"], paper_id=row["paper_id"], page_number=row["page_number"], text=row["text"], start_offset=row["start_offset"], end_offset=row["end_offset"], score=float(score), rank=index + 1)
                for index, ((row, _), score) in enumerate(ranked)]


def safe_fts_query(query: str) -> str:
    import re
    tokens = re.findall(r"\w+", str(query or ""), flags=re.UNICODE)
    return " AND ".join(f'"{token}"' for token in tokens)
