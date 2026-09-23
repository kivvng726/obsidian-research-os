const TASK_TYPES = new Set(["paper_ingestion", "paper_ai_analysis"]);
const TASK_STATUSES = new Set(["pending", "running", "completed", "failed", "cancelled"]);

function now() { return new Date().toISOString(); }
function clampProgress(value) { return Math.max(0, Math.min(100, Number(value) || 0)); }
function taskId() { return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function safeError(error, stage = "") {
  const message = String(error?.message || error || "Unknown task error")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/(api[_ -]?key\s*[=:]\s*)\S+/ig, "$1[redacted]")
    .replace(/(prompt|pdf(?:\s+content)?)\s*[=:].*/ig, "$1=[redacted]")
    .split(/\r?\n/)[0].slice(0, 500);
  return { message, ...(stage ? { stage } : {}), timestamp: now() };
}

class TaskManager {
  constructor(plugin, options = {}) {
    this.plugin = plugin;
    this.tasks = new Map();
    this.interruptedTaskIds = new Set();
    this.storagePath = options.storagePath || `.obsidian/plugins/${plugin.manifest?.id || "research-os"}/tasks.json`;
  }

  adapter() { return this.plugin.app.vault.adapter; }

  normalizeTask(raw) {
    if (!raw || typeof raw !== "object" || !TASK_TYPES.has(raw.type) || !TASK_STATUSES.has(raw.status)) return null;
    return { id: String(raw.id || taskId()), type: raw.type, status: raw.status, stage: String(raw.stage || (raw.status === "pending" ? "queued" : raw.status)), progress: clampProgress(raw.progress), payload: raw.payload && typeof raw.payload === "object" ? { ...raw.payload } : {}, retryCount: Math.max(0, Number(raw.retryCount) || 0), maxRetries: Math.max(0, Number(raw.maxRetries ?? 2) || 0), error: raw.error && typeof raw.error === "object" ? safeError(raw.error.message || "Task failed", raw.error.stage) : null, createdAt: raw.createdAt || now(), updatedAt: raw.updatedAt || now(), startedAt: raw.startedAt || "", completedAt: raw.completedAt || "", resultMeta: raw.resultMeta && typeof raw.resultMeta === "object" ? { ...raw.resultMeta } : null };
  }

  async load() {
    try {
      const adapter = this.adapter();
      if (adapter.exists && !(await adapter.exists(this.storagePath))) {
        this.tasks.clear();
        this.interruptedTaskIds.clear();
        return [];
      }
      const parsed = JSON.parse(await adapter.read(this.storagePath));
      const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
      this.tasks = new Map(tasks.map(task => this.normalizeTask(task)).filter(Boolean).map(task => [task.id, task]));
    } catch (error) {
      this.tasks.clear();
      console.warn("Research OS task state load failed", error);
    }
    return this.recoverInterruptedTasks();
  }

  async persist() {
    try {
      await this.adapter().write(this.storagePath, JSON.stringify({ version: 1, tasks: this.listTasks() }, null, 2));
      return true;
    } catch (error) {
      console.warn("Research OS task state persistence failed", error);
      return false;
    }
  }

  listTasks(filter = {}) { return [...this.tasks.values()].filter(task => (!filter.type || task.type === filter.type) && (!filter.status || task.status === filter.status)).map(task => ({ ...task, payload: { ...task.payload } })); }
  getTask(id) { const task = this.tasks.get(id); return task ? { ...task, payload: { ...task.payload } } : null; }

  async createTask(type, payload = {}, options = {}) {
    if (!TASK_TYPES.has(type)) throw new Error(`Unsupported task type: ${type}`);
    const timestamp = now();
    const task = { id: taskId(), type, status: "pending", stage: "queued", progress: 0, payload: { ...payload }, retryCount: 0, maxRetries: Math.max(0, Number(options.maxRetries ?? 2) || 0), error: null, createdAt: timestamp, updatedAt: timestamp, startedAt: "", completedAt: "", resultMeta: null };
    this.tasks.set(task.id, task); await this.persist(); return this.getTask(task.id);
  }

  async updateTask(id, patch = {}) {
    const task = this.tasks.get(id);
    if (!task || Object.prototype.hasOwnProperty.call(patch, "status")) return null;
    if (Object.prototype.hasOwnProperty.call(patch, "progress")) task.progress = clampProgress(patch.progress);
    if (Object.prototype.hasOwnProperty.call(patch, "stage")) task.stage = String(patch.stage || task.stage);
    if (patch.payload && typeof patch.payload === "object") task.payload = { ...task.payload, ...patch.payload };
    task.updatedAt = now(); await this.persist(); return this.getTask(id);
  }

  async startTask(id) { return this.transition(id, ["pending"], { status: "running", stage: "running", startedAt: now() }); }
  async updateProgress(id, progress, stage = "") { return this.updateTask(id, { progress, ...(stage ? { stage } : {}) }); }
  async completeTask(id, resultMeta = null) { return this.transition(id, ["running"], { status: "completed", stage: "done", progress: 100, completedAt: now(), resultMeta: resultMeta && typeof resultMeta === "object" ? { ...resultMeta } : null }); }
  async failTask(id, error, stage = "") { return this.transition(id, ["running"], { status: "failed", stage: stage || "failed", error: safeError(error, stage), completedAt: now() }); }
  async cancelTask(id) { return this.transition(id, ["pending", "running"], { status: "cancelled", stage: "cancelled", completedAt: now() }); }

  async retryTask(id) {
    const task = this.tasks.get(id);
    if (!task || task.status !== "failed" || task.retryCount >= task.maxRetries) return null;
    Object.assign(task, { status: "pending", stage: "queued", progress: 0, retryCount: task.retryCount + 1, error: null, startedAt: "", completedAt: "", updatedAt: now() });
    await this.persist(); return this.getTask(id);
  }

  async transition(id, allowed, patch) {
    const task = this.tasks.get(id);
    if (!task || !allowed.includes(task.status)) return null;
    Object.assign(task, patch, { updatedAt: now() }); await this.persist(); return this.getTask(id);
  }

  findActiveTask(type, predicate = () => true) { return this.listTasks({ type }).find(task => ["pending", "running"].includes(task.status) && predicate(task)) || null; }
  recoverInterruptedTasks() { this.interruptedTaskIds = new Set(this.listTasks({ status: "running" }).map(task => task.id)); return [...this.interruptedTaskIds]; }
}

module.exports = { TaskManager, TASK_TYPES, TASK_STATUSES, safeError };
