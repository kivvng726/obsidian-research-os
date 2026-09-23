const assert = require("node:assert/strict");
const Module = require("node:module");

class Plugin {}
class ItemView {}
class PluginSettingTab {}
class Setting {}
class Notice {}
class TFile {}
class Modal {}
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { Plugin, ItemView, PluginSettingTab, Setting, Notice, TFile, Modal, setIcon: () => {}, requestUrl: async () => ({}), loadPdfJs: async () => null };
  return originalLoad.call(this, request, parent, isMain);
};
const ResearchOSPlugin = require("./main.source");
Module._load = originalLoad;

(async () => {
  const calls = [];
  const plugin = Object.create(ResearchOSPlugin.prototype);
  plugin.fileRefreshTimers = new Map();
  plugin.store = {
    updateFile: async path => calls.push(["update", path]),
    removeFile: path => calls.push(["remove", path]),
    renameFile: async (oldPath, newPath) => calls.push(["rename", oldPath, newPath])
  };
  plugin.renderViews = () => calls.push(["render"]);

  await plugin.refreshVaultFile({ path: "03 Literature/One.md" });
  await plugin.removeVaultFile({ path: "03 Literature/One.md" });
  await plugin.renameVaultFile({ path: "03 Literature/Renamed.md" }, "03 Literature/One.md");
  plugin.scheduleVaultFileRefresh({ path: "03 Literature/Debounced.md" });
  plugin.scheduleVaultFileRefresh({ path: "03 Literature/Debounced.md" });
  await new Promise(resolve => setTimeout(resolve, 380));

  assert.deepEqual(calls, [
    ["update", "03 Literature/One.md"], ["render"],
    ["remove", "03 Literature/One.md"], ["render"],
    ["rename", "03 Literature/One.md", "03 Literature/Renamed.md"], ["render"],
    ["update", "03 Literature/Debounced.md"], ["render"]
  ]);
  assert.equal(plugin.fileRefreshTimers.size, 0);
  const recovered = [];
  plugin.taskManager = { listTasks: filter => {
    assert.deepEqual(filter, { type: "paper_ingestion", status: "running" });
    return [{ id: "ingestion", type: "paper_ingestion", status: "running" }];
  } };
  plugin.store.recoverIngestionTask = async task => recovered.push(task.id);
  await plugin.recoverInterruptedIngestionTasks();
  assert.deepEqual(recovered, ["ingestion"]);
  console.log("main incremental vault event tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
