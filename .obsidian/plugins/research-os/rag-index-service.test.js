const assert = require("node:assert/strict");
const { RagIndexService } = require("./rag-index-service");

function paper(id, pdfPath = `09 Attachments/${id}.pdf`) { return { id, type: "literature", pdfPath }; }

(async () => {
  const calls = [];
  const plugin = {
    app: { vault: { adapter: { getBasePath: () => "C:/TestVault" } } },
    renderViews: () => calls.push("render"),
    backendClient: {
      indexDocument: async input => { calls.push(["document", input]); return { status: "indexed", documentId: "doc-1" }; },
      indexEmbeddings: async input => { calls.push(["embeddings", input]); return { status: "completed", cachedChunks: 0, embeddedChunks: 2 }; }
    }
  };
  const service = new RagIndexService(plugin);
  const first = await service.indexPaper(paper("paper-1"));
  assert.equal(first.status, "indexed");
  assert.deepEqual(calls.find(call => Array.isArray(call) && call[0] === "document")[1], {
    vaultRoot: "C:/TestVault", paperId: "paper-1", sourcePath: "09 Attachments/paper-1.pdf"
  });
  assert.deepEqual(calls.find(call => Array.isArray(call) && call[0] === "embeddings")[1], { paperIds: ["paper-1"], force: false });

  plugin.backendClient.indexDocument = async input => ({ status: input.paperId === "paper-2" ? "unchanged" : "indexed" });
  plugin.backendClient.indexEmbeddings = async () => ({ status: "completed", cachedChunks: 2, embeddedChunks: 0 });
  assert.equal((await service.indexPaper(paper("paper-2"))).status, "unchanged");

  plugin.backendClient.indexDocument = async input => {
    if (input.paperId === "paper-fail") { const error = new Error("one paper failed"); error.code = "BACKEND_API_ERROR"; throw error; }
    return { status: "indexed" };
  };
  const summary = await service.indexExistingLibrary([paper("paper-3"), { id: "no-pdf", type: "literature", pdfPath: "" }, paper("paper-fail"), paper("paper-4")]);
  assert.deepEqual(summary, { running: false, total: 4, processed: 4, succeeded: 2, unchanged: 0, skipped: 1, failed: 1, unavailable: false });

  plugin.backendClient.indexDocument = async () => { const error = new Error("offline"); error.code = "BACKEND_UNAVAILABLE"; throw error; };
  const unavailable = await service.indexExistingLibrary([paper("offline-1"), paper("offline-2")]);
  assert.equal(unavailable.unavailable, true);
  assert.equal(unavailable.processed, 1);
  assert.equal(unavailable.failed, 1);
  console.log("rag index service tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
