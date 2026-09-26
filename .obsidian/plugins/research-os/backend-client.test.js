const assert = require("node:assert/strict");
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { requestUrl: async () => ({}) };
  return originalLoad.call(this, request, parent, isMain);
};
const { BackendClient, BackendClientError, SUPPORTED_BACKEND_API_VERSION, EMBEDDING_KEY_HEADER, LLM_KEY_HEADER } = require("./backend-client");
Module._load = originalLoad;

(async () => {
  const healthy = new BackendClient({ request: async () => ({ status: 200, json: { status: "ok", service: "research-os-backend" } }) });
  assert.deepEqual(await healthy.healthCheck(), { available: true, status: "ok", service: "research-os-backend" });

  const unavailable = new BackendClient({ request: async () => { throw new Error("connection refused"); } });
  assert.equal((await unavailable.healthCheck()).available, false);
  assert.equal((await unavailable.healthCheck()).error.code, "BACKEND_UNAVAILABLE");

  const timeout = new BackendClient({ timeoutMs: 10, request: async () => new Promise(() => {}) });
  assert.equal((await timeout.healthCheck()).error.code, "BACKEND_TIMEOUT");

  const version = new BackendClient({ request: async () => ({ status: 200, json: { backendVersion: "0.1.0", apiVersion: 1 } }) });
  assert.deepEqual(await version.getVersion(), { backendVersion: "0.1.0", apiVersion: 1 });
  assert.deepEqual(await version.checkCompatibility(), { available: true, compatible: true, backendVersion: "0.1.0", apiVersion: SUPPORTED_BACKEND_API_VERSION });

  const mismatch = new BackendClient({ request: async () => ({ status: 200, json: { backendVersion: "2.0.0", apiVersion: 2 } }) });
  assert.equal((await mismatch.checkCompatibility()).compatible, false);

  const malformed = new BackendClient({ request: async () => ({ status: 200, json: "not an object" }) });
  await assert.rejects(() => malformed.getVersion(), error => error instanceof BackendClientError && error.code === "BACKEND_MALFORMED_RESPONSE");
  let capturedRequest;
  const indexing = new BackendClient({ request: async request => { capturedRequest = request; return { status: 200, json: { status: "indexed", documentId: "doc-1", chunkCount: 2 } }; } });
  assert.equal((await indexing.indexDocument({ vaultRoot: "C:/Test", paperId: "paper-1", sourcePath: "09 Attachments/test.pdf" })).status, "indexed");
  assert.equal(capturedRequest.method, "POST");
  assert.equal(capturedRequest.url, "http://127.0.0.1:8765/documents/index");
  assert.deepEqual(JSON.parse(capturedRequest.body), { vaultRoot: "C:/Test", paperId: "paper-1", sourcePath: "09 Attachments/test.pdf" });
  const slowDocumentIndex = new BackendClient({ timeoutMs: 100, documentIndexTimeoutMs: 300, request: async () => new Promise(resolve => setTimeout(() => resolve({ status: 200, json: { status: "indexed", documentId: "doc-1", chunkCount: 1 } }), 150)) });
  assert.equal((await slowDocumentIndex.indexDocument({})).status, "indexed");
  const indexConflict = new BackendClient({ request: async () => ({ status: 409, json: {} }) });
  await assert.rejects(() => indexConflict.indexDocument({}), error => error.code === "BACKEND_API_ERROR");
  let searchRequest;
  const search = new BackendClient({ request: async request => { searchRequest = request; return { status: 200, json: { mode: "keyword", query: "graph", results: [] } }; } });
  assert.deepEqual(await search.searchChunks({ query: "graph", topK: 5, paperIds: ["paper-1"], mode: "keyword" }), { mode: "keyword", query: "graph", results: [] });
  assert.equal(searchRequest.method, "POST"); assert.equal(searchRequest.url, "http://127.0.0.1:8765/search");
  assert.deepEqual(JSON.parse(searchRequest.body), { query: "graph", topK: 5, paperIds: ["paper-1"], mode: "keyword" });
  const vectorSearch = new BackendClient({ request: async () => ({ status: 200, json: { mode: "vector", query: "graph", results: [] } }) });
  assert.equal((await vectorSearch.searchChunks({ query: "graph", mode: "vector" })).mode, "vector");
  const hybridSearch = new BackendClient({ request: async () => ({ status: 200, json: { mode: "hybrid", query: "graph", results: [], vectorAvailable: false, fallback: "keyword" } }) });
  assert.equal((await hybridSearch.searchChunks({ query: "graph", mode: "hybrid" })).fallback, "keyword");
  const malformedSearch = new BackendClient({ request: async () => ({ status: 200, json: { mode: "keyword" } }) });
  await assert.rejects(() => malformedSearch.searchChunks({ query: "x" }), error => error.code === "BACKEND_MALFORMED_RESPONSE");
  let embeddingRequest;
  const embeddingIndex = new BackendClient({ request: async request => { embeddingRequest = request; return { status: 200, json: { status: "completed", totalChunks: 3, cachedChunks: 2, embeddedChunks: 1 } }; } });
  assert.equal((await embeddingIndex.indexEmbeddings({ paperIds: ["paper-1"], force: false })).embeddedChunks, 1);
  assert.equal(embeddingRequest.url, "http://127.0.0.1:8765/embeddings/index");
  assert.deepEqual(JSON.parse(embeddingRequest.body), { paperIds: ["paper-1"], force: false });
  const unavailableEmbedding = new BackendClient({ request: async () => ({ status: 503, json: {} }) });
  await assert.rejects(() => unavailableEmbedding.indexEmbeddings({}), error => error.code === "BACKEND_API_ERROR");
  const slowResponse = async () => new Promise(resolve => setTimeout(() => resolve({ status: 200, json: { status: "completed", totalChunks: 1, cachedChunks: 0, embeddedChunks: 1 } }), 150));
  const timeoutPolicy = new BackendClient({ timeoutMs: 100, embeddingIndexTimeoutMs: 300, request: slowResponse });
  assert.equal((await timeoutPolicy.indexEmbeddings({})).status, "completed");
  assert.equal((await timeoutPolicy.healthCheck()).error.code, "BACKEND_TIMEOUT");
  let ragRequest;
  const rag = new BackendClient({ request: async request => { ragRequest = request; return { status: 200, json: { query: "q", answer: "answer [E1]", grounded: true, citations: [{ id: "E1" }], invalidCitationIds: [], retrieval: { mode: "hybrid", resultCount: 1 } } }; } });
  assert.equal((await rag.ragQuery({ query: "q", paperIds: ["paper-1"], retrievalTopK: 6, searchMode: "hybrid" })).grounded, true);
  assert.equal(ragRequest.method, "POST"); assert.equal(ragRequest.url, "http://127.0.0.1:8765/rag/query");
  assert.deepEqual(JSON.parse(ragRequest.body), { query: "q", paperIds: ["paper-1"], retrievalTopK: 6, searchMode: "hybrid" });
  const malformedRag = new BackendClient({ request: async () => ({ status: 200, json: { answer: "missing fields" } }) });
  await assert.rejects(() => malformedRag.ragQuery({ query: "q" }), error => error.code === "BACKEND_MALFORMED_RESPONSE");
  const unavailableRag = new BackendClient({ request: async () => ({ status: 503, json: { detail: { code: "LLM_NOT_CONFIGURED", message: "RAG chat provider is not configured" } } }) });
  await assert.rejects(() => unavailableRag.ragQuery({ query: "q" }), error => error.code === "LLM_NOT_CONFIGURED" && error.message.includes("not configured"));
  const slowRag = new BackendClient({ timeoutMs: 100, ragQueryTimeoutMs: 300, request: async () => new Promise(resolve => setTimeout(() => resolve({ status: 200, json: { answer: "no evidence", grounded: false, citations: [], invalidCitationIds: [], retrieval: {} } }), 150)) });
  assert.equal((await slowRag.ragQuery({ query: "q" })).grounded, false);
  const runtimeSettings = {
    backendUrl: "http://127.0.0.1:9999",
    embedding: { provider: "qwen", baseUrl: "https://embedding.example/v1", apiKey: "TEST_EMBEDDING_KEY", model: "embed-test", dimensions: 1024 },
    chat: { provider: "deepseek", baseUrl: "https://chat.example", apiKey: "TEST_CHAT_KEY", model: "deepseek-chat" }
  };
  let runtimeRequest;
  const runtime = new BackendClient({ configGetter: () => runtimeSettings, request: async request => {
    runtimeRequest = request;
    if (request.url.endsWith("/providers/embedding/test")) return { status: 200, json: { ok: true, model: "embed-test", dimensions: 1024 } };
    if (request.url.endsWith("/providers/chat/test")) return { status: 200, json: { ok: true, model: "deepseek-chat" } };
    if (request.url.endsWith("/embeddings/index")) return { status: 200, json: { status: "completed", totalChunks: 1, cachedChunks: 1, embeddedChunks: 0 } };
    if (request.url.endsWith("/search")) return { status: 200, json: { mode: "vector", query: "q", results: [] } };
    return { status: 200, json: { query: "q", answer: "answer [E1]", grounded: true, citations: [{ id: "E1" }], invalidCitationIds: [], retrieval: { mode: "hybrid", resultCount: 1 } } };
  } });
  await runtime.ragQuery({ query: "q", searchMode: "hybrid" });
  assert.equal(runtimeRequest.url, "http://127.0.0.1:9999/rag/query");
  assert.equal(runtimeRequest.headers[EMBEDDING_KEY_HEADER], "TEST_EMBEDDING_KEY");
  assert.equal(runtimeRequest.headers[LLM_KEY_HEADER], "TEST_CHAT_KEY");
  assert.equal(runtimeRequest.url.includes("TEST_"), false);
  const runtimeBody = JSON.parse(runtimeRequest.body);
  assert.equal(runtimeBody.embedding.apiKey, undefined); assert.equal(runtimeBody.chat.apiKey, undefined);
  assert.equal(runtimeBody.embedding.model, "embed-test"); assert.equal(runtimeBody.chat.model, "deepseek-chat");
  await runtime.indexEmbeddings({ paperIds: ["paper-1"], force: false });
  assert.equal(runtimeRequest.headers[EMBEDDING_KEY_HEADER], "TEST_EMBEDDING_KEY");
  assert.equal(runtimeRequest.headers[LLM_KEY_HEADER], undefined);
  assert.equal(JSON.parse(runtimeRequest.body).embedding.apiKey, undefined);
  await runtime.searchChunks({ query: "q", mode: "vector" });
  assert.equal(runtimeRequest.headers[EMBEDDING_KEY_HEADER], "TEST_EMBEDDING_KEY");
  assert.equal(runtimeRequest.headers[LLM_KEY_HEADER], undefined);
  await runtime.testEmbedding(); assert.equal(runtimeRequest.url, "http://127.0.0.1:9999/providers/embedding/test");
  assert.equal(runtimeRequest.headers[EMBEDDING_KEY_HEADER], "TEST_EMBEDDING_KEY");
  await runtime.testChat(); assert.equal(runtimeRequest.url, "http://127.0.0.1:9999/providers/chat/test");
  assert.equal(runtimeRequest.headers[LLM_KEY_HEADER], "TEST_CHAT_KEY");
  const keywordRuntime = new BackendClient({ configGetter: () => runtimeSettings, request: async request => { runtimeRequest = request; return { status: 200, json: { mode: "keyword", query: "q", results: [] } }; } });
  await keywordRuntime.searchChunks({ query: "q", mode: "keyword" });
  assert.equal(runtimeRequest.headers?.[EMBEDDING_KEY_HEADER], undefined);
  assert.equal(runtimeRequest.headers?.[LLM_KEY_HEADER], undefined);
  console.log("backend client tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
