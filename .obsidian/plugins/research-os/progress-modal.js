const { Modal, Setting, Notice } = require("obsidian");

const TYPES = {
  finding: "研究发现",
  method: "方法启发",
  question: "问题",
  gap: "研究空白",
  conflict: "冲突",
  hypothesis: "研究假设",
  decision: "决策"
};
const MATURITY = {
  seed: "种子",
  exploring: "探索中",
  formed: "已形成判断",
  writing: "已用于写作"
};
const ROLES = {
  support: "支持",
  oppose: "反对",
  inspiration: "启发",
  background: "背景",
  verify: "待验证"
};

class ProgressModal extends Modal {
  constructor(app, plugin, onCreated, options = {}) {
    super(app);
    this.plugin = plugin;
    this.onCreated = onCreated;
    this.title = options.title || "";
    this.summary = options.summary || "";
    this.progressType = options.progressType || "finding";
    this.maturity = options.maturity || "seed";
    this.nextAction = options.nextAction || "";
    this.selected = new Map();
    if (options.paper) this.selected.set(options.paper.path, { paper: options.paper, role: options.role || "inspiration" });
    (options.papers || []).forEach(entry => {
      const paper = this.plugin.store.get(entry.path);
      if (paper) this.selected.set(paper.path, { paper, role: entry.role || "inspiration" });
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ros-progress-modal");
    contentEl.createEl("h2", { text: "记录研究进展" });
    contentEl.createEl("p", { text: "记录你因阅读而形成的认识，而不是阅读数量。之后仍可在 Markdown 中自由补充。", cls: "ros-modal-help" });

    new Setting(contentEl).setName("标题").setDesc("用一句话表达当前认识").addText(text => {
      text.setPlaceholder("例如：Agent Memory 可能需要主动遗忘机制").setValue(this.title).onChange(value => this.title = value);
      setTimeout(() => text.inputEl.focus(), 0);
    });
    new Setting(contentEl).setName("类型").addDropdown(dropdown => dropdown.addOptions(TYPES).setValue(this.progressType).onChange(value => this.progressType = value));
    new Setting(contentEl).setName("成熟度").addDropdown(dropdown => dropdown.addOptions(MATURITY).setValue(this.maturity).onChange(value => this.maturity = value));
    new Setting(contentEl).setName("当前认识").setDesc("简要写清发现、猜想或问题").addTextArea(area => {
      area.setPlaceholder("这几篇论文共同说明了什么？为什么值得继续研究？").setValue(this.summary).onChange(value => this.summary = value);
      area.inputEl.rows = 5;
    });
    new Setting(contentEl).setName("唯一下一步").setDesc("只保留现在最值得做的一件事").addText(text => text.setPlaceholder("例如：寻找关于 memory consolidation 的相关工作").setValue(this.nextAction).onChange(value => this.nextAction = value));

    contentEl.createEl("h3", { text: "关联论文" });
    contentEl.createEl("p", { text: "选择论文并标记它在这条进展中扮演的作用。", cls: "ros-modal-help" });
    const papers = contentEl.createDiv("ros-progress-paper-picker");
    const literature = this.plugin.store.byType("literature").sort((a, b) => b.mtime - a.mtime);
    literature.forEach(paper => this.renderPaperChoice(papers, paper));
    if (!literature.length) papers.createDiv({ text: "文献库中还没有论文。", cls: "ros-simple-empty" });

    const actions = contentEl.createDiv("ros-modal-actions");
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const create = actions.createEl("button", { text: "保存进展", cls: "mod-cta" });
    create.addEventListener("click", async () => {
      if (!this.title.trim()) return new Notice("请输入进展标题");
      if (!this.summary.trim()) return new Notice("请写下当前认识");
      create.disabled = true;
      try {
        const file = await this.plugin.store.createResearchProgress({
          title: this.title,
          summary: this.summary,
          progressType: this.progressType,
          maturity: this.maturity,
          nextAction: this.nextAction,
          papers: [...this.selected.values()].map(value => ({ path: value.paper.path, role: value.role }))
        });
        this.close();
        this.onCreated?.(file);
      } catch (error) {
        create.disabled = false;
        new Notice(`保存失败：${error.message}`, 7000);
      }
    });
  }

  renderPaperChoice(parent, paper) {
    const row = parent.createDiv("ros-progress-paper-choice");
    const selected = this.selected.get(paper.path);
    const checkbox = row.createEl("input", { attr: { type: "checkbox", "aria-label": `关联论文：${paper.title}` } });
    checkbox.checked = Boolean(selected);
    const copy = row.createDiv("ros-progress-paper-copy");
    copy.createDiv({ text: paper.title, cls: "ros-progress-paper-title" });
    copy.createDiv({ text: [paper.year, paper.category].filter(Boolean).join(" · "), cls: "ros-progress-paper-meta" });
    const role = row.createEl("select", { attr: { "aria-label": `${paper.title} 的证据角色` } });
    Object.entries(ROLES).forEach(([value, label]) => role.createEl("option", { text: label, attr: { value } }));
    role.value = selected?.role || "inspiration";
    role.disabled = !selected;
    checkbox.addEventListener("change", () => {
      role.disabled = !checkbox.checked;
      if (checkbox.checked) this.selected.set(paper.path, { paper, role: role.value });
      else this.selected.delete(paper.path);
    });
    role.addEventListener("change", () => { if (checkbox.checked) this.selected.set(paper.path, { paper, role: role.value }); });
  }

  onClose() { this.contentEl.empty(); }
}

module.exports = { ProgressModal, TYPES, MATURITY, ROLES };
