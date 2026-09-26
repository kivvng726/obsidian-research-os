const { requestUrl } = require("obsidian");

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8765";
const SUPPORTED_BACKEND_API_VERSION = 1;
const DEFAULT_REQUEST_TIMEOUT_MS = 2000;
const DEFAULT_SEMANTIC_SEARCH_TIMEOUT_MS = 15000;
const DEFAULT_DOCUMENT_INDEX_TIMEOUT_MS = 60000;
const DEFAULT_EMBEDDING_INDEX_TIMEOUT_MS = 60000;
const DEFAULT_RAG_QUERY_TIMEOUT_MS = 60000;
const EMBEDDING_KEY_HEADER = "X-Research-OS-Embedding-Key";
const LLM_KEY_HEADER = "X-Research-OS-LLM-Key";

class BackendClientError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = "BackendClientError";
    this.code = code;
    this.cause = cause;
  }
}

class BackendClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
    this.timeoutMs = Math.max(100, Number(options.timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS);
    this.semanticSearchTimeoutMs = Math.max(this.timeoutMs, Number(options.semanticSearchTimeoutMs) || DEFAULT_SEMANTIC_SEARCH_TIMEOUT_MS);
    this.documentIndexTimeoutMs = Math.max(this.timeoutMs, Number(options.documentIndexTimeoutMs) || DEFAULT_DOCUMENT_INDEX_TIMEOUT_MS);
    this.embeddingIndexTimeoutMs = Math.max(this.timeoutMs, Number(options.embeddingIndexTimeoutMs) || DEFAULT_EMBEDDING_INDEX_TIMEOUT_MS);
    this.ragQueryTimeoutMs = Math.max(this.timeoutMs, Number(options.ragQueryTimeoutMs) || DEFAULT_RAG_QUERY_TIMEOUT_MS);
    this.request = options.request || requestUrl;
    this.configGetter = typeof options.configGetter === "function" ? options.configGetter : () => null;
  }

  async requestJson(method, path, body = null, options = {}) {
    const timeoutMs = Math.max(100, Number(options.timeoutMs) || this.timeoutMs);
    let timeoutId;
    const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new BackendClientError("BACKEND_TIMEOUT", `Backend request timed out after ${timeoutMs}ms`)), timeoutMs); });
    let response;
    try {
      const headers = { ...(body === null ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
      response = await Promise.race([this.request({ url: `${this.currentBaseUrl()}${path}`, method, throw: false, ...(Object.keys(headers).length ? { headers } : {}), ...(body === null ? {} : { body: JSON.stringify(body) }) }), timeout]);
    } catch (error) {
      if (error instanceof BackendClientError) throw error;
      throw new BackendClientError("BACKEND_UNAVAILABLE", "Local backend is unavailable", error);
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response || Number(response.status) < 200 || Number(response.status) >= 300) {
      const detail = response?.json?.detail;
      const code = typeof detail?.code === "string" ? detail.code : "BACKEND_API_ERROR";
      const message = typeof detail?.message === "string" ? detail.message : `Backend returned HTTP ${response?.status || "unknown"}`;
      throw new BackendClientError(code, message);
    }
    const responseBody = response.json;
    if (!responseBody || typeof responseBody !== "object" || Array.isArray(responseBody)) throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend returned malformed JSON");
    return responseBody;
  }

  currentResearchAIConfig() {
    const raw = this.configGetter() || {};
    return raw && typeof raw === "object" ? raw : {};
  }

  currentBaseUrl() {
    const configured = String(this.currentResearchAIConfig().backendUrl || "").trim();
    return (configured || this.baseUrl).replace(/\/+$/, "");
  }

  runtimeProviderConfig(kind) {
    const raw = this.currentResearchAIConfig()[kind];
    if (!raw || typeof raw !== "object") return { body: null, headers: {} };
    const body = {};
    for (const [source, target] of [["provider", "provider"], ["baseUrl", "baseUrl"], ["model", "model"], ["dimensions", "dimensions"]]) {
      if (kind === "chat" && source === "dimensions") continue;
      const value = raw[source];
      if (value !== undefined && value !== null && String(value).trim() !== "") body[target] = source === "dimensions" ? Number(value) : String(value).trim();
    }
    const key = String(raw.apiKey || "").trim();
    const header = kind === "embedding" ? EMBEDDING_KEY_HEADER : LLM_KEY_HEADER;
    return { body: Object.keys(body).length ? body : null, headers: key ? { [header]: key } : {} };
  }

  withRuntimeConfig(input, kinds) {
    const body = { ...(input || {}) };
    const headers = {};
    for (const kind of kinds) {
      const runtime = this.runtimeProviderConfig(kind);
      if (runtime.body) body[kind] = runtime.body;
      Object.assign(headers, runtime.headers);
    }
    return { body, headers };
  }

  async healthCheck() {
    try {
      const body = await this.requestJson("GET", "/health");
      if (body.status !== "ok") throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend health response is invalid");
      return { available: true, status: "ok", service: body.service || "" };
    } catch (error) {
      return { available: false, status: "unavailable", error: { code: error.code || "BACKEND_UNAVAILABLE", message: error.message } };
    }
  }

  async getVersion() {
    const body = await this.requestJson("GET", "/version");
    if (typeof body.backendVersion !== "string" || !Number.isInteger(body.apiVersion)) throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend version response is invalid");
    return { backendVersion: body.backendVersion, apiVersion: body.apiVersion };
  }

  async checkCompatibility() {
    try {
      const version = await this.getVersion();
      return { available: true, compatible: version.apiVersion === SUPPORTED_BACKEND_API_VERSION, ...version };
    } catch (error) {
      return { available: false, compatible: false, error: { code: error.code || "BACKEND_UNAVAILABLE", message: error.message } };
    }
  }

  async indexDocument(input) {
    const body = await this.requestJson("POST", "/documents/index", input, { timeoutMs: this.documentIndexTimeoutMs });
    if (!body || !["indexed", "unchanged"].includes(body.status) || typeof body.documentId !== "string" || typeof body.chunkCount !== "number") {
      throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend indexing response is invalid");
    }
    return body;
  }

  async searchChunks(input) {
    const isSemantic = input?.mode === "vector" || input?.mode === "hybrid";
    const runtime = isSemantic ? this.withRuntimeConfig(input, ["embedding"]) : { body: input, headers: {} };
    const body = await this.requestJson("POST", "/search", runtime.body, isSemantic ? { timeoutMs: this.semanticSearchTimeoutMs, headers: runtime.headers } : {});
    if (!body || !["keyword", "vector", "hybrid"].includes(body.mode) || !Array.isArray(body.results)) throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend search response is invalid");
    return body;
  }

  async indexEmbeddings(input = {}) {
    const runtime = this.withRuntimeConfig(input, ["embedding"]);
    const body = await this.requestJson("POST", "/embeddings/index", runtime.body, { timeoutMs: this.embeddingIndexTimeoutMs, headers: runtime.headers });
    if (!body || !["completed", "partial"].includes(body.status) || typeof body.totalChunks !== "number" || typeof body.cachedChunks !== "number" || typeof body.embeddedChunks !== "number") {
      throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend embedding indexing response is invalid");
    }
    return body;
  }

  async ragQuery(input) {
    const runtime = this.withRuntimeConfig(input, ["embedding", "chat"]);
    const body = await this.requestJson("POST", "/rag/query", runtime.body, { timeoutMs: this.ragQueryTimeoutMs, headers: runtime.headers });
    if (!body || typeof body.answer !== "string" || typeof body.grounded !== "boolean" || !Array.isArray(body.citations) || !Array.isArray(body.invalidCitationIds) || !body.retrieval || typeof body.retrieval !== "object") {
      throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend RAG response is invalid");
    }
    return body;
  }

  async testEmbedding() {
    const runtime = this.withRuntimeConfig({}, ["embedding"]);
    const body = await this.requestJson("POST", "/providers/embedding/test", runtime.body, { timeoutMs: this.embeddingIndexTimeoutMs, headers: runtime.headers });
    if (body.ok !== true || typeof body.model !== "string" || !Number.isInteger(body.dimensions)) throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend embedding test response is invalid");
    return body;
  }

  async testChat() {
    const runtime = this.withRuntimeConfig({}, ["chat"]);
    const body = await this.requestJson("POST", "/providers/chat/test", runtime.body, { timeoutMs: this.ragQueryTimeoutMs, headers: runtime.headers });
    if (body.ok !== true || typeof body.model !== "string") throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend chat test response is invalid");
    return body;
  }
}

module.exports = { BackendClient, BackendClientError, DEFAULT_BACKEND_URL, SUPPORTED_BACKEND_API_VERSION, EMBEDDING_KEY_HEADER, LLM_KEY_HEADER };
