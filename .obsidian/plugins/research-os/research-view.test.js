const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { ItemView: class {}, Notice: class {}, TFile: class {}, setIcon: () => {}, MarkdownRenderer: { render: async (...args) => { globalThis.__ragMarkdownRenderArgs = args; } } };
  if (request === "./capture-modal") return { CaptureModal: class {} };
  if (request === "./paper-graph") return { PaperGraph: class {} };
  if (request === "./progress-modal") return { ProgressModal: class {}, TYPES: {}, MATURITY: {}, ROLES: {} };
  if (request === "./synthesis-modal") return { SynthesisModal: class {} };
  if (request === "./literature-modal") return { LiteratureEditModal: class {}, LiteratureDeleteModal: class {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { ResearchView, restoreSearchInputFocus, restoreRagInputFocus } = require("./research-view");
Module._load = originalLoad;

const calls = [];
const input = {
  value: "literature",
  focus: () => calls.push("focus"),
  setSelectionRange: (start, end) => calls.push([start, end])
};

restoreSearchInputFocus({ querySelector: selector => selector === ".ros-search input" ? input : null }, 4);
assert.deepEqual(calls, ["focus", [4, 4]]);

calls.length = 0;
restoreSearchInputFocus({ querySelector: () => input }, 999);
assert.deepEqual(calls, ["focus", [input.value.length, input.value.length]]);
assert.doesNotThrow(() => restoreSearchInputFocus({ querySelector: () => null }, 0));

const ragFocusCalls = [];
const ragInput = { value: "library question", disabled: false, focus: () => ragFocusCalls.push("focus"), setSelectionRange: (start, end) => ragFocusCalls.push([start, end]) };
restoreRagInputFocus({ querySelector: selector => selector === ".ros-library-rag textarea" ? ragInput : null }, 4);
assert.deepEqual(ragFocusCalls, ["focus", [4, 4]]);
ragInput.disabled = true;
assert.doesNotThrow(() => restoreRagInputFocus({ querySelector: () => ragInput }));

(async () => {
  const calls = [];
  const view = Object.create(ResearchView.prototype);
  view.plugin = { backendClient: { ragQuery: async input => { calls.push(input); return { answer: "Answer [E1]", grounded: true, citations: [{ id: "E1" }], invalidCitationIds: [], retrieval: {} }; } } };
  view.ragLoading = false;
  view.ragError = "";
  view.ragResult = null;
  view.ragInput = "";
  view.render = () => calls.push("render");
  await view.submitLibraryRag("  library question  ");
  assert.deepEqual(calls.find(call => typeof call === "object"), { query: "library question", paperIds: [], retrievalTopK: 6, searchMode: "hybrid" });
  assert.equal(view.ragResult.answer, "Answer [E1]");
  assert.equal(view.ragLoading, false);
  const callCount = calls.length;
  view.ragLoading = true;
  await view.submitLibraryRag("duplicate");
  assert.equal(calls.length, callCount);
  view.ragLoading = false;
  view.plugin.backendClient.ragQuery = async () => { const error = new Error("offline"); error.code = "BACKEND_UNAVAILABLE"; throw error; };
  await view.submitLibraryRag("offline question");
  assert.equal(view.ragError, "Local Research backend is not available.");
  view.plugin.ragIndexService = { indexExistingLibrary: async papers => { calls.push(["backfill", papers]); return { unavailable: false, failed: 1 }; } };
  view.plugin.store = { byType: () => [{ id: "paper-1", type: "literature", pdfPath: "09 Attachments/paper.pdf" }] };
  await view.indexExistingLibrary();
  assert.equal(view.ragBackfillError, "1 paper(s) could not be indexed. The remaining papers were processed.");
  const markdownView = Object.create(ResearchView.prototype);
  markdownView.app = { id: "app" };
  markdownView.selectedPath = "03 Literature/Papers/test.md";
  markdownView.replaceRagCitationPlaceholders = () => {};
  const markdownParent = { ownerDocument: null, createSpan: () => {}, createEl: () => {}, empty: () => {} };
  await markdownView.renderRagAnswer(markdownParent, { answer: "### Heading\n- **bold** [E1]", citations: [{ id: "E1" }] });
  assert.equal(globalThis.__ragMarkdownRenderArgs[0], markdownView.app);
  assert.ok(globalThis.__ragMarkdownRenderArgs[1].includes("### Heading\n- **bold**"));
  assert.equal(globalThis.__ragMarkdownRenderArgs[3], "03 Literature/Papers/test.md");
  assert.equal(globalThis.__ragMarkdownRenderArgs[4], markdownView);
  console.log("research-view library RAG tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

console.log("research-view search focus tests passed");
