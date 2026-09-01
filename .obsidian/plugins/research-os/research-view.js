const { ItemView, Notice, setIcon, TFile } = require("obsidian");
const { CaptureModal } = require("./capture-modal");
const { PaperGraph } = require("./paper-graph");
const { ProgressModal, TYPES: PROGRESS_TYPES, MATURITY, ROLES: EVIDENCE_ROLES } = require("./progress-modal");
const { SynthesisModal } = require("./synthesis-modal");
const { LiteratureEditModal, LiteratureDeleteModal } = require("./literature-modal");

const VIEW_TYPE = "research-os-view";
const STATUS = {
  inbox: "收件箱",
  "to-read": "待读",
  reading: "阅读中",
  read: "已完成",
  annotated: "已完成"
};

class ResearchView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.section = "queue";
    this.query = "";
    this.filter = "all";
    this.selectedPath = null;
    this.aiBusy = false;
    this.paperGraph = null;
    this.progressFilter = "all";
    this.progressSuggestions = [];
    this.libraryTopic = "all";
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Research OS"; }
  getIcon() { return "book-open"; }

  async onOpen() {
    this.contentEl.addClass("research-os-host");
    this.applyForestBackground();
    await this.plugin.store.load();
    this.render();
  }

  async onClose() {
    if (this.paperGraph) { this.paperGraph.destroy(); this.paperGraph = null; }
  }

  applyForestBackground() {
    if (this.plugin.theme) return this.plugin.theme.applyTo(this.contentEl);
    const forest = this.app.vault.getAbstractFileByPath("forest.jpg");
    const forestUrl = forest
      ? this.app.vault.getResourcePath(forest)
      : this.app.vault.adapter.getResourcePath(".obsidian/plugins/research-os/forest.jpg");
    this.contentEl.style.setProperty("--ros-forest-image", `url("${forestUrl}")`);
  }

  render() {
    const root = this.contentEl;
    if (this.paperGraph) { this.paperGraph.destroy(); this.paperGraph = null; }
    root.empty();
    root.addClass("research-os-host");
    root.removeClass("ros-skin-forest");
    root.removeClass("ros-skin-crt");
    root.addClass("ros-skin-forest");
    this.applyForestBackground();
    const shell = root.createDiv("ros-shell ros-simple-shell");
    this.installFileDrop(shell);
    const dropOverlay = shell.createDiv("ros-pdf-drop-overlay");
    const dropIcon = dropOverlay.createDiv("ros-pdf-drop-icon"); setIcon(dropIcon, "file-down");
    dropOverlay.createEl("strong", { text: "松开即可导入或关联文件" });
    dropOverlay.createSpan({ text: "PDF 创建文献；PPT 与 Markdown 关联到当前论文" });
    this.renderSidebar(shell.createEl("aside", { cls: "ros-sidebar" }));
    const workspace = shell.createEl("main", { cls: "ros-workspace" });
    this.renderTopbar(workspace);
    const page = workspace.createDiv(`ros-page ros-simple-page ${this.section === "graph" ? "ros-graph-page" : ""}`);
    if (this.section === "discover") this.renderDiscovery(page);
    if (this.section === "queue") this.renderQueue(page);
    if (this.section === "library") this.renderLibrary(page);
    if (this.section === "reader") this.renderReader(page);
    if (this.section === "graph") this.renderGraph(page);
    if (this.section === "progress") this.renderResearchProgress(page);
  }

  renderSidebar(sidebar) {
    const brand = sidebar.createDiv("ros-brand");
    brand.createDiv({ text: "R", cls: "ros-brand-mark" });
    const copy = brand.createDiv("ros-brand-copy");
    copy.createDiv({ text: "Research OS", cls: "ros-brand-name" });
    copy.createDiv({ text: "Personal Literature Library", cls: "ros-brand-sub" });

    const nav = sidebar.createEl("nav", { cls: "ros-nav", attr: { "aria-label": "文献工作区" } });
    [
      ["discover", "sparkles", "AI 发现"],
      ["queue", "list-checks", "阅读队列"],
      ["library", "library", "文献库"],
      ["graph", "git-fork", "论文图谱"],
      ["progress", "sprout", "研究进展"],
      ["reader", "book-open", "阅读笔记"]
    ].forEach(([id, icon, label]) => {
      const button = nav.createEl("button", { cls: `ros-nav-item ${this.section === id ? "is-active" : ""}` });
      const iconEl = button.createSpan("ros-nav-icon"); setIcon(iconEl, icon);
      button.createSpan({ text: label });
      button.addEventListener("click", () => { this.section = id; this.render(); });
    });

    const bottom = sidebar.createDiv("ros-sidebar-bottom");
    const literature = this.plugin.store.byType("literature");
    bottom.createDiv({ text: "当前文献库", cls: "ros-meta-label" });
    bottom.createDiv({ text: this.app.vault.getName(), cls: "ros-vault-name" });
    bottom.createDiv({ text: `${literature.length} 篇文献 · ${literature.filter(x => x.status === "reading").length} 篇阅读中`, cls: "ros-vault-stats" });
  }

  renderTopbar(workspace) {
    const bar = workspace.createEl("header", { cls: "ros-topbar" });
    const title = bar.createDiv("ros-page-title");
    const titles = { discover: ["AI 论文发现", "每周筛选大模型与 Agent 新论文"], queue: ["阅读队列", "明确下一篇，保持阅读节奏"], library: ["文献库", "收集、搜索、分类与管理阅读状态"], graph: ["论文图谱", "探索论文之间的主题、作者与概念联系"], progress: ["研究进展", "把读过的论文转化为自己的判断与下一步"], reader: ["阅读笔记", "PDF、Markdown 与 AI 研究助手"] };
    title.createEl("h1", { text: titles[this.section][0] });
    title.createEl("p", { text: titles[this.section][1] });
    const tools = bar.createDiv("ros-tools");
    const searchWrap = tools.createDiv("ros-search");
    const searchIcon = searchWrap.createSpan(); setIcon(searchIcon, "search");
    const search = searchWrap.createEl("input", { attr: { type: "search", placeholder: "搜索标题、作者或分类…", "aria-label": "搜索文献" } });
    search.value = this.query;
    search.addEventListener("input", e => { this.query = e.target.value; this.render(); });
    const capture = tools.createEl("button", { cls: "ros-primary-btn" });
    const plus = capture.createSpan(); setIcon(plus, this.section === "discover" ? "refresh-cw" : this.section === "progress" ? "sprout" : "plus");
    capture.createSpan({ text: this.section === "discover" ? "立即发现" : this.section === "progress" ? "选择论文生成进展" : "手动添加" });
    capture.addEventListener("click", () => {
      if (this.section === "discover") return this.runDiscovery();
      if (this.section === "progress") return new SynthesisModal(this.app, this.plugin, () => this.render()).open();
      new CaptureModal(this.app, this.plugin, () => this.render(), "literature").open();
    });
  }

  async runDiscovery() {
    const notice = new Notice("正在抓取并分析新论文…", 0);
    try { await this.plugin.ai.runWeeklyDiscovery(true); notice.hide(); this.render(); new Notice("论文发现完成"); }
    catch (error) { notice.hide(); new Notice(error.message, 8000); }
  }

  renderDiscovery(page) {
    const intro = page.createEl("section", { cls: "ros-simple-card ros-ai-intro" });
    const last = this.plugin.ai.settings.lastDiscoveryAt ? new Date(this.plugin.ai.settings.lastDiscoveryAt).toLocaleString() : "尚未运行";
    intro.createEl("h2", { text: "本周候选论文" });
    intro.createEl("p", { text: `关注：${this.plugin.ai.settings.interests} · 上次更新：${last}` });
    if (!this.plugin.ai.isConfigured()) {
      const warning = intro.createDiv("ros-ai-warning");
      warning.createSpan({ text: "尚未配置 AI 模型服务。可以抓取论文，但无法生成个性化推荐理由与导读。" });
      const open = warning.createEl("button", { text: "打开设置" }); open.addEventListener("click", () => { this.app.setting.open(); this.app.setting.openTabById(this.plugin.manifest.id); });
    }
    const papers = (this.plugin.ai.settings.discoveries || []).filter(x => x.state !== "dismissed");
    if (!papers.length) {
      const empty = page.createDiv("ros-empty-state ros-simple-card");
      const icon = empty.createDiv("ros-empty-icon"); setIcon(icon, "radar");
      empty.createEl("h2", { text: "还没有本周推荐" });
      empty.createEl("p", { text: "点击右上角“立即发现”，系统会抓取最新论文并按你的研究兴趣排序。" });
      return;
    }
    const list = page.createDiv("ros-ai-paper-list");
    papers.forEach(paper => {
      const card = list.createEl("article", { cls: "ros-simple-card ros-ai-paper" });
      const meta = card.createDiv("ros-ai-paper-meta");
      meta.createSpan({ text: paper.source }); meta.createSpan({ text: paper.published }); meta.createSpan({ text: paper.readingMode });
      card.createEl("h2", { text: paper.title });
      card.createDiv({ text: paper.authors.slice(0,5).join(", "), cls: "ros-ai-authors" });
      card.createEl("p", { text: paper.reason || paper.abstract.slice(0,260), cls: "ros-ai-reason" });
      const foot = card.createDiv("ros-ai-paper-foot");
      foot.createSpan({ text: `相关度 ${Math.round(paper.score || 0)}` });
      const actions = foot.createDiv("ros-ai-actions");
      const dismiss = actions.createEl("button", { text: "不感兴趣" }); dismiss.addEventListener("click", async () => { paper.state = "dismissed"; await this.plugin.ai.save(); this.render(); });
      const add = actions.createEl("button", { text: paper.state === "imported" ? "已加入" : "加入阅读计划", cls: "ros-primary-btn" });
      add.disabled = paper.state === "imported";
      add.addEventListener("click", async () => {
        add.disabled = true; add.setText("正在导入…");
        try { const note = await this.plugin.ai.importDiscovery(paper); this.selectedPath = note.path; this.section = "reader"; this.render(); new Notice("论文已加入阅读计划，AI 导读已写入笔记"); }
        catch (error) { add.disabled = false; add.setText("重试"); new Notice(error.message, 8000); }
      });
      const link = actions.createEl("button", { text: "查看摘要" }); link.addEventListener("click", () => window.open(paper.url));
    });
  }

  installFileDrop(shell) {
    const internalFile = event => {
      const raw = event.dataTransfer?.getData("text/plain")?.trim() || "";
      const clean = raw.replace(/^!?\[\[/, "").replace(/\]\]$/, "").split("|")[0];
      const file = this.app.vault.getAbstractFileByPath(clean) || this.app.metadataCache.getFirstLinkpathDest(clean, this.selectedPath || "");
      return file instanceof TFile && /\.(md|ppt|pptx)$/i.test(file.name) ? file : null;
    };
    const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes("Files") || Boolean(internalFile(event));
    shell.addEventListener("dragenter", event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      shell.addClass("is-pdf-dragging");
    });
    shell.addEventListener("dragover", event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      shell.addClass("is-pdf-dragging");
    });
    shell.addEventListener("dragleave", event => {
      if (!shell.contains(event.relatedTarget)) shell.removeClass("is-pdf-dragging");
    });
    shell.addEventListener("drop", async event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      shell.removeClass("is-pdf-dragging");
      const files = Array.from(event.dataTransfer.files || []);
      const pdfs = files.filter(file => file.name.toLowerCase().endsWith(".pdf"));
      const resources = files.filter(file => /\.(md|ppt|pptx)$/i.test(file.name));
      const current = this.plugin.store.get(this.selectedPath);
      const internal = !files.length ? internalFile(event) : null;
      if (!pdfs.length && !resources.length && !internal) return new Notice("支持拖入 PDF、Markdown、PPT 和 PPTX 文件");
      if ((resources.length || internal) && (!current || this.section !== "reader")) return new Notice("请先打开一篇论文的“阅读笔记”页面，再拖入 Markdown 或 PPT");
      const notice = new Notice("正在处理拖入的文件…", 0);
      try {
        let latest = null;
        const importedPapers = [];
        for (const pdf of pdfs) { latest = await this.plugin.store.importPdf(pdf); importedPapers.push(latest.note.path); }
        for (const resource of resources) await this.plugin.store.attachResource(current, resource);
        if (internal) await this.plugin.store.attachResource(current, null, internal.path);
        await this.plugin.store.load();
        if (latest) { this.selectedPath = latest.note.path; this.section = "library"; }
        this.render();
        notice.hide();
        const parts = [];
        if (pdfs.length) parts.push(`${pdfs.length} 篇 PDF`);
        if (resources.length || internal) parts.push(`${resources.length + (internal ? 1 : 0)} 个关联文件`);
        new Notice(`已处理 ${parts.join("、")}`);
        if (this.plugin.ai.settings.autoInsightEnabled && this.plugin.ai.isConfigured()) {
          importedPapers.forEach(path => {
            const paper = this.plugin.store.get(path);
            if (paper) (async () => {
              let current = paper;
              if (paper.pdf && (!paper.raw.abstract || paper.title === paper.file.basename)) {
                try {
                  const metadata = await this.plugin.ai.repairPaperMetadata(paper);
                  current = await this.plugin.store.updateLiteratureMetadata(paper, metadata);
                } catch (error) { console.warn(`Metadata repair skipped for ${paper.path}`, error); }
              }
              await this.plugin.ai.ensurePaperInsight(current);
              await this.plugin.ai.organizeLibraryTaxonomy();
              this.render();
            })().catch(error => new Notice(`论文分析失败：${error.message}`, 8000));
          });
        }
      } catch (error) {
        notice.hide();
        new Notice(`导入失败：${error.message}`);
      }
    });
  }

  literature() {
    return this.plugin.store.search(this.query, this.plugin.store.byType("literature"));
  }

  renderQueue(page) {
    const items = this.literature();
    const active = items.filter(x => x.status === "reading");
    const next = items.filter(x => ["to-read", "inbox", "to-screen"].includes(x.status)).sort((a,b) => b.priority - a.priority);
    const done = items.filter(x => ["read", "annotated"].includes(x.status)).sort((a,b) => b.mtime - a.mtime).slice(0,5);

    const overview = page.createDiv("ros-queue-overview");
    this.renderQueueSection(overview, "正在阅读", "继续上次的进度", active, "现在没有正在阅读的文献");
    this.renderQueueSection(overview, "接下来阅读", "按优先级排列", next, "队列已清空");
    this.renderQueueSection(overview, "最近完成", "保留最近 5 篇", done, "还没有完成记录");
  }

  renderQueueSection(parent, title, hint, items, empty) {
    const panel = parent.createEl("section", { cls: "ros-simple-card ros-queue-section" });
    const head = panel.createDiv("ros-section-heading");
    head.createEl("h2", { text: title }); head.createSpan({ text: hint });
    if (!items.length) return panel.createDiv({ text: empty, cls: "ros-simple-empty" });
    items.forEach(item => this.renderLiteratureRow(panel, item, true));
  }

  renderLibrary(page) {
    const controls = page.createDiv("ros-library-controls");
    const filters = controls.createDiv("ros-filterbar");
    [["all","全部"],["inbox","收件箱"],["to-read","待读"],["reading","阅读中"],["read","已完成"]].forEach(([id,label]) => {
      const button = filters.createEl("button", { text: label, cls: this.filter === id ? "is-active" : "" });
      button.addEventListener("click", () => { this.filter = id; this.render(); });
    });
    const organize = controls.createEl("button", { cls: "ros-secondary-btn" });
    const organizeIcon = organize.createSpan(); setIcon(organizeIcon, "sparkles");
    organize.createSpan({ text: "AI 重整文献库" });
    organize.addEventListener("click", () => this.organizeLibrary(organize));
    let items = this.literature();
    if (this.filter !== "all") items = items.filter(x => this.filter === "read" ? ["read","annotated"].includes(x.status) : x.status === this.filter);
    const groups = this.groupLiteratureByTopic(items);
    const layout = page.createDiv("ros-library-layout");
    const directory = layout.createEl("aside", { cls: "ros-topic-directory", attr: { "aria-label": "AI 研究主题目录" } });
    const directoryHead = directory.createDiv("ros-topic-directory-head");
    directoryHead.createEl("h2", { text: "研究主题" });
    directoryHead.createSpan({ text: `${groups.length} 个主题` });
    const all = directory.createEl("button", { cls: this.libraryTopic === "all" ? "is-active" : "" });
    all.createSpan({ text: "全部文献" }); all.createSpan({ text: String(items.length) });
    all.addEventListener("click", () => { this.libraryTopic = "all"; this.render(); });
    groups.forEach(group => {
      const button = directory.createEl("button", { cls: this.libraryTopic === group.topic ? "is-active" : "" });
      button.createSpan({ text: group.topic }); button.createSpan({ text: String(group.items.length) });
      button.addEventListener("click", () => { this.libraryTopic = group.topic; this.render(); });
    });
    const content = layout.createDiv("ros-library-groups");
    const visibleGroups = this.libraryTopic === "all" ? groups : groups.filter(group => group.topic === this.libraryTopic);
    if (!visibleGroups.length) return content.createDiv({ text: "没有符合条件的文献", cls: "ros-simple-empty ros-simple-card" });
    visibleGroups.forEach(group => this.renderLiteratureGroup(content, group));
  }

  groupLiteratureByTopic(items) {
    const map = new Map();
    items.forEach(item => {
      const rawTopic = item.primaryTopic || item.category || "待识别";
      const normalized = this.plugin.ai.normalizeLibraryTopic(rawTopic);
      const topic = normalized === "待识别" ? this.plugin.ai.fallbackLibraryTopic(item) : normalized;
      if (!map.has(topic)) map.set(topic, []);
      map.get(topic).push(item);
    });
    return [...map.entries()].map(([topic, grouped]) => ({
      topic,
      items: grouped.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || Number(b.year || 0) - Number(a.year || 0) || a.title.localeCompare(b.title)),
      subtopics: [...new Set(grouped.flatMap(item => item.subtopics).filter(Boolean))].slice(0, 5)
    })).sort((a, b) => a.topic === "未分类" ? 1 : b.topic === "未分类" ? -1 : b.items.length - a.items.length || a.topic.localeCompare(b.topic));
  }

  renderLiteratureGroup(parent, group) {
    const section = parent.createEl("section", { cls: "ros-library-topic ros-simple-card" });
    const head = section.createDiv("ros-library-topic-head");
    const copy = head.createDiv();
    copy.createEl("h2", { text: group.topic });
    if (group.subtopics.length) copy.createEl("p", { text: group.subtopics.join(" · ") });
    head.createSpan({ text: `${group.items.length} 篇` });
    group.items.forEach(item => this.renderLiteratureRow(section, item, false));
  }

  async organizeLibrary(button) {
    if (!this.plugin.ai.isConfigured()) return new Notice("请先配置 AI 模型服务");
    let papers = this.plugin.store.byType("literature");
    if (!papers.length) return new Notice("文献库中还没有论文");
    button.disabled = true;
    button.setText(`正在校正 ${papers.length} 篇…`);
    try {
      const suspicious = papers.filter(paper => paper.pdf && (!paper.raw.abstract || /^\d+(?:[._-]\w+)*$/i.test(paper.title) || paper.title === paper.file.basename));
      for (const paper of suspicious) {
        try {
          const metadata = await this.plugin.ai.repairPaperMetadata(paper);
          await this.plugin.store.updateLiteratureMetadata(paper, metadata);
        } catch (error) { console.warn(`Metadata repair skipped for ${paper.path}`, error); }
      }
      await this.plugin.store.load();
      papers = this.plugin.store.byType("literature");
      button.setText("正在读取正文与笔记…");
      for (const paper of papers) {
        try { await this.plugin.ai.ensurePaperInsight(paper); }
        catch (error) { console.warn(`Insight refresh skipped for ${paper.path}`, error); }
      }
      button.setText("正在统一主题目录…");
      await this.plugin.ai.organizeLibraryTaxonomy();
      this.render();
      new Notice("已修复可识别的文献信息，并完成全库主题聚类");
    } catch (error) {
      button.disabled = false;
      button.setText("重新整理");
      new Notice(`整理失败：${error.message}`, 8000);
    }
  }

  renderGraph(page) {
    this.paperGraph = new PaperGraph(this, page);
    this.paperGraph.render();
  }

  researchProgress() {
    return this.plugin.store.byType("research-progress").sort((a, b) => b.mtime - a.mtime);
  }

  pendingPaperInsightCandidates() {
    return this.plugin.store.byType("paper-insight").flatMap(insight => {
      const sourcePath = this.cleanLink(insight.sourcePaper);
      const paper = this.plugin.store.get(sourcePath);
      if (!paper) return [];
      return insight.insightCandidates.filter(candidate => candidate.status === "pending").map(candidate => ({ insight, paper, candidate }));
    });
  }

  renderResearchProgress(page) {
    const items = this.researchProgress();
    const syntheses = items.filter(item => item.progressKind === "synthesis");
    const notes = items.filter(item => item.progressKind !== "synthesis");
    const intro = page.createEl("section", { cls: "ros-progress-intro ros-simple-card" });
    const introCopy = intro.createDiv();
    introCopy.createEl("h2", { text: "从论文集合形成阶段性结论" });
    introCopy.createEl("p", { text: "选择几篇相关论文，AI 会比较共识、冲突、方法和研究空白，并保留每条判断的论文依据。" });
    const create = intro.createEl("button", { cls: "ros-primary-btn" });
    const createIcon = create.createSpan(); setIcon(createIcon, "sparkles");
    create.createSpan({ text: "选择论文生成进展" });
    create.addEventListener("click", () => new SynthesisModal(this.app, this.plugin, () => this.render()).open());

    if (syntheses.length) {
      const workspace = page.createDiv("ros-synthesis-workspaces");
      const grouped = new Map();
      syntheses.forEach(item => {
        const topic = item.synthesisTopic || "未分类研究主题";
        if (!grouped.has(topic)) grouped.set(topic, []);
        grouped.get(topic).push(item);
      });
      [...grouped.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([topic, topicItems]) => {
        const section = workspace.createEl("section", { cls: "ros-synthesis-topic" });
        const head = section.createDiv("ros-synthesis-topic-head");
        head.createEl("h2", { text: topic });
        head.createSpan({ text: `${topicItems.length} 份阶段结论` });
        topicItems.sort((a, b) => b.mtime - a.mtime).forEach(item => this.renderSynthesisItem(section, item));
      });
    } else {
      const empty = page.createDiv("ros-empty-state ros-simple-card");
      empty.createEl("h2", { text: "还没有多论文综合进展" });
      empty.createEl("p", { text: "从 2–8 篇相关论文开始，围绕一个问题生成第一份阶段性结论。" });
    }

    const automatic = this.pendingPaperInsightCandidates();
    if (automatic.length || notes.length) {
      const drawer = page.createEl("details", { cls: "ros-progress-inbox ros-simple-card" });
      drawer.createEl("summary", { text: `待整理材料 ${automatic.length + notes.length}` });
      const inbox = drawer.createDiv("ros-progress-suggestions");
      const inboxHead = inbox.createDiv("ros-section-heading");
      inboxHead.createEl("h2", { text: "单篇论文线索" });
      inboxHead.createSpan({ text: "可保留为独立笔记，或用于下一次多论文综合" });
      automatic.forEach(({ insight, paper, candidate }) => {
        const row = inbox.createDiv("ros-progress-suggestion");
        const copy = row.createDiv();
        copy.createSpan({ text: PROGRESS_TYPES[candidate.type] || "研究进展", cls: `ros-progress-type is-${candidate.type}` });
        copy.createEl("h3", { text: candidate.title });
        copy.createEl("p", { text: candidate.summary });
        copy.createEl("small", { text: `来源：${paper.title}${candidate.nextAction ? ` · 下一步：${candidate.nextAction}` : ""}` });
        const actions = row.createDiv("ros-progress-suggestion-actions");
        const dismiss = actions.createEl("button", { text: "忽略" });
        dismiss.addEventListener("click", async () => { await this.plugin.store.updateInsightCandidate(insight, candidate.id, "dismissed"); this.render(); });
        const save = actions.createEl("button", { text: "保留", cls: "ros-primary-btn" });
        save.addEventListener("click", () => this.promoteInsightCandidate(paper, insight, candidate, save));
      });
      if (notes.length) {
        const noteHead = inbox.createDiv("ros-section-heading");
        noteHead.createEl("h2", { text: "已保留的独立笔记" });
        noteHead.createSpan({ text: `${notes.length} 条` });
        notes.forEach(item => this.renderProgressItem(inbox, item));
      }
    }
  }

  renderSynthesisItem(parent, item) {
    const article = parent.createEl("article", { cls: "ros-synthesis-item ros-simple-card" });
    const head = article.createDiv("ros-synthesis-item-head");
    const copy = head.createDiv();
    copy.createEl("h3", { text: item.title });
    copy.createSpan({ text: `${item.papers.length} 篇论文 · 第 ${item.synthesisVersion} 版 · ${item.updated}` });
    const status = head.createSpan({ text: item.maturity === "draft" ? "待核验" : MATURITY[item.maturity] || "阶段结论", cls: "ros-synthesis-status" });
    article.createEl("p", { text: item.synthesisSections.conclusion || item.summary || "尚未形成当前结论", cls: "ros-synthesis-conclusion" });
    const metrics = article.createDiv("ros-synthesis-metrics");
    [["共识", item.synthesisSections.consensus], ["冲突", item.synthesisSections.conflicts], ["研究空白", item.synthesisSections.gaps]].forEach(([label, value]) => {
      if (!value) return;
      const metric = metrics.createDiv(); metric.createSpan({ text: label }); metric.createEl("p", { text: value });
    });
    const foot = article.createDiv("ros-synthesis-item-foot");
    const sources = foot.createDiv("ros-synthesis-source-stack");
    item.papers.slice(0, 4).forEach(reference => {
      const paper = this.plugin.store.get(this.cleanLink(reference));
      if (paper) sources.createSpan({ text: paper.title.slice(0, 1), attr: { title: paper.title } });
    });
    foot.createSpan({ text: item.researchGoal || "由 AI 识别共同研究问题" });
    const open = foot.createEl("button", { text: "打开完整进展" });
    open.addEventListener("click", () => this.app.workspace.getLeaf("tab").openFile(item.file));
  }

  renderProgressItem(parent, item) {
    const article = parent.createEl("article", { cls: "ros-progress-item ros-simple-card" });
    const head = article.createDiv("ros-progress-item-head");
    const heading = head.createDiv();
    heading.createSpan({ text: PROGRESS_TYPES[item.progressType] || "进展", cls: `ros-progress-type is-${item.progressType || "finding"}` });
    heading.createEl("h2", { text: item.title });
    const maturity = head.createEl("select", { cls: "ros-progress-maturity", attr: { "aria-label": `${item.title}的成熟度` } });
    Object.entries(MATURITY).forEach(([value, label]) => maturity.createEl("option", { text: label, attr: { value } }));
    maturity.value = item.maturity || "seed";
    maturity.addEventListener("change", async () => { await this.plugin.store.updateProgressMaturity(item, maturity.value); this.render(); });
    if (item.summary) article.createEl("p", { text: item.summary, cls: "ros-progress-summary" });

    const paperRow = article.createDiv("ros-progress-linked-papers");
    item.papers.forEach(reference => {
      const path = this.cleanLink(reference);
      const paper = this.plugin.store.get(path) || this.literature().find(candidate => candidate.file.basename === path.replace(/^.*\//, ""));
      if (!paper) return;
      const chip = paperRow.createEl("button", { cls: "ros-progress-paper-chip" });
      chip.createSpan({ text: EVIDENCE_ROLES[item.evidenceRoles[path]] || EVIDENCE_ROLES[item.evidenceRoles[paper.path]] || "关联" });
      chip.createSpan({ text: paper.title });
      chip.addEventListener("click", () => { this.selectedPath = paper.path; this.section = "reader"; this.render(); });
    });
    const foot = article.createDiv("ros-progress-item-foot");
    const next = foot.createDiv("ros-progress-next");
    next.createSpan({ text: "下一步" });
    next.createEl("strong", { text: item.nextAction || "尚未设置" });
    const actions = foot.createDiv("ros-progress-item-actions");
    actions.createSpan({ text: `更新于 ${item.updated}` });
    const open = actions.createEl("button", { text: "打开完整笔记" });
    open.addEventListener("click", () => this.app.workspace.getLeaf("tab").openFile(item.file));
  }

  cleanLink(value) {
    return String(value || "").replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
  }

  async generateProgressSuggestions(button) {
    const read = this.literature().filter(item => ["read", "annotated"].includes(item.status));
    if (!read.length) return new Notice("请先将至少一篇论文标记为已完成");
    button.disabled = true;
    const label = button.querySelector("span:last-child");
    if (label) label.setText("正在综合已读论文…");
    try {
      this.progressSuggestions = await this.plugin.ai.suggestResearchProgress(read);
      if (!this.progressSuggestions.length) new Notice("暂未发现足够明确的候选线索");
      this.render();
    } catch (error) {
      button.disabled = false;
      if (label) label.setText("从已读论文寻找线索");
      new Notice(error.message, 8000);
    }
  }

  renderLiteratureRow(parent, item, compact) {
    const row = parent.createDiv({ cls: `ros-literature-row ${compact ? "is-compact" : ""}` });
    const openArea = row.createEl("button", { cls: "ros-literature-open", attr: { "aria-label": `打开文献：${item.title}` } });
    const main = openArea.createDiv("ros-literature-main");
    main.createDiv({ text: item.title, cls: "ros-row-title" });
    const meta = [item.authors.join(", "), item.year, item.journal].filter(Boolean).join(" · ");
    main.createDiv({ text: meta || "未补充文献信息", cls: "ros-row-meta" });
    if (!compact) {
      main.createEl("p", { text: item.raw.abstract ? String(item.raw.abstract).slice(0, 220) : "摘要尚未识别，可点击编辑按钮从 PDF 自动补全。", cls: `ros-row-abstract ${item.raw.abstract ? "" : "is-missing"}` });
      const taxonomy = main.createDiv("ros-row-taxonomy");
      const subtopics = item.subtopics.slice(0, 2);
      const methods = item.methods.slice(0, 2);
      if (subtopics.length) taxonomy.createSpan({ text: `子方向：${subtopics.join(" / ")}` });
      if (methods.length) taxonomy.createSpan({ text: `方法：${methods.join(" / ")}` });
      if (!subtopics.length && !methods.length) taxonomy.createSpan({ text: "等待 AI 完善子方向与方法" });
    }
    const resources = openArea.createDiv("ros-resource-icons");
    this.resourceIcon(resources, "file-text", true, "Markdown 笔记");
    if (item.pdf) this.resourceIcon(resources, "file-scan", true, "PDF");
    if (item.slides) this.resourceIcon(resources, "presentation", true, "PPT");
    const state = openArea.createDiv("ros-row-state");
    state.createSpan({ text: STATUS[item.status] || "未设置", cls: `ros-status status-${item.status}` });
    if (item.status === "reading") state.createSpan({ text: `${item.progress}%`, cls: "ros-progress-text" });
    openArea.addEventListener("click", () => { this.selectedPath = item.path; this.section = "reader"; this.render(); });
    if (!compact) {
      const actions = row.createDiv("ros-literature-actions");
      const edit = actions.createEl("button", { attr: { "aria-label": `编辑 ${item.title}`, title: "编辑文献信息" } });
      setIcon(edit, "pencil");
      edit.addEventListener("click", () => new LiteratureEditModal(this.app, this.plugin, item, () => this.render()).open());
      const remove = actions.createEl("button", { attr: { "aria-label": `删除 ${item.title}`, title: "删除文献" } });
      setIcon(remove, "trash-2");
      remove.addEventListener("click", () => new LiteratureDeleteModal(this.app, this.plugin, item, () => this.render()).open());
    }
  }

  resourceIcon(parent, icon, enabled, label) {
    const span = parent.createSpan({ cls: enabled ? "is-ready" : "" , attr: { title: label } });
    setIcon(span, icon);
  }

  renderReader(page) {
    const item = this.plugin.store.get(this.selectedPath) || this.literature().find(x => x.status === "reading") || this.literature()[0];
    if (!item) return this.renderEmpty(page, "还没有可阅读的文献", "先在文献库添加一篇文献。", true);
    this.selectedPath = item.path;
    const reader = page.createDiv("ros-reader-layout");
    const head = reader.createEl("section", { cls: "ros-simple-card ros-reader-head" });
    head.createDiv({ text: item.category || "未分类", cls: "ros-detail-kind" });
    head.createEl("h2", { text: item.title });
    head.createDiv({ text: [item.authors.join(", "), item.year, item.journal].filter(Boolean).join(" · ") || "尚未补充作者与出版信息", cls: "ros-reader-meta" });
    const insight = this.plugin.store.getPaperInsight(item.path);
    const headActions = head.createDiv("ros-reader-head-actions");
    const extract = headActions.createEl("button", { cls: "ros-secondary-btn" });
    const extractIcon = extract.createSpan(); setIcon(extractIcon, "sprout");
    extract.createSpan({ text: insight ? "重新提炼本篇论文" : "生成十问提炼" });
    extract.addEventListener("click", () => this.generatePaperInsight(item, extract, true));

    const resources = reader.createEl("section", { cls: "ros-simple-card ros-resource-panel" });
    const sectionHead = resources.createDiv("ros-section-heading"); sectionHead.createEl("h2", { text: "论文资料夹" }); sectionHead.createSpan({ text: "PDF、笔记、学习记录与演示材料" });
    this.renderResourceButton(resources, item, "pdf", "file-scan", "原文 PDF", "阅读、高亮与勾画", item.pdf);
    this.renderReadingNotes(resources, item);
    this.renderResourceButton(resources, item, "slides", "presentation", "PPT / 演示", "汇报或课程材料", item.slides);

    const progress = reader.createEl("section", { cls: "ros-simple-card ros-reading-control" });
    const progressHead = progress.createDiv("ros-section-heading"); progressHead.createEl("h2", { text: "阅读进度" }); progressHead.createSpan({ text: `${item.progress}%` });
    const slider = progress.createEl("input", { attr: { type: "range", min: "0", max: "100", value: String(item.progress), "aria-label": "阅读进度" } });
    slider.addEventListener("change", async e => { await this.plugin.store.updateProgress(item, e.target.value); this.render(); });
    const actions = progress.createDiv("ros-reader-statuses");
    [["inbox","收件箱"],["to-read","待读"],["reading","阅读中"],["read","已完成"]].forEach(([status,label]) => {
      const button = actions.createEl("button", { text: label, cls: ["read","annotated"].includes(item.status) && status === "read" || item.status === status ? "is-active" : "" });
      button.addEventListener("click", async () => {
        await this.plugin.store.updateStatus(item,status);
        this.render();
        if (status === "read" && this.plugin.ai.settings.autoInsightEnabled && this.plugin.ai.isConfigured()) {
          const current = this.plugin.store.get(item.path) || item;
          this.plugin.ai.ensurePaperInsight(current, true).then(() => this.render()).catch(error => new Notice(`完成阅读后的提炼更新失败：${error.message}`, 8000));
        }
      });
    });
    const related = this.researchProgress().filter(progressItem => progressItem.papers.some(reference => {
      const path = this.cleanLink(reference);
      return path === item.path || path === item.file.basename;
    }));
    if (related.length) {
      const contribution = reader.createEl("section", { cls: "ros-simple-card ros-paper-progress" });
      const contributionHead = contribution.createDiv("ros-section-heading");
      contributionHead.createEl("h2", { text: "促成的研究进展" });
      contributionHead.createSpan({ text: `${related.length} 条` });
      related.forEach(progressItem => {
        const row = contribution.createEl("button", { cls: "ros-paper-progress-row" });
        row.createSpan({ text: PROGRESS_TYPES[progressItem.progressType] || "进展", cls: `ros-progress-type is-${progressItem.progressType || "finding"}` });
        row.createEl("strong", { text: progressItem.title });
        row.createSpan({ text: MATURITY[progressItem.maturity] || "种子" });
        row.addEventListener("click", () => this.app.workspace.getLeaf("tab").openFile(progressItem.file));
      });
    }
    this.renderPaperInsight(reader, item, insight);
    this.renderPaperAI(reader, item);
  }

  renderPaperInsight(reader, paper, insight) {
    const panel = reader.createEl("section", { cls: "ros-simple-card ros-paper-insight" });
    const head = panel.createDiv("ros-section-heading");
    head.createEl("h2", { text: "AI 十问提炼" });
    head.createSpan({ text: insight ? `${insight.extractionLevel === "notes" ? "笔记增强" : insight.extractionLevel === "abstract" ? "摘要级" : "元数据级"} · ${insight.generatedAt ? new Date(insight.generatedAt).toLocaleDateString() : "已生成"}` : "尚未生成" });
    if (!insight) {
      const empty = panel.createDiv("ros-insight-empty");
      empty.createEl("p", { text: this.plugin.ai.isConfigured() ? "系统会依据论文材料回答十个研究问题，并生成可保留的候选进展。" : "配置 AI 模型服务后，可以自动生成每篇论文的十问提炼。" });
      const button = empty.createEl("button", { text: "生成十问提炼", cls: "ros-primary-btn" });
      button.disabled = !this.plugin.ai.isConfigured();
      button.addEventListener("click", () => this.generatePaperInsight(paper, button, true));
      return;
    }
    const questions = [
      "论文试图解决什么问题？", "这是否是一个新的问题？", "这篇文章要验证一个什么科学假设？",
      "有哪些相关研究？如何归类？谁是这一领域内值得关注的研究员？", "论文中提到的解决方案之关键是什么？",
      "论文中的实验是如何设计的？", "用于定量评估的数据集是什么？代码有没有开源？",
      "论文中的实验及结果有没有很好地支持需要验证的科学假设？", "这篇论文到底有什么贡献？",
      "下一步呢？有什么工作可以继续深入？"
    ];
    const list = panel.createDiv("ros-insight-questions");
    questions.forEach((question, index) => {
      const detail = list.createEl("details", { cls: "ros-insight-question" });
      if (index === 0) detail.open = true;
      const summary = detail.createEl("summary");
      summary.createSpan({ text: `Q${index + 1}`, cls: "ros-insight-number" });
      summary.createSpan({ text: question });
      detail.createEl("p", { text: insight.insightAnswers[`q${index + 1}`] || "材料中未说明。" });
    });
    const pending = insight.insightCandidates.filter(candidate => candidate.status === "pending");
    const candidateSection = panel.createDiv("ros-insight-candidates");
    const candidateHead = candidateSection.createDiv("ros-section-heading");
    candidateHead.createEl("h3", { text: "候选研究进展" });
    candidateHead.createSpan({ text: pending.length ? `${pending.length} 条待确认` : "已处理" });
    if (!pending.length) candidateSection.createEl("p", { text: "当前没有待确认的候选进展。", cls: "ros-simple-empty" });
    pending.forEach(candidate => {
      const row = candidateSection.createDiv("ros-insight-candidate");
      const copy = row.createDiv("ros-insight-candidate-copy");
      copy.createSpan({ text: PROGRESS_TYPES[candidate.type] || "研究进展", cls: `ros-progress-type is-${candidate.type}` });
      copy.createEl("h3", { text: candidate.title });
      copy.createEl("p", { text: candidate.summary });
      if (candidate.nextAction) copy.createEl("small", { text: `下一步：${candidate.nextAction}` });
      const actions = row.createDiv("ros-insight-candidate-actions");
      const ignore = actions.createEl("button", { text: "忽略" });
      ignore.addEventListener("click", async () => { await this.plugin.store.updateInsightCandidate(insight, candidate.id, "dismissed"); this.render(); });
      const keep = actions.createEl("button", { text: "保留为研究进展", cls: "ros-primary-btn" });
      keep.addEventListener("click", () => this.promoteInsightCandidate(paper, insight, candidate, keep));
    });
    const foot = panel.createDiv("ros-insight-footer");
    const open = foot.createEl("button", { text: "打开完整提炼笔记", cls: "ros-secondary-btn" });
    open.addEventListener("click", () => this.app.workspace.getLeaf("tab").openFile(insight.file));
  }

  async generatePaperInsight(paper, button, force = false) {
    if (this.aiBusy) return;
    this.aiBusy = true;
    button.disabled = true;
    const original = button.textContent;
    button.setText("正在回答十个问题…");
    try {
      await this.plugin.ai.ensurePaperInsight(paper, force);
      this.aiBusy = false;
      await this.plugin.store.load();
      this.render();
      new Notice("论文十问提炼已更新");
    } catch (error) {
      this.aiBusy = false;
      button.disabled = false;
      button.setText(original);
      new Notice(`论文提炼失败：${error.message}`, 8000);
    }
  }

  async promoteInsightCandidate(paper, insight, candidate, button) {
    button.disabled = true;
    try {
      await this.plugin.store.createResearchProgress({
        title: candidate.title,
        summary: candidate.summary,
        progressType: candidate.type,
        maturity: "seed",
        nextAction: candidate.nextAction,
        papers: [{ path: paper.path, role: candidate.type === "finding" ? "support" : "inspiration" }]
      });
      await this.plugin.store.updateInsightCandidate(insight, candidate.id, "kept");
      this.render();
      new Notice("已保留为研究进展");
    } catch (error) {
      button.disabled = false;
      new Notice(`保存研究进展失败：${error.message}`, 8000);
    }
  }

  renderPaperAI(reader, item) {
    const panel = reader.createEl("section", { cls: "ros-simple-card ros-paper-ai" });
    const head = panel.createDiv("ros-section-heading"); head.createEl("h2", { text: "AI 论文助手" }); head.createSpan({ text: this.plugin.ai.model() });
    const guide = panel.createEl("button", { text: "重新生成 AI 导读", cls: "ros-secondary-btn" });
    guide.disabled = this.aiBusy;
    guide.addEventListener("click", async () => {
      this.aiBusy = true; guide.disabled = true; guide.setText("正在分析…");
      try { await this.plugin.ai.generateGuide(item.file); this.aiBusy = false; this.render(); new Notice("AI 导读已更新到 Markdown 笔记"); }
      catch (error) { this.aiBusy = false; guide.disabled = false; guide.setText("重新生成 AI 导读"); new Notice(error.message, 8000); }
    });
    const history = this.plugin.ai.settings.chats[item.path] || [];
    const messages = panel.createDiv("ros-ai-chat");
    history.slice(-6).forEach(message => {
      const bubble = messages.createDiv(`ros-ai-message is-${message.role}`);
      bubble.createDiv({ text: message.role === "user" ? "你" : "AI", cls: "ros-ai-role" });
      bubble.createDiv({ text: message.content, cls: "ros-ai-content" });
    });
    if (!history.length) messages.createDiv({ text: "可以问：这篇论文解决了什么？方法为什么有效？给一个具体例子。", cls: "ros-simple-empty" });
    const compose = panel.createDiv("ros-ai-compose");
    const input = compose.createEl("textarea", { attr: { placeholder: "针对这篇论文提问…", rows: "3", "aria-label": "论文问题" } });
    const send = compose.createEl("button", { text: "发送", cls: "ros-primary-btn" });
    send.addEventListener("click", async () => {
      const question = input.value.trim(); if (!question || this.aiBusy) return;
      this.aiBusy = true; send.disabled = true; send.setText("思考中…");
      try { await this.plugin.ai.askPaper(item, question); this.aiBusy = false; this.render(); }
      catch (error) { this.aiBusy = false; send.disabled = false; send.setText("发送"); new Notice(error.message, 8000); }
    });
    const lastAssistant = [...history].reverse().find(x => x.role === "assistant");
    const lastQuestion = [...history].reverse().find(x => x.role === "user");
    if (lastAssistant && lastQuestion) {
      const save = panel.createEl("button", { text: "将最近回答保存到 Markdown", cls: "ros-ai-save" });
      save.addEventListener("click", async () => { await this.plugin.ai.saveChatToNote(item,lastQuestion.content,lastAssistant.content); new Notice("已保存到文献笔记"); });
    }
  }

  renderResourceButton(parent, item, kind, icon, title, help, path) {
    const button = parent.createEl("button", { cls: `ros-resource-button ${path ? "is-available" : "is-missing"}` });
    const iconEl = button.createSpan("ros-resource-button-icon"); setIcon(iconEl, icon);
    const copy = button.createSpan("ros-resource-button-copy"); copy.createSpan({ text: title }); copy.createEl("small", { text: path ? help : "尚未关联文件" });
    const action = button.createSpan({ text: path ? (kind === "pdf" ? "分栏阅读" : "打开") : "待关联", cls: "ros-resource-action" });
    button.addEventListener("click", async () => {
      if (!path) return new Notice(`请在文献笔记 Properties 中填写 ${kind === "pdf" ? "pdf" : "slides"} 文件路径`);
      if (kind === "pdf") return this.openReadingPair(item, path);
      await this.openResource(path, item.file);
    });
  }

  renderReadingNotes(parent, item) {
    const group = parent.createEl("section", { cls: "ros-reading-notes-group" });
    const head = group.createDiv("ros-reading-notes-head");
    const title = head.createDiv();
    const icon = title.createSpan(); setIcon(icon, "folder-open");
    const copy = title.createDiv();
    copy.createEl("strong", { text: "Markdown 学习资料夹" });
    copy.createSpan({ text: `${item.readingNotes.length} 份记录 · 可继续拖入多个 MD` });
    const create = head.createEl("button", { text: "+ 新建学习过程" });
    create.addEventListener("click", async () => {
      create.disabled = true;
      try {
        const file = await this.plugin.store.createLearningNote(item, "learning");
        await this.plugin.store.load();
        this.selectedPath = item.path;
        this.render();
        await this.app.workspace.getLeaf("tab").openFile(file);
      } catch (error) {
        create.disabled = false;
        new Notice(`创建失败：${error.message}`, 7000);
      }
    });
    const list = group.createDiv("ros-reading-notes-list");
    if (!item.readingNotes.length) {
      const empty = list.createDiv("ros-reading-notes-empty");
      empty.createSpan({ text: "还没有独立 Markdown 记录" });
      const main = empty.createEl("button", { text: "创建主阅读笔记" });
      main.addEventListener("click", async () => {
        main.disabled = true;
        try {
          const file = await this.plugin.store.createLearningNote(item, "main");
          await this.plugin.store.load();
          this.render();
          await this.app.workspace.getLeaf("tab").openFile(file);
        } catch (error) {
          main.disabled = false;
          new Notice(`创建失败：${error.message}`, 7000);
        }
      });
      return;
    }
    item.readingNotes.forEach((value, index) => {
      const file = this.plugin.store.resolveLink(value, item.path);
      const row = list.createEl("button", { cls: "ros-reading-note-row" });
      const isMain = value === item.readingNote;
      const rowIcon = row.createSpan(); setIcon(rowIcon, isMain ? "book-open" : "message-square-text");
      const rowCopy = row.createDiv();
      rowCopy.createEl("strong", { text: file?.basename || this.cleanLink(value).split("/").pop() || "Markdown 记录" });
      rowCopy.createSpan({ text: isMain ? "主阅读笔记" : "学习过程 / 补充记录" });
      const arrow = row.createSpan(); setIcon(arrow, "arrow-up-right");
      row.disabled = !file;
      row.addEventListener("click", () => file && this.app.workspace.getLeaf("tab").openFile(file));
    });
  }

  async openReadingPair(item, pdfPath) {
    const clean = String(pdfPath).replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
    const pdfFile = this.app.metadataCache.getFirstLinkpathDest(clean, item.file.path) || this.app.vault.getAbstractFileByPath(clean);
    if (!(pdfFile instanceof TFile)) return new Notice(`找不到 PDF：${clean}`);
    const pdfLeaf = this.app.workspace.getLeaf("tab");
    await pdfLeaf.openFile(pdfFile);
    const noteLeaf = typeof this.app.workspace.createLeafBySplit === "function"
      ? this.app.workspace.createLeafBySplit(pdfLeaf, "vertical", false)
      : this.app.workspace.getLeaf("split", "vertical");
    const notePath = item.readingNote ? String(item.readingNote).replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0] : item.path;
    const linkedNote = this.app.metadataCache.getFirstLinkpathDest(notePath, item.file.path) || this.app.vault.getAbstractFileByPath(notePath);
    await noteLeaf.openFile(linkedNote instanceof TFile ? linkedNote : item.file);
    this.app.workspace.revealLeaf(pdfLeaf);
  }

  async openResource(value, sourceFile) {
    if (value instanceof TFile) return this.app.workspace.getLeaf("tab").openFile(value);
    const clean = String(value).replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
    const file = this.app.metadataCache.getFirstLinkpathDest(clean, sourceFile.path) || this.app.vault.getAbstractFileByPath(clean);
    if (file instanceof TFile) return this.app.workspace.getLeaf("tab").openFile(file);
    new Notice(`找不到文件：${clean}`);
  }

  renderEmpty(parent, title, body, action) {
    const empty = parent.createDiv("ros-empty-state ros-simple-card");
    const icon = empty.createDiv("ros-empty-icon"); setIcon(icon, "book-open");
    empty.createEl("h2", { text: title }); empty.createEl("p", { text: body });
    if (action) {
      const button = empty.createEl("button", { text: "添加文献", cls: "ros-primary-btn" });
      button.addEventListener("click", () => new CaptureModal(this.app, this.plugin, () => this.render(), "literature").open());
    }
  }
}

module.exports = { ResearchView, VIEW_TYPE };
