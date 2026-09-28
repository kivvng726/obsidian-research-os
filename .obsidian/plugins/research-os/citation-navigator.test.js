const assert = require("node:assert/strict");
const Module = require("node:module");
class MockTFile { constructor(path) { this.path = path; } }
const originalLoad = Module._load;
Module._load = (request, parent, isMain) => request === "obsidian" ? { TFile: MockTFile } : originalLoad(request, parent, isMain);
const { resolveCitationPaper, navigatePdfLeaf, openCitation } = require("./citation-navigator");
Module._load = originalLoad;

function root({ input = null, page = null } = {}) {
  return {
    querySelectorAll: selector => selector === "input" && input ? [input] : [],
    querySelector: selector => selector.includes("data-page-number") ? page : null,
    getBoundingClientRect: () => ({ top: 0, bottom: 100 })
  };
}
function inputControl(value = "1") {
  const events = [];
  return { value, parentElement: { textContent: "1 / 33" }, getAttribute: () => "", dispatchEvent: event => events.push(event.type), events };
}
function pageControl(visible = true) {
  let scrolled = false;
  return { getBoundingClientRect: () => visible ? ({ top: 0, bottom: 90 }) : ({ top: 200, bottom: 300 }), scrollIntoView: () => { scrolled = true; }, get scrolled() { return scrolled; } };
}

const paper = { id: "paper", pdfPath: "09 Attachments/example.pdf" };
const file = new MockTFile(paper.pdfPath);
assert.equal(resolveCitationPaper({ get: id => id === "paper" ? paper : null }, { paperId: "paper" }), paper);
(async () => {
  const pageOneInput = inputControl();
  assert.equal(await navigatePdfLeaf({ view: { containerEl: root({ input: pageOneInput, page: pageControl(true) }) } }, 1, { verifyTimeoutMs: 0 }), true);
  assert.equal(pageOneInput.value, "1");
  const pageNineInput = inputControl();
  assert.equal(await navigatePdfLeaf({ view: { containerEl: root({ input: pageNineInput, page: pageControl(true) }) } }, 9, { verifyTimeoutMs: 0 }), true);
  assert.equal(pageNineInput.value, "9"); assert.ok(pageNineInput.events.includes("change"));
  const page = pageControl(true);
  assert.equal(await navigatePdfLeaf({ view: { containerEl: root({ page }) } }, 9, { timeoutMs: 0 }), true);
  assert.equal(page.scrolled, true);
  assert.equal(await navigatePdfLeaf({ view: { containerEl: root() } }, 9, { timeoutMs: 0 }), false);
  assert.equal(await navigatePdfLeaf({ view: { containerEl: root() } }, 0, { timeoutMs: 0 }), false);
  const opened = []; const leaf = { view: { containerEl: root({ input: inputControl(), page: pageControl(true) }) }, openFile: async target => opened.push(target) };
  const app = { vault: { getAbstractFileByPath: path => path === paper.pdfPath ? file : null }, workspace: { getLeaf: () => leaf } };
  const result = await openCitation({ app, store: { get: () => paper }, citation: { paperId: "paper", pageNumber: 9 }, navigationOptions: { verifyTimeoutMs: 0 } });
  assert.equal(result.pageNumber, 9); assert.equal(result.pageNavigated, true); assert.deepEqual(opened, [file]);
  assert.equal((await openCitation({ app, store: { get: () => paper }, citation: { paperId: "paper" } })).pageNavigated, false);
  assert.equal((await openCitation({ app, store: { get: () => ({ pdfPath: "" }) }, citation: { paperId: "paper" } })).reason, "PDF_NOT_LINKED");
  console.log("citation navigator tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
