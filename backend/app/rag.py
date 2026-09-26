"""Citation-grounded RAG pipeline built on the existing retrieval layer."""

import re
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .chat import ChatProvider, ChatRuntimeConfig
from .config import EmbeddingConfigurationError, EmbeddingRuntimeConfig
from .embeddings import EmbeddingProvider, EmbeddingProviderError
from .identifiers import sha256_text
from .models import EvidenceSpan, SearchResult
from .retrieval import SearchRequest, SearchResponse, VectorIndexEmptyError, search_hybrid, search_keyword, search_vector
from .storage import RagStore

MAX_EVIDENCE = 6
MAX_EVIDENCE_QUOTE_CHARS = 3000
MAX_CONTEXT_CHARS = 18000
NO_EVIDENCE_ANSWER = "No relevant evidence was found in the indexed library."
CITATION_PATTERN = re.compile(r"\[E([1-9]\d*)\]")

GROUNDED_SYSTEM_PROMPT = """You answer research questions using only the supplied Evidence.
Every factual claim that depends on the library evidence should cite one or more evidence IDs using only [E1], [E2], or [E1][E3] syntax.
Never cite an evidence ID that was not supplied. Never invent page numbers, paper IDs, source paths, or quotations.
If the supplied evidence is insufficient, state that clearly. Do not use outside knowledge as if it came from the indexed library."""


def answer_language_instruction(query: str) -> str:
    if re.search(r"[\u4e00-\u9fff]", query):
        return "Answer in Chinese because the Question is in Chinese. Keep Evidence quotations in their original language."
    return "Answer in English because the Question is in English. Keep Evidence quotations in their original language."


class RagQueryRequest(BaseModel):
    query: str
    paperIds: list[str] = Field(default_factory=list)
    retrievalTopK: int = Field(default=6, ge=1, le=12)
    searchMode: Literal["keyword", "vector", "hybrid"] = "hybrid"
    embedding: EmbeddingRuntimeConfig | None = None
    chat: ChatRuntimeConfig | None = None

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("query must not be empty")
        return value


class RagRetrievalSummary(BaseModel):
    mode: str
    resultCount: int
    vectorAvailable: bool | None = None
    fallback: str | None = None


class RagQueryResponse(BaseModel):
    query: str
    answer: str
    grounded: bool
    citations: list[EvidenceSpan]
    invalidCitationIds: list[str]
    retrieval: RagRetrievalSummary
    model: str | None = None


def _evidence_block(evidence: EvidenceSpan) -> str:
    page = str(evidence.page_number) if evidence.page_number is not None else "unknown"
    return f"[{evidence.id}]\npaper_id: {evidence.paper_id}\npage: {page}\ntext:\n{evidence.quote}"


def build_evidence_spans(results: list[SearchResult], max_evidence: int = MAX_EVIDENCE,
                         max_quote_chars: int = MAX_EVIDENCE_QUOTE_CHARS,
                         max_context_chars: int = MAX_CONTEXT_CHARS) -> list[EvidenceSpan]:
    evidence: list[EvidenceSpan] = []
    seen_chunks: set[str] = set()
    context_length = 0
    for result in results:
        if result.chunk_id in seen_chunks or len(evidence) >= max_evidence:
            continue
        evidence_id = f"E{len(evidence) + 1}"
        quote_limit = max_quote_chars
        if result.start_offset is not None and result.end_offset is not None:
            quote_limit = min(quote_limit, max(0, result.end_offset - result.start_offset))
        quote = result.text[:quote_limit]
        if not quote:
            continue
        start_offset = result.start_offset
        end_offset = None
        if start_offset is not None:
            calculated_end = start_offset + len(quote)
            end_offset = min(result.end_offset, calculated_end) if result.end_offset is not None else calculated_end
        candidate = EvidenceSpan(
            id=evidence_id,
            chunk_id=result.chunk_id,
            document_id=result.document_id,
            paper_id=result.paper_id,
            page_number=result.page_number,
            quote=quote,
            start_offset=start_offset,
            end_offset=end_offset,
            source_text_hash=sha256_text(result.text),
        )
        separator_length = 2 if evidence else 0
        block_length = len(_evidence_block(candidate)) + separator_length
        remaining = max_context_chars - context_length
        if block_length > remaining:
            overflow = block_length - remaining
            shortened_length = len(candidate.quote) - overflow
            if shortened_length <= 0:
                break
            shortened_quote = candidate.quote[:shortened_length]
            shortened_end = start_offset + len(shortened_quote) if start_offset is not None else None
            if shortened_end is not None and result.end_offset is not None:
                shortened_end = min(shortened_end, result.end_offset)
            candidate = candidate.model_copy(update={"quote": shortened_quote, "end_offset": shortened_end})
            block_length = len(_evidence_block(candidate)) + separator_length
        evidence.append(candidate)
        seen_chunks.add(result.chunk_id)
        context_length += block_length
    return evidence


def build_rag_context(evidence: list[EvidenceSpan]) -> str:
    return "\n\n".join(_evidence_block(item) for item in evidence)


def extract_citation_ids(answer: str) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for match in CITATION_PATTERN.finditer(answer or ""):
        citation_id = f"E{match.group(1)}"
        if citation_id not in seen:
            seen.add(citation_id)
            output.append(citation_id)
    return output


def validate_citations(answer: str, evidence: list[EvidenceSpan]) -> tuple[list[EvidenceSpan], list[str], bool]:
    evidence_by_id = {item.id: item for item in evidence}
    cited_ids = extract_citation_ids(answer)
    valid = [evidence_by_id[citation_id] for citation_id in cited_ids if citation_id in evidence_by_id]
    invalid = [citation_id for citation_id in cited_ids if citation_id not in evidence_by_id]
    grounded = bool(valid) and not invalid
    return valid, invalid, grounded


def retrieve_for_rag(request: RagQueryRequest, store: RagStore,
                     embedding_provider_factory: Callable[[], EmbeddingProvider]) -> SearchResponse:
    search_request = SearchRequest(query=request.query, topK=request.retrievalTopK,
                                   paperIds=request.paperIds, mode=request.searchMode)
    if request.searchMode == "keyword":
        return search_keyword(search_request, store)
    try:
        provider = embedding_provider_factory()
        settings = provider.settings  # type: ignore[attr-defined]
        if request.searchMode == "vector":
            return search_vector(search_request, store, provider, settings.provider, settings.model, settings.dimensions)
        return search_hybrid(search_request, store, provider, settings.provider, settings.model, settings.dimensions)
    except (EmbeddingConfigurationError, EmbeddingProviderError, VectorIndexEmptyError):
        if request.searchMode == "vector":
            raise
        return SearchResponse(mode="hybrid", query=request.query,
                              results=store.search_chunks_keyword(request.query, request.retrievalTopK, request.paperIds),
                              vectorAvailable=False, fallback="keyword", warning="Vector retrieval is unavailable")


def run_rag_query(request: RagQueryRequest, store: RagStore,
                  embedding_provider_factory: Callable[[], EmbeddingProvider],
                  chat_provider_factory: Callable[[], ChatProvider]) -> RagQueryResponse:
    retrieval = retrieve_for_rag(request, store, embedding_provider_factory)
    evidence = build_evidence_spans(retrieval.results)
    summary = RagRetrievalSummary(mode=retrieval.mode, resultCount=len(evidence),
                                  vectorAvailable=retrieval.vectorAvailable, fallback=retrieval.fallback)
    if not evidence:
        return RagQueryResponse(query=request.query, answer=NO_EVIDENCE_ANSWER, grounded=False,
                                citations=[], invalidCitationIds=[], retrieval=summary, model=None)
    provider = chat_provider_factory()
    context = build_rag_context(evidence)
    answer = provider.complete([
        {"role": "system", "content": f"{GROUNDED_SYSTEM_PROMPT}\n{answer_language_instruction(request.query)}"},
        {"role": "user", "content": f"Question:\n{request.query}\n\nEvidence:\n\n{context}"},
    ])
    citations, invalid_ids, grounded = validate_citations(answer, evidence)
    return RagQueryResponse(query=request.query, answer=answer, grounded=grounded,
                            citations=citations, invalidCitationIds=invalid_ids,
                            retrieval=summary, model=provider.model)
