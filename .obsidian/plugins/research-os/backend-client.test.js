const assert = require("node:assert/strict");
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { requestUrl: async () => ({}) };
  return originalLoad.call(this, request, parent, isMain);
};
const { BackendClient, BackendClientError, SUPPORTED_BACKEND_API_VERSION } = require("./backend-client");
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
  const indexConflict = new BackendClient({ request: async () => ({ status: 409, json: {} }) });
  await assert.rejects(() => indexConflict.indexDocument({}), error => error.code === "BACKEND_API_ERROR");
  console.log("backend client tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
