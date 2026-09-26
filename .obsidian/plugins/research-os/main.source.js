const { Plugin, ItemView, Notice } = require("obsidian");
const { ResearchStore } = require("./research-store");
const { ResearchView } = require("./research-view");
const { AIService, ResearchAISettingTab } = require("./ai-service");
const { ThemeService } = require("./theme-service");
const { TaskManager } = require("./task-manager");
const { BackendClient } = require("./backend-client");
const { RagIndexService } = require("./rag-index-service");

const VIEW_TYPE = "research-os-view";

module.exports = class ResearchOSPlugin extends Plugin {
  async onload() {
    this.store = new ResearchStore(this.app);
    this.ai = new AIService(this);
    this.theme = new ThemeService(this);
    this.taskManager = new TaskManager(this);
    this.store.taskManager = this.taskManager;
    this.backendClient = new BackendClient();
    this.ragIndexService = new RagIndexService(this);
    this.store.ragIndexService = this.ragIndexService;
    this.addSettingTab(new ResearchAISettingTab(this.app, this));
    this.registerView(VIEW_TYPE, leaf => new ResearchView(leaf, this));

    this.addRibbonIcon("library-big", "打开 Research OS", () => this.openResearchOS());
    this.addCommand({
      id: "open-research-os",
      name: "打开研究驾驶舱",
      callback: () => this.openResearchOS()
    });
    this.addCommand({
      id: "run-ai-paper-discovery",
      name: "AI：立即发现本周论文",
      callback: async () => {
        const notice = new Notice("正在抓取并分析本周论文…", 0);
        try { await this.ai.runWeeklyDiscovery(true); this.refreshViews(); notice.hide(); new Notice("本周论文发现完成"); }
        catch (error) { notice.hide(); new Notice(error.message, 8000); }
      }
    });
    this.addCommand({
      id: "refresh-research-os",
      name: "刷新研究数据",
      callback: async () => {
        await this.store.load();
        this.refreshViews();
        new Notice("Research OS 数据已刷新");
      }
    });
    this.addCommand({
      id: "generate-missing-paper-insights",
      name: "AI：补齐所有论文十问提炼",
      callback: async () => {
        const notice = new Notice("正在为缺失论文生成十问提炼…", 0);
        try {
          const generated = await this.ai.ensureMissingPaperInsights();
          notice.hide();
          this.refreshViews();
          new Notice(`已生成 ${generated.length} 篇论文提炼`);
        } catch (error) { notice.hide(); new Notice(error.message, 8000); }
      }
    });

    await this.bootstrap();
    await this.taskManager.load();
    await this.recoverInterruptedIngestionTasks();
    this.fileRefreshTimers = new Map();
    const refreshFile = file => this.scheduleVaultFileRefresh(file);
    this.registerEvent(this.app.vault.on("create", refreshFile));
    this.registerEvent(this.app.vault.on("delete", file => this.removeVaultFile(file)));
    this.registerEvent(this.app.vault.on("delete", file => {
      if (file.path === this.ai.settings.customTheme?.backgroundPath) this.theme.useForest();
    }));
    this.registerEvent(this.app.vault.on("modify", refreshFile));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.renameVaultFile(file, oldPath)));
    this.registerEvent(this.app.metadataCache.on("changed", refreshFile));

    this.app.workspace.onLayoutReady(async () => {
      await this.store.load();
      this.ai.ensureMissingPaperInsights().then(results => {
        if (results.length) this.refreshViews();
      }).catch(error => console.error("Research OS automatic paper insights failed", error));
      if (this.ai.shouldRunWeekly()) this.ai.runWeeklyDiscovery().then(() => this.refreshViews()).catch(error => console.error("Research OS weekly discovery failed", error));
      if (!this.app.workspace.getLeavesOfType(VIEW_TYPE).length) {
        await this.openResearchOS(false);
      }
    });
  }

  async bootstrap() {
    try {
      await this.ensureWorkspaceFolders();
    } catch (error) {
      console.error("Research OS folder bootstrap failed", error);
    }
    try {
      await this.ai.load();
    } catch (error) {
      console.error("Research OS settings load failed", error);
      this.ai.settings = { ...this.ai.settings };
    }
    try {
      await this.theme.initialize();
    } catch (error) {
      console.error("Research OS theme initialization failed", error);
    }
  }

  async recoverInterruptedIngestionTasks() {
    const interrupted = this.taskManager.listTasks({ type: "paper_ingestion", status: "running" });
    for (const task of interrupted) {
      try {
        await this.store.recoverIngestionTask(task);
      } catch (error) {
        console.warn("Research OS ingestion recovery failed", { taskId: task.id, stage: task.stage, error });
      }
    }
  }

  async ensureWorkspaceFolders() {
    const folders = [
      "03 Literature/Papers",
      "04 Notes/Reading Notes",
      "04 Notes/Evidence",
      "04 Notes/Concepts",
      "05 Research/Progress",
      "05 Research/Paper Insights",
      "05 Research/Questions",
      "09 Attachments",
      "09 Attachments/Research OS Themes"
    ];
    for (const folder of folders) {
      const parts = folder.split("/").filter(Boolean);
      let current = "";
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
      }
    }
  }

  debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  scheduleVaultFileRefresh(file) {
    if (!file?.path) return;
    const existing = this.fileRefreshTimers.get(file.path);
    if (existing) clearTimeout(existing);
    this.fileRefreshTimers.set(file.path, setTimeout(() => {
      this.fileRefreshTimers.delete(file.path);
      this.refreshVaultFile(file).catch(error => console.error("Research OS incremental file refresh failed", error));
    }, 350));
  }

  async refreshVaultFile(file) {
    await this.store.updateFile(file.path);
    this.renderViews();
  }

  async removeVaultFile(file) {
    if (!file?.path) return;
    const timer = this.fileRefreshTimers.get(file.path);
    if (timer) clearTimeout(timer);
    this.fileRefreshTimers.delete(file.path);
    this.store.removeFile(file.path);
    this.renderViews();
  }

  async renameVaultFile(file, oldPath) {
    if (!file?.path) return;
    const timer = this.fileRefreshTimers.get(oldPath);
    if (timer) clearTimeout(timer);
    this.fileRefreshTimers.delete(oldPath);
    await this.store.renameFile(oldPath, file.path);
    this.renderViews();
  }

  renderViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => leaf.view.render());
  }

  async refreshViews() {
    await this.store.loadAll();
    this.renderViews();
  }

  async openResearchOS(focus = true) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    if (focus) this.app.workspace.revealLeaf(leaf);
  }

  onunload() {
    this.taskManager?.persist().catch(error => console.warn("Research OS task state unload persistence failed", error));
    this.fileRefreshTimers?.forEach(timer => clearTimeout(timer));
    this.fileRefreshTimers?.clear();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
};
