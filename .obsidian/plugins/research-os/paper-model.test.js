const assert = require("node:assert/strict");
const Module = require("node:module");

class TFile { constructor(path) { this.path = path; } }
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { TFile, loadPdfJs: async () => null };
  return originalLoad.call(this, request, parent, isMain);
};
const { ResearchStore } = require("./research-store");
const { normalizePaper, normalizeStringArray } = require("./paper-model");
Module._load = originalLoad;

const store = new ResearchStore({ vault: { adapter: { getBasePath: () => "C:/Users/test/Vault" } } });
const normalize = value => store.normalizeVaultPath(value);
const base = raw => ({ path: "03 Literature/Paper.md", name: "Paper", type: "literature", title: "Paper", authors: [], methods: [], created: "2026-01-01", updated: "2026-01-02", raw });

assert.deepEqual(normalizeStringArray("Ada, Grace， Lin"), ["Ada", "Grace", "Lin"]);
assert.deepEqual(normalizeStringArray(["Ada", "ada", null]), ["Ada"]);

const standardRaw = { id: "paper-1", title: "Canonical Paper", authors: ["Ada", "Grace"], year: "2025", status: "reading", primary_topic: "Agents", topics: ["Safety"], methods: "Evaluation, Benchmark", pdf: "03 Literature/Paper.pdf", reading_note: "[[04 Notes/Reading Notes/Paper.md]]", slides: "09 Attachments/Paper.pptx", created: "2025-01-01", updated: "2025-02-01" };
const standard = normalizePaper(base(standardRaw), { normalizeVaultPath: normalize });
assert.equal(standard.id, "paper-1");
assert.equal(standard.primaryTopic, "Agents");
assert.deepEqual(standard.topics, ["Safety"]);
assert.deepEqual(standard.methods, ["Evaluation", "Benchmark"]);
assert.equal(standard.pdfPath, "03 Literature/Paper.pdf");
assert.equal(standard.readingNotePath, "04 Notes/Reading Notes/Paper.md");
assert.equal(standard.slidesPath, "09 Attachments/Paper.pptx");
assert.equal(standard.createdAt, "2025-01-01");
assert.equal(standard.updatedAt, "2025-02-01");
assert.equal(standard.pdf, standardRaw.pdf);
assert.equal(standard.readingNote, standardRaw.reading_note);

assert.equal(normalizePaper(base({ topic: "Legacy Topic" }), { normalizeVaultPath: normalize }).category, "Legacy Topic");
assert.equal(normalizePaper(base({ category: "Legacy Category" }), { normalizeVaultPath: normalize }).category, "Legacy Category");
assert.equal(normalizePaper(base({ primary_topic: "Primary" }), { normalizeVaultPath: normalize }).primaryTopic, "Primary");

const attachment = normalizePaper(base({ attachment: "file:///C:/Users/test/Vault/03%20Literature/Paper.pdf" }), { normalizeVaultPath: normalize });
assert.equal(attachment.pdfPath, "03 Literature/Paper.pdf");
assert.equal(attachment.attachmentPath, "03 Literature/Paper.pdf");
assert.equal(normalizePaper(base({ pdf: "C:\\Users\\test\\Vault\\03 Literature\\Paper.pdf" }), { normalizeVaultPath: normalize }).pdfPath, "03 Literature/Paper.pdf");

const notes = normalizePaper(base({ reading_notes: ["[[04 Notes/A.md]]", "04 Notes/B.md"], notes: "Free-form reading reflection" }), { normalizeVaultPath: normalize });
assert.deepEqual(notes.readingNotePaths, ["04 Notes/A.md", "04 Notes/B.md"]);
assert.equal(notes.notesText, "Free-form reading reflection");
assert.equal(notes.readingNotePath, "04 Notes/A.md");

assert.equal(normalizePaper(base({ ppt: "09 Attachments/Talk.ppt" }), { normalizeVaultPath: normalize }).slidesPath, "09 Attachments/Talk.ppt");
assert.equal(normalizePaper(base({ presentation: "09 Attachments/Talk.pptx" }), { normalizeVaultPath: normalize }).slidesPath, "09 Attachments/Talk.pptx");

const missing = normalizePaper(base({ authors: null, methods: null, created_at: "2024-01-01", updated_at: "2024-01-02" }), { normalizeVaultPath: normalize });
assert.deepEqual(missing.authors, []);
assert.deepEqual(missing.methods, []);
assert.equal(missing.createdAt, "2024-01-01");
assert.equal(missing.updatedAt, "2024-01-02");
assert.equal(missing.raw.authors, null);

console.log("paper model normalization tests passed");
