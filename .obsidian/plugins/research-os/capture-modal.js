const { Modal, Setting, Notice } = require("obsidian");

class CaptureModal extends Modal {
  constructor(app, plugin, onCreated, initialType = "literature") {
    super(app);
    this.plugin = plugin;
    this.onCreated = onCreated;
    this.type = initialType;
    this.title = "";
    this.project = "";
    this.authors = "";
    this.year = "";
    this.category = "未分类";
    this.pdf = "";
    this.slides = "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ros-capture-modal");
    contentEl.createEl("h2", { text: "添加文献" });
    contentEl.createEl("p", { text: "先把 PDF 或 PPT 拖入 Obsidian 附件文件夹，再填写其知识库内路径。只有标题为必填项。", cls: "ros-modal-help" });

    new Setting(contentEl).setName("标题").addText(text => {
      text.setPlaceholder("输入一个明确标题");
      text.onChange(value => this.title = value);
      setTimeout(() => text.inputEl.focus(), 0);
    });

    new Setting(contentEl).setName("作者").addText(text => text
      .setPlaceholder("例如：Don Norman")
      .onChange(value => this.authors = value));

    new Setting(contentEl).setName("年份").addText(text => text
      .setPlaceholder("例如：2024")
      .onChange(value => this.year = value));

    new Setting(contentEl).setName("分类").addText(text => text
      .setValue(this.category)
      .setPlaceholder("例如：人机交互")
      .onChange(value => this.category = value));

    new Setting(contentEl).setName("PDF 路径").setDesc("相对于知识库根目录").addText(text => text
      .setPlaceholder("09 Attachments/paper.pdf")
      .onChange(value => this.pdf = value));

    new Setting(contentEl).setName("PPT 路径").setDesc("可稍后补充").addText(text => text
      .setPlaceholder("09 Attachments/slides.pptx")
      .onChange(value => this.slides = value));

    const actions = contentEl.createDiv("ros-modal-actions");
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const create = actions.createEl("button", { text: "创建并打开", cls: "mod-cta" });
    create.addEventListener("click", async () => {
      if (!this.title.trim()) return new Notice("请输入标题");
      try {
        const file = await this.plugin.store.create("literature", this.title.trim(), "", {
          authors: this.authors.trim(),
          year: this.year.trim(),
          category: this.category.trim() || "未分类",
          pdf: this.pdf.trim(),
          slides: this.slides.trim()
        });
        this.close();
        await this.app.workspace.getLeaf("tab").openFile(file);
        this.onCreated?.(file);
        if (this.plugin.ai.settings.autoInsightEnabled && this.plugin.ai.isConfigured()) {
          await this.plugin.store.load();
          const paper = this.plugin.store.get(file.path);
          if (paper) this.plugin.ai.ensurePaperInsight(paper).then(() => this.plugin.refreshViews()).catch(error => new Notice(`论文提炼失败：${error.message}`, 8000));
        }
      } catch (error) {
        new Notice(`创建失败：${error.message}`);
      }
    });
  }

  onClose() { this.contentEl.empty(); }
}

module.exports = { CaptureModal };
