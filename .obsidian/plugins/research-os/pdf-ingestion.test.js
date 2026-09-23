const assert = require("node:assert/strict");
const Module = require("node:module");

class TFile {
  constructor(path) {
    this.path = path;
    this.extension = path.split(".").pop();
    this.basename = path.split("/").pop().replace(/\.md$/, "");
    this.stat = { mtime: 1, ctime: 1 };
  }
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { TFile, loadPdfJs: async () => null };
  return originalLoad.call(this, request, parent, isMain);
};
const { ResearchStore } = require("./research-store");
const { TaskManager } = require("./task-manager");
Module._load = originalLoad;

function fixture() {
  const files = new Map();
  const binary = new Map();
  const frontmatter = new Map();
  const persisted = new Map();
  const app = {
    vault: {
      adapter: { exists: async path => persisted.has(path), read: async path => persisted.get(path), write: async (path, value) => persisted.set(path, value), getBasePath: () => "C:/TestVault" },
      getAbstractFileByPath: path => files.get(path) || null,
      getMarkdownFiles: () => [...files.values()].filter(file => file.extension === "md"),
      createFolder: async path => files.set(path, { path }),
      createBinary: async (path, bytes) => { files.set(path, new TFile(path)); binary.set(path, bytes); },
      readBinary: async file => binary.get(file.path)
    },
    metadataCache: { getFileCache: file => ({ frontmatter: frontmatter.get(file.path) || {} }), getFirstLinkpathDest: () => null }
  };
  const plugin = { manifest: { id: "research-os" }, app };
  const store = new ResearchStore(app);
  store.taskManager = new TaskManager(plugin);
  let createCount = 0;
  store.create = async (type, title, project, metadata, options) => {
    assert.equal(options.skipLoad, true);
    createCount++;
    const path = `03 Literature/Papers/${title}.md`;
    const file = new TFile(path);
    files.set(path, file);
    frontmatter.set(path, { type, title, ...metadata });
    return file;
  };
  return { store, files, binary, get createCount() { return createCount; } };
}

function source(name = "Paper.pdf", bytes = new Uint8Array([37, 80, 68, 70]).buffer) {
  return { name, arrayBuffer: async () => bytes };
}

(async () => {
  const normal = fixture();
  const stages = [];
  const originalProgress = normal.store.taskManager.updateProgress.bind(normal.store.taskManager);
  normal.store.taskManager.updateProgress = async (id, progress, stage) => { stages.push([stage, progress]); return originalProgress(id, progress, stage); };
  const first = await normal.store.importPdf(source());
  const completed = normal.store.taskManager.listTasks({ type: "paper_ingestion" })[0];
  assert.deepEqual(stages, [["queued", 0], ["copy", 10], ["copy", 10], ["extract", 30], ["metadata", 50], ["persist", 75], ["index", 90]]);
  assert.equal(completed.status, "completed");
  assert.equal(completed.stage, "completed");
  assert.equal(completed.progress, 100);
  assert.equal(completed.payload.targetPdfPath, first.attachmentPath);
  assert.equal(completed.payload.paperPath, first.note.path);
  assert.equal(normal.store.get(first.note.path).type, "literature");
  assert.equal(normal.store.getIngestionDebugState(completed.id).targetPdfPath, first.attachmentPath);
  assert.equal(Object.values(completed.payload).some(value => value instanceof ArrayBuffer), false);

  const repeated = await normal.store.importPdf(source());
  assert.equal(repeated.attachmentPath, first.attachmentPath);
  assert.equal(repeated.note.path, first.note.path);
  assert.equal(normal.createCount, 1);
  assert.equal(normal.store.items.filter(item => item.path === first.note.path).length, 1);

  const copyFailure = fixture();
  await assert.rejects(() => copyFailure.store.importPdf({ name: "Broken.pdf", arrayBuffer: async () => { throw new Error("copy read failed"); } }));
  assert.equal(copyFailure.store.taskManager.listTasks()[0].stage, "copy");

  const extractionFallback = fixture();
  extractionFallback.store.extractPdfMetadata = () => { throw new Error("metadata unavailable"); };
  const fallback = await extractionFallback.store.importPdf(source("Fallback.pdf"));
  assert.equal(fallback.metadata.title, "Fallback");
  assert.equal(extractionFallback.store.taskManager.listTasks()[0].status, "completed");

  const persistFailure = fixture();
  persistFailure.store.create = async () => { throw new Error("note write failed"); };
  await assert.rejects(() => persistFailure.store.importPdf(source("Persist.pdf")));
  const persistTask = persistFailure.store.taskManager.listTasks()[0];
  assert.equal(persistTask.stage, "persist");
  assert.ok(persistFailure.files.has(persistTask.payload.targetPdfPath));

  const indexFailure = fixture();
  indexFailure.store.loadFile = async () => null;
  await assert.rejects(() => indexFailure.store.importPdf(source("Index.pdf")));
  const indexTask = indexFailure.store.taskManager.listTasks()[0];
  assert.equal(indexTask.stage, "index");
  assert.ok(indexTask.payload.paperPath);
  console.log("pdf ingestion stage tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
