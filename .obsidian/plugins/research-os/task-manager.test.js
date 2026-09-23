const assert = require("node:assert/strict");
const { TaskManager, safeError } = require("./task-manager");

function createPlugin(files = new Map()) {
  return {
    manifest: { id: "research-os" },
    app: { vault: { adapter: {
      exists: async path => files.has(path),
      read: async path => { if (!files.has(path)) throw new Error("missing"); return files.get(path); },
      write: async (path, content) => files.set(path, content)
    } } }
  };
}

(async () => {
  const files = new Map();
  const manager = new TaskManager(createPlugin(files));
  const analysis = await manager.createTask("paper_ai_analysis", { paperPath: "03 Literature/One.md" }, { maxRetries: 1 });
  assert.equal(analysis.status, "pending");
  assert.equal(analysis.progress, 0);
  assert.ok(files.has(".obsidian/plugins/research-os/tasks.json"));
  assert.equal(manager.findActiveTask("paper_ai_analysis", task => task.payload.paperPath.endsWith("One.md")).id, analysis.id);
  await manager.startTask(analysis.id);
  await manager.updateProgress(analysis.id, 35, "analysis");
  assert.equal(manager.getTask(analysis.id).stage, "analysis");
  assert.equal(manager.getTask(analysis.id).progress, 35);
  await manager.completeTask(analysis.id, { insightPath: "05 Research/Paper Insights/One.md" });
  assert.equal(manager.getTask(analysis.id).status, "completed");
  assert.equal(await manager.startTask(analysis.id), null);

  const ingestion = await manager.createTask("paper_ingestion", { fileName: "One.pdf" }, { maxRetries: 1 });
  await manager.startTask(ingestion.id);
  await manager.failTask(ingestion.id, new Error("API key=sk-secret-token prompt: private prompt body"), "import");
  const failed = manager.getTask(ingestion.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.stage, "import");
  assert.equal(failed.error.message.includes("sk-secret-token"), false);
  assert.equal(failed.error.message.includes("private prompt body"), false);
  await manager.retryTask(ingestion.id);
  assert.equal(manager.getTask(ingestion.id).status, "pending");
  assert.equal(manager.getTask(ingestion.id).retryCount, 1);
  await manager.startTask(ingestion.id);
  await manager.failTask(ingestion.id, "second failure");
  assert.equal(await manager.retryTask(ingestion.id), null);

  const pending = await manager.createTask("paper_ingestion", {});
  assert.equal((await manager.cancelTask(pending.id)).status, "cancelled");
  const running = await manager.createTask("paper_ingestion", {});
  await manager.startTask(running.id);
  assert.equal((await manager.cancelTask(running.id)).status, "cancelled");
  assert.equal(manager.listTasks({ type: "paper_ingestion" }).length, 3);

  const reloaded = new TaskManager(createPlugin(files));
  await reloaded.load();
  assert.equal(reloaded.getTask(analysis.id).status, "completed");
  assert.equal(reloaded.listTasks().length, 4);

  files.set(reloaded.storagePath, JSON.stringify({ version: 1, tasks: [{ id: "running", type: "paper_ai_analysis", status: "running", payload: {} }] }));
  const interrupted = new TaskManager(createPlugin(files));
  const interruptedIds = await interrupted.load();
  assert.deepEqual(interruptedIds, ["running"]);
  assert.equal(interrupted.getTask("running").status, "running");

  files.set(interrupted.storagePath, "{broken");
  const corrupt = new TaskManager(createPlugin(files));
  const originalWarn = console.warn;
  console.warn = () => {};
  await corrupt.load();
  console.warn = originalWarn;
  assert.deepEqual(corrupt.listTasks(), []);
  assert.equal(safeError(new Error("prompt: secret body\nmore content")).message.includes("secret body"), false);
  console.log("task manager tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
