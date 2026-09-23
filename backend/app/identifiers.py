import hashlib


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def document_id(paper_id: str, document_type: str, source_path: str) -> str:
    return f"doc_{sha256_text(f'{paper_id}\0{document_type}\0{source_path}')[:32]}"


def chunk_id(document_id_value: str, chunk_index: int, content_hash: str) -> str:
    return f"chunk_{sha256_text(f'{document_id_value}\0{chunk_index}\0{content_hash}')[:32]}"
