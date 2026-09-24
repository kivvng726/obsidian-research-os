const { requestUrl } = require("obsidian");

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8765";
const SUPPORTED_BACKEND_API_VERSION = 1;

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
    this.timeoutMs = Math.max(100, Number(options.timeoutMs) || 2000);
    this.request = options.request || requestUrl;
  }

  async requestJson(method, path, body = null) {
    let timeoutId;
    const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new BackendClientError("BACKEND_TIMEOUT", `Backend request timed out after ${this.timeoutMs}ms`)), this.timeoutMs); });
    let response;
    try {
      response = await Promise.race([this.request({ url: `${this.baseUrl}${path}`, method, throw: false, ...(body === null ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) }), timeout]);
    } catch (error) {
      if (error instanceof BackendClientError) throw error;
      throw new BackendClientError("BACKEND_UNAVAILABLE", "Local backend is unavailable", error);
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response || Number(response.status) < 200 || Number(response.status) >= 300) throw new BackendClientError("BACKEND_API_ERROR", `Backend returned HTTP ${response?.status || "unknown"}`);
    const responseBody = response.json;
    if (!responseBody || typeof responseBody !== "object" || Array.isArray(responseBody)) throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend returned malformed JSON");
    return responseBody;
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
    const body = await this.requestJson("POST", "/documents/index", input);
    if (!body || !["indexed", "unchanged"].includes(body.status) || typeof body.documentId !== "string" || typeof body.chunkCount !== "number") {
      throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend indexing response is invalid");
    }
    return body;
  }

  async searchChunks(input) {
    const body = await this.requestJson("POST", "/search", input);
    if (body?.mode !== "keyword" || !Array.isArray(body.results)) throw new BackendClientError("BACKEND_MALFORMED_RESPONSE", "Backend search response is invalid");
    return body;
  }
}

module.exports = { BackendClient, BackendClientError, DEFAULT_BACKEND_URL, SUPPORTED_BACKEND_API_VERSION };
