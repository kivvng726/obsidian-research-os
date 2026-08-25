const { Modal, Notice, setIcon } = require("obsidian");

class SynthesisModal extends Modal {
  constructor(app, plugin, onCreated, initialPaths = []) {
    super(app);
    this.plugin = plugin;
    this.onCreated = onCreated;
    this.selected = new Set(initialPaths);
    this.query = "";
    this.topic = "";
    this.goal = "";
    this.step = 1;
  }

  onOpen() {
    this.contentEl.addClass("ros-synthesis-modal");
    this.render();
  }

  render() {
    const root = this.contentEl;
    root.empty();
    const head = root.createDiv("ros-synthesis-head");
    const copy = head.createDiv();
    copy.createEl("h2", { text: this.step === 1 ? "选择要一起研究的论文" : "确定这次要弄清楚的问题" });
    copy.createEl("p", { text: this.step === 1 ? "建议选择 3–8 篇。AI 会先补齐单篇提炼，再比较它们之间的共识、差异和空白。" : "一个明确的问题能让综合结论更聚焦；也可以留空，由 AI 自动识别共同主题。" });
    head.createSpan({ text: `${this.step} / 2`, cls: "ros-synthesis-step" });
    if (this.step === 1) this.renderPaperStep(root);
    else this.renderGoalStep(root);
  }

  renderPaperStep(root) {
    const search = root.createEl("input", { cls: "ros-synthesis-search", attr: { type: "search", placeholder: "搜索标题、作者、主题或方法…", "aria-label": "搜索可关联论文" } });
    search.value = this.query;
    search.addEventListener("input", event => { this.query = event.target.value; this.render(); });
    const papers = this.plugin.store.byType("literature");
    const q = this.query.trim().toLowerCase();
    const visible = papers.filter(paper => !q || [paper.title, ...paper.authors, paper.primaryTopic, ...paper.subtopics, ...paper.methods].join(" ").toLowerCase().includes(q));
    const topics = this.groupByTopic(visible);
    const list = root.createDiv("ros-synthesis-paper-list");
    if (!visible.length) list.createDiv({ text: "没有找到匹配的论文", cls: "ros-simple-empty" });
    topics.forEach(group => {
      const section = list.createEl("section", { cls: "ros-synthesis-paper-group" });
      const groupHead = section.createDiv("ros-synthesis-group-head");
      groupHead.createEl("h3", { text: group.topic });
      groupHead.createSpan({ text: `${group.papers.length} 篇` });
      group.papers.forEach(paper => {
        const label = section.createEl("label", { cls: `ros-synthesis-paper ${this.selected.has(paper.path) ? "is-selected" : ""}` });
        const checkbox = label.createEl("input", { attr: { type: "checkbox" } });
        checkbox.checked = this.selected.has(paper.path);
        const body = label.createDiv();
        body.createEl("strong", { text: paper.title });
        body.createSpan({ text: [paper.year, paper.authors.slice(0, 3).join(", "), paper.methods.slice(0, 2).join(" / ")].filter(Boolean).join(" · ") || "等待 AI 补充分类" });
        const state = label.createSpan({ text: this.plugin.store.getPaperInsight(paper.path) ? "已提炼" : "将自动提炼", cls: "ros-synthesis-paper-state" });
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) this.selected.add(paper.path); else this.selected.delete(paper.path);
          this.render();
        });
      });
    });
    this.renderActions(root, false);
  }

  renderGoalStep(root) {
    const selected = [...this.selected].map(path => this.plugin.store.get(path)).filter(Boolean);
    const summary = root.createDiv("ros-synthesis-selection-summary");
    summary.createEl("strong", { text: `已选择 ${selected.length} 篇论文` });
    summary.createSpan({ text: this.suggestedTopic(selected) });
    const form = root.createDiv("ros-synthesis-form");
    const topicLabel = form.createEl("label");
    topicLabel.createSpan({ text: "研究主题" });
    const topic = topicLabel.createEl("input", { attr: { type: "text", placeholder: "例如：Agent 安全对齐" } });
    topic.value = this.topic || this.suggestedTopic(selected, true);
    topic.addEventListener("input", event => this.topic = event.target.value);
    const goalLabel = form.createEl("label");
    goalLabel.createSpan({ text: "我想通过这些论文弄清楚什么？" });
    const goal = goalLabel.createEl("textarea", { attr: { rows: "4", placeholder: "例如：失败轨迹如何用于 Agent 安全对齐？不同方法的证据和局限是什么？" } });
    goal.value = this.goal;
    goal.addEventListener("input", event => this.goal = event.target.value);
    const presets = form.createDiv("ros-synthesis-presets");
    ["了解领域现状", "比较方法差异", "寻找研究空白", "提炼下一步研究问题"].forEach(value => {
      const button = presets.createEl("button", { text: value, attr: { type: "button" } });
      button.addEventListener("click", () => { this.goal = value; this.render(); });
    });
    this.renderActions(root, true);
  }

  renderActions(root, finalStep) {
    const actions = root.createDiv("ros-synthesis-actions");
    const count = actions.createSpan({ text: `已选择 ${this.selected.size} 篇` });
    const controls = actions.createDiv();
    if (finalStep) {
      const back = controls.createEl("button", { text: "返回选择" });
      back.addEventListener("click", () => { this.step = 1; this.render(); });
    } else {
      const clear = controls.createEl("button", { text: "清空" });
      clear.disabled = !this.selected.size;
      clear.addEventListener("click", () => { this.selected.clear(); this.render(); });
    }
    const next = controls.createEl("button", { cls: "mod-cta" });
    const icon = next.createSpan(); setIcon(icon, finalStep ? "sparkles" : "arrow-right");
    next.createSpan({ text: finalStep ? "生成综合进展" : "下一步" });
    next.disabled = this.selected.size < 2;
    next.addEventListener("click", () => finalStep ? this.generate(next) : (this.step = 2, this.render()));
    if (this.selected.size > 12) count.setText(`已选择 ${this.selected.size} 篇 · 建议缩减到 12 篇以内`);
  }

  async generate(button) {
    const papers = [...this.selected].map(path => this.plugin.store.get(path)).filter(Boolean);
    button.disabled = true;
    button.setText("正在提炼并综合…");
    try {
      const result = await this.plugin.ai.synthesizeResearchProgress(papers, this.goal);
      const topic = this.topic.trim() || result.classification?.primaryTopic || result.topic || "研究综合";
      const file = await this.plugin.store.createResearchSynthesis({
        title: result.title || topic,
        topic,
        goal: this.goal,
        papers,
        sections: result.sections,
        evidence: result.evidence
      });
      this.close();
      this.onCreated?.(file);
      new Notice("多论文综合进展已生成");
    } catch (error) {
      button.disabled = false;
      button.setText("重新生成");
      new Notice(`生成失败：${error.message}`, 9000);
    }
  }

  groupByTopic(papers) {
    const map = new Map();
    papers.forEach(paper => {
      const rawTopic = paper.primaryTopic || paper.category || "待识别";
      const normalized = this.plugin.ai.normalizeLibraryTopic(rawTopic);
      const topic = normalized === "待识别" ? this.plugin.ai.fallbackLibraryTopic(paper) : normalized;
      if (!map.has(topic)) map.set(topic, []);
      map.get(topic).push(paper);
    });
    return [...map.entries()].map(([topic, grouped]) => ({ topic, papers: grouped.sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || a.title.localeCompare(b.title)) }))
      .sort((a, b) => b.papers.length - a.papers.length || a.topic.localeCompare(b.topic));
  }

  suggestedTopic(papers, valueOnly = false) {
    const counts = new Map();
    papers.forEach(paper => {
      const topic = paper.primaryTopic || paper.category;
      if (topic && topic !== "未分类") counts.set(topic, (counts.get(topic) || 0) + 1);
    });
    const topic = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "待识别共同主题";
    return valueOnly && topic === "待识别共同主题" ? "" : topic;
  }

  onClose() { this.contentEl.empty(); }
}

module.exports = { SynthesisModal };
