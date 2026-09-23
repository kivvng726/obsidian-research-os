const assert = require("node:assert/strict");
const Module = require("node:module");
class TFile {}
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { TFile, loadPdfJs: async () => null, PluginSettingTab: class {}, Setting: class {}, Notice: class {}, requestUrl: async () => ({}) };
  if (request === "./theme-settings") return { renderThemeSettings: () => {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { ResearchStore } = require("./research-store");
const { AIService } = require("./ai-service");
const { TaskManager } = require("./task-manager");
Module._load = originalLoad;

function taskPlugin() {
  const files = new Map();
  const app = { vault: { adapter: { exists: async path => files.has(path), read: async path => files.get(path), write: async (path, value) => files.set(path, value), getBasePath: () => "C:/Test" }, createBinary: async () => {}, getAbstractFileByPath: () => null }, metadataCache: { getFirstLinkpathDest: () => null } };
  return { manifest: { id: "research-os" }, app, files };
}

(async () => {
  const ingestionPlugin = taskPlugin();
  const ingestionManager = new TaskManager(ingestionPlugin);
  const store = new ResearchStore(ingestionPlugin.app);
  store.taskManager = ingestionManager;
  store.ensureFolder = async () => {};
  store.uniqueAttachmentPath = async path => path;
  store.create = async () => ({ path: "03 Literature/Papers/Imported.md" });
  await store.importPdf({ name: "Imported.pdf", arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer });
  assert.equal(ingestionManager.listTasks({ type: "paper_ingestion" })[0].status, "completed");
  await assert.rejects(() => store.importPdf({ name: "Broken.pdf", arrayBuffer: async () => { throw new Error("read failed"); } }));
  assert.equal(ingestionManager.listTasks({ type: "paper_ingestion" })[1].status, "failed");

  const analysisPlugin = taskPlugin();
  const analysisManager = new TaskManager(analysisPlugin);
  const paper = { path: "03 Literature/Papers/One.md", title: "One", authors: [], raw: {} };
  analysisPlugin.store = {
    load: async () => {}, get: () => paper, getPaperInsight: () => null,
    savePaperInsight: async () => ({ path: "05 Research/Paper Insights/One.md" })
  };
  analysisPlugin.taskManager = analysisManager;
  const ai = new AIService(analysisPlugin);
  ai.isConfigured = () => true;
  ai.paperInsightContext = async () => ({ contentHash: "hash", extractionLevel: "metadata", extractionLabel: "metadata", material: "fixture" });
  ai.model = () => "fixture-model";
  ai.chat = async () => JSON.stringify({ answers: { q1: "answer" } });
  await ai.ensurePaperInsight(paper, true);
  assert.equal(analysisManager.listTasks({ type: "paper_ai_analysis" })[0].status, "completed");
  ai.chat = async () => { throw new Error("network failed"); };
  await assert.rejects(() => ai.ensurePaperInsight(paper, true));
  assert.equal(analysisManager.listTasks({ type: "paper_ai_analysis" })[1].status, "failed");
  console.log("task manager workflow hook tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
