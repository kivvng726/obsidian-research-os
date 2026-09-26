const assert = require("node:assert/strict");
const Module = require("node:module");

class MockTFile { constructor(path) { this.path = path; } }
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { TFile: MockTFile };
  return originalLoad.call(this, request, parent, isMain);
};
const { resolveCitationPaper, openCitation } = require("./citation-navigator");
Module._load = originalLoad;

const paper = { id: "03 Literature/Papers/example.md", pdfPath: "09 Attachments/example.pdf" };
const store = { get: id => id === paper.id ? paper : null };
const file = new MockTFile(paper.pdfPath);
const opened = [];
const app = {
  vault: { getAbstractFileByPath: path => path === paper.pdfPath ? file : null },
  workspace: { getLeaf: kind => ({ openFile: async target => opened.push([kind, target]) }) }
};

assert.equal(resolveCitationPaper(store, { paperId: paper.id }), paper);
assert.equal(resolveCitationPaper(store, { paperId: "missing" }), null);
(async () => {
  const result = await openCitation({ app, store, citation: { paperId: paper.id, pageNumber: 7 } });
  assert.equal(result.opened, true);
  assert.equal(result.pageNavigated, false);
  assert.equal(result.pageNumber, 7);
  assert.deepEqual(opened, [["tab", file]]);
  assert.deepEqual(await openCitation({ app, store, citation: { paperId: "missing" } }), { opened: false, reason: "PAPER_NOT_FOUND" });
  assert.equal((await openCitation({ app, store: { get: () => ({ pdfPath: "" }) }, citation: { paperId: paper.id } })).reason, "PDF_NOT_LINKED");
  assert.equal((await openCitation({ app, store: { get: () => ({ pdfPath: "09 Attachments/missing.pdf" }) }, citation: { paperId: paper.id } })).reason, "PDF_NOT_FOUND");
  console.log("citation navigator tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
