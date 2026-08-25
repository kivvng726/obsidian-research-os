const { Modal, Setting, Notice } = require("obsidian");

class LiteratureEditModal extends Modal {
  constructor(app, plugin, item, onSaved) {
    super(app);
    this.plugin = plugin;
    this.item = item;
    this.onSaved = onSaved;
    this.values = {
      title: item.title,
      authors: item.authors.join(", "),
      year: item.year,
      journal: item.journal,
      abstract: item.raw.abstract || "",
      primaryTopic: item.primaryTopic || item.category,
      subtopics: item.subtopics.join(", "),
      methods: item.methods.join(", ")
    };
  }

  onOpen() {
    const root = this.contentEl;
    root.addClass("ros-literature-edit-modal");
    root.createEl("h2", { text: "编辑文献信息" });
    root.createEl("p", { text: "修改只会更新文献笔记的 Properties，不会改动 PDF 正文。", cls: "ros-modal-help" });
    this.text(root, "论文标题", "title");
    this.text(root, "作者", "authors", "多人用逗号分隔");
    this.text(root, "年份", "year");
    this.text(root, "会议 / 期刊", "journal");
    new Setting(root).setName("摘要").addTextArea(area => {
      area.setValue(this.values.abstract).onChange(value => this.values.abstract = value);
      area.inputEl.rows = 6;
    });
    this.text(root, "一级研究主题", "primaryTopic");
    this.text(root, "子方向", "subtopics", "多个方向用逗号分隔");
    this.text(root, "方法", "methods", "多个方法用逗号分隔");
    const actions = root.createDiv("ros-modal-actions");
    const repair = actions.createEl("button", { text: "从 PDF 自动识别" });
    repair.disabled = !this.item.pdf;
    repair.addEventListener("click", () => this.repair(repair));
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { text: "保存", cls: "mod-cta" });
    save.addEventListener("click", () => this.save(save));
  }

  text(root, name, key, description = "") {
    const setting = new Setting(root).setName(name);
    if (description) setting.setDesc(description);
    setting.addText(input => input.setValue(String(this.values[key] || "")).onChange(value => this.values[key] = value));
  }

  list(value) {
    return String(value || "").split(/[,，;；]/).map(item => item.trim()).filter(Boolean);
  }

  async save(button) {
    if (!this.values.title.trim()) return new Notice("论文标题不能为空");
    button.disabled = true;
    try {
      await this.plugin.store.updateLiteratureMetadata(this.item, {
        ...this.values,
        authors: this.list(this.values.authors),
        subtopics: this.list(this.values.subtopics),
        methods: this.list(this.values.methods)
      });
      this.close();
      this.onSaved?.();
    } catch (error) {
      button.disabled = false;
      new Notice(`保存失败：${error.message}`, 7000);
    }
  }

  async repair(button) {
    button.disabled = true;
    button.setText("正在读取 PDF…");
    try {
      const identified = await this.plugin.ai.repairPaperMetadata(this.item);
      this.values.title = identified.title || this.values.title;
      this.values.authors = identified.authors.length ? identified.authors.join(", ") : this.values.authors;
      this.values.year = identified.year || this.values.year;
      this.values.journal = identified.journal || this.values.journal;
      this.values.abstract = identified.abstract || this.values.abstract;
      this.contentEl.empty();
      this.onOpen();
      new Notice("已从 PDF 识别标题、作者与摘要，请检查后保存");
    } catch (error) {
      button.disabled = false;
      button.setText("重试自动识别");
      new Notice(`识别失败：${error.message}`, 8000);
    }
  }

  onClose() { this.contentEl.empty(); }
}

class LiteratureDeleteModal extends Modal {
  constructor(app, plugin, item, onDeleted) {
    super(app);
    this.plugin = plugin;
    this.item = item;
    this.onDeleted = onDeleted;
    this.deleteAttachments = false;
  }

  onOpen() {
    const root = this.contentEl;
    root.addClass("ros-literature-delete-modal");
    root.createEl("h2", { text: "从文献库删除？" });
    root.createEl("p", { text: this.item.title });
    root.createEl("p", { text: "默认只把文献笔记移到系统回收站，原始 PDF、PPT 和独立笔记会继续保留。", cls: "ros-modal-help" });
    new Setting(root).setName("同时删除关联材料").setDesc("包括 PDF、PPT、独立 Markdown 笔记和 AI 十问提炼；文件会进入系统回收站。")
      .addToggle(toggle => toggle.setValue(false).onChange(value => this.deleteAttachments = value));
    const actions = root.createDiv("ros-modal-actions");
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const remove = actions.createEl("button", { text: "移到回收站", cls: "mod-warning" });
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await this.plugin.store.deleteLiterature(this.item, this.deleteAttachments);
        this.close();
        this.onDeleted?.();
        new Notice("文献已移到回收站");
      } catch (error) {
        remove.disabled = false;
        new Notice(`删除失败：${error.message}`, 7000);
      }
    });
  }

  onClose() { this.contentEl.empty(); }
}

module.exports = { LiteratureEditModal, LiteratureDeleteModal };
