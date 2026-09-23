const assert = require("node:assert/strict");
const Module = require("node:module");

class TFile {
  constructor(path) { this.path = path; this.extension = path.split(".").pop(); this.basename = path.split("/").pop().replace(/\.md$/, ""); this.stat = { mtime: 1, ctime: 1 }; }
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
  const files = new Map(); const binaries = new Map(); const frontmatter = new Map(); const persisted = new Map();
  const app = { vault: {
    adapter: { exists: async path => persisted.has(path), read: async path => persisted.get(path), write: async (path, value) => persisted.set(path, value), getBasePath: () => "C:/RecoveryVault" },
    getAbstractFileByPath: path => files.get(path) || null,
    getMarkdownFiles: () => [...files.values()].filter(file => file.extension === "md"),
    readBinary: async file => binaries.get(file.path),
    createBinary: async (path, bytes) => { files.set(path, new TFile(path)); binaries.set(path, bytes); },
    createFolder: async path => files.set(path, { path })
  }, metadataCache: { getFileCache: file => ({ frontmatter: frontmatter.get(file.path) || {} }), getFirstLinkpathDest: () => null } };
  const plugin = { manifest: { id: "research-os" }, app };
  const store = new ResearchStore(app); store.taskManager = new TaskManager(plugin);
  let creates = 0;
  store.create = async (type, title, project, metadata) => {
    creates++;
    const path = `03 Literature/Papers/${title}.md`; const file = new TFile(path);
    files.set(path, file); frontmatter.set(path, { type, title, ...metadata }); return file;
  };
  return { store, files, binaries, frontmatter, get creates() { return creates; } };
}

async function runningTask(store, stage, payload) {
  const task = await store.taskManager.createTask("paper_ingestion", payload);
  await store.taskManager.startTask(task.id);
  await store.taskManager.updateProgress(task.id, 50, stage);
  return store.taskManager.getTask(task.id);
}
async function addPdf(env, path, bytes = new Uint8Array([37, 80, 68, 70]).buffer) {
  await env.store.app.vault.createBinary(path, bytes);
  return env.store.hashBinary(bytes);
}
function addPaper(env, path, pdfPath, title = "Recovered") {
  const file = new TFile(path); env.files.set(path, file);
  env.frontmatter.set(path, { type: "literature", title, pdf: `[[${pdfPath}]]` }); return file;
}

(async () => {
  const extract = fixture();
  const pdfPath = "09 Attachments/Extract.pdf";
  const hash = await addPdf(extract, pdfPath);
  const extractTask = await runningTask(extract.store, "extract", { sourceFileName: "Extract.pdf", targetPdfPath: pdfPath, sourceHash: hash });
  await extract.store.recoverIngestionTask(extractTask);
  assert.equal(extract.store.taskManager.getTask(extractTask.id).status, "completed");
  assert.equal(extract.creates, 1);
  assert.equal(extract.store.taskManager.getTask(extractTask.id).payload.recoveryFromStage, "extract");

  const indexed = fixture();
  const indexedPdf = "09 Attachments/Indexed.pdf"; const indexedHash = await addPdf(indexed, indexedPdf);
  const indexedPaper = addPaper(indexed, "03 Literature/Papers/Indexed.md", indexedPdf, "Indexed");
  const indexTask = await runningTask(indexed.store, "index", { sourceFileName: "Indexed.pdf", targetPdfPath: indexedPdf, paperPath: indexedPaper.path, sourceHash: indexedHash });
  await indexed.store.recoverIngestionTask(indexTask);
  assert.equal(indexed.store.taskManager.getTask(indexTask.id).status, "completed");
  assert.equal(indexed.creates, 0);
  assert.equal(indexed.store.items.filter(item => item.path === indexedPaper.path).length, 1);
  await indexed.store.recoverIngestionTask(indexed.store.taskManager.getTask(indexTask.id));
  assert.equal(indexed.store.items.filter(item => item.path === indexedPaper.path).length, 1);

  const persist = fixture();
  const persistPdf = "09 Attachments/Persist.pdf"; const persistHash = await addPdf(persist, persistPdf);
  const persistTask = await runningTask(persist.store, "persist", { sourceFileName: "Persist.pdf", targetPdfPath: persistPdf, sourceHash: persistHash });
  await persist.store.recoverIngestionTask(persistTask);
  assert.equal(persist.store.taskManager.getTask(persistTask.id).status, "completed");
  assert.equal(persist.creates, 1);

  const userModified = fixture();
  const userPdf = "09 Attachments/User.pdf"; const userHash = await addPdf(userModified, userPdf);
  const userPaper = addPaper(userModified, "03 Literature/Papers/User.md", userPdf, "User changed title");
  const userTask = await runningTask(userModified.store, "persist", { sourceFileName: "User.pdf", targetPdfPath: userPdf, paperPath: userPaper.path, sourceHash: userHash });
  await userModified.store.recoverIngestionTask(userTask);
  assert.equal(userModified.creates, 0);
  assert.equal(userModified.frontmatter.get(userPaper.path).title, "User changed title");

  const mismatch = fixture();
  const mismatchPdf = "09 Attachments/Mismatch.pdf"; await addPdf(mismatch, mismatchPdf);
  const mismatchTask = await runningTask(mismatch.store, "copy", { sourceFileName: "Mismatch.pdf", targetPdfPath: mismatchPdf, sourceHash: "different" });
  await assert.rejects(() => mismatch.store.recoverIngestionTask(mismatchTask));
  assert.equal(mismatch.store.taskManager.getTask(mismatchTask.id).status, "failed");
  assert.ok(mismatch.files.has(mismatchPdf));

  const missing = fixture();
  const missingTask = await runningTask(missing.store, "copy", { sourceFileName: "Missing.pdf", targetPdfPath: "09 Attachments/Missing.pdf", sourceHash: "abc" });
  await assert.rejects(() => missing.store.recoverIngestionTask(missingTask));
  assert.equal(missing.store.taskManager.getTask(missingTask.id).stage, "copy");
  console.log("pdf ingestion recovery tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
