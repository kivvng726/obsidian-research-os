const { setIcon } = require("obsidian");

const SVG_NS = "http://www.w3.org/2000/svg";

class PaperGraph {
  constructor(view, page) {
    this.view = view;
    this.app = view.app;
    this.page = page;
    this.frame = 0;
    this.destroyed = false;
    this.scale = 1;
    this.pan = { x: 0, y: 0 };
    this.drag = null;
  }

  render() {
    const papers = this.view.literature();
    const shell = this.page.createEl("section", { cls: "ros-graph-shell" });
    const stage = shell.createDiv({ cls: "ros-graph-stage", attr: { tabindex: "0", role: "application", "aria-label": "论文关系图谱" } });
    const controls = stage.createDiv("ros-graph-controls");
    this.control(controls, "minus", "缩小", () => this.zoomBy(.84));
    this.control(controls, "maximize-2", "适应画布", () => this.resetView());
    this.control(controls, "plus", "放大", () => this.zoomBy(1.18));
    const stats = stage.createDiv("ros-graph-stats");
    stats.createSpan({ text: `${papers.length} 篇论文` });
    stats.createSpan({ text: "拖动节点 · 滚轮缩放 · 点击进入阅读" });
    const legend = stage.createDiv("ros-graph-legend");
    [["paper", "论文"], ["category", "主要主题"], ["method", "方法"]].forEach(([kind, label]) => {
      const item = legend.createSpan(`is-${kind}`); item.createSpan(); item.appendText(label);
    });
    if (!papers.length) {
      const empty = stage.createDiv("ros-graph-empty");
      const icon = empty.createDiv(); setIcon(icon, "git-fork");
      empty.createEl("h3", { text: "图谱中还没有论文" });
      empty.createEl("p", { text: "向文献库添加论文后，关系网络会自动生成。" });
      return;
    }

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "ros-graph-svg");
    svg.setAttribute("aria-hidden", "true");
    stage.appendChild(svg);
    this.svg = svg;
    this.viewport = document.createElementNS(SVG_NS, "g");
    this.viewport.setAttribute("class", "ros-graph-viewport");
    svg.appendChild(this.viewport);
    this.edgeLayer = document.createElementNS(SVG_NS, "g");
    this.edgeLayer.setAttribute("class", "ros-graph-edges");
    this.nodeLayer = document.createElementNS(SVG_NS, "g");
    this.nodeLayer.setAttribute("class", "ros-graph-nodes");
    this.viewport.append(this.edgeLayer, this.nodeLayer);
    this.tooltip = stage.createDiv("ros-graph-tooltip");
    this.tooltip.setAttribute("role", "status");

    const { nodes, edges } = this.buildGraph(papers);
    this.nodes = nodes;
    this.edges = edges;
    this.draw();
    this.bindStage(stage);
    requestAnimationFrame(() => {
      const rect = stage.getBoundingClientRect();
      this.width = Math.max(640, rect.width);
      this.height = Math.max(480, rect.height);
      this.seedPositions();
      this.resetView();
      this.simulate(150);
    });
  }

  control(parent, iconName, label, action) {
    const button = parent.createEl("button", { attr: { "aria-label": label, title: label } });
    setIcon(button, iconName);
    button.addEventListener("click", action);
  }

  buildGraph(papers) {
    const nodes = papers.map((paper, index) => ({ id: paper.path, kind: "paper", paper, label: paper.title, index, radius: 11 }));
    const edges = [];
    const categories = new Map();
    const methods = new Map();
    papers.forEach(paper => {
      const category = String(paper.primaryTopic || paper.category || "未分类").trim() || "未分类";
      if (!categories.has(category)) {
        const node = { id: `category:${category}`, kind: "category", label: category, radius: 7 };
        categories.set(category, node); nodes.push(node);
      }
      edges.push({ source: paper.path, target: `category:${category}`, kind: "category" });
      paper.methods.slice(0, 3).forEach(methodName => {
        const method = String(methodName).trim(); if (!method) return;
        if (!methods.has(method)) {
          const node = { id: `method:${method}`, kind: "method", label: method, radius: 6 };
          methods.set(method, node); nodes.push(node);
        }
        edges.push({ source: paper.path, target: `method:${method}`, kind: "method" });
      });
    });

    const paperByName = new Map(papers.flatMap(p => [[p.file.basename.toLowerCase(), p], [p.path.toLowerCase(), p]]));
    papers.forEach(paper => {
      const cache = this.app.metadataCache.getFileCache(paper.file);
      (cache?.links || []).map(entry => entry.link).filter(Boolean).forEach(link => {
        const clean = link.replace(/^.*\//, "").replace(/\.md$/i, "").toLowerCase();
        const target = paperByName.get(clean);
        if (target && target.path !== paper.path && !edges.some(edge => edge.source === paper.path && edge.target === target.path)) {
          edges.push({ source: paper.path, target: target.path, kind: "citation" });
        }
      });
    });
    return { nodes, edges };
  }

  seedPositions() {
    const centerX = this.width / 2, centerY = this.height / 2;
    this.nodes.forEach((node, index) => {
      const angle = index * 2.399963;
      const radius = 70 + Math.sqrt(index + 1) * 42;
      node.x = centerX + Math.cos(angle) * radius;
      node.y = centerY + Math.sin(angle) * radius;
      node.vx = 0; node.vy = 0;
    });
  }

  draw() {
    const byId = new Map(this.nodes.map(node => [node.id, node]));
    this.edges.forEach(edge => {
      edge.sourceNode = byId.get(edge.source); edge.targetNode = byId.get(edge.target);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("class", `ros-graph-edge is-${edge.kind}`);
      this.edgeLayer.appendChild(line); edge.element = line;
    });
    this.nodes.forEach(node => {
      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("class", `ros-graph-node is-${node.kind}`);
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", node.kind === "paper" ? `打开论文：${node.label}` : `分类：${node.label}`);
      const halo = document.createElementNS(SVG_NS, "circle"); halo.setAttribute("class", "ros-node-halo"); halo.setAttribute("r", String(node.radius + 11));
      const circle = node.kind === "method" ? document.createElementNS(SVG_NS, "rect") : document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("class", "ros-node-core");
      if (node.kind === "method") {
        circle.setAttribute("x", String(-node.radius)); circle.setAttribute("y", String(-node.radius));
        circle.setAttribute("width", String(node.radius * 2)); circle.setAttribute("height", String(node.radius * 2));
        circle.setAttribute("transform", "rotate(45)");
      } else circle.setAttribute("r", String(node.radius));
      const label = document.createElementNS(SVG_NS, "text"); label.setAttribute("class", "ros-node-label"); label.setAttribute("x", String(node.radius + 10)); label.setAttribute("y", "4"); label.textContent = this.truncate(node.label, node.kind === "paper" ? 42 : 22);
      group.append(halo, circle, label); this.nodeLayer.appendChild(group); node.element = group;
      group.addEventListener("pointerdown", event => this.startDrag(event, node));
      group.addEventListener("pointerenter", event => this.showTooltip(event, node));
      group.addEventListener("pointermove", event => this.moveTooltip(event));
      group.addEventListener("pointerleave", () => this.hideTooltip());
      group.addEventListener("click", event => {
        if (node.kind !== "paper" || node.wasDragged) return;
        event.stopPropagation(); this.view.selectedPath = node.paper.path; this.view.section = "reader"; this.view.render();
      });
      group.addEventListener("keydown", event => { if (node.kind === "paper" && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); this.view.selectedPath = node.paper.path; this.view.section = "reader"; this.view.render(); } });
    });
  }

  simulate(iterations) {
    let remaining = iterations;
    const tick = () => {
      if (this.destroyed || remaining-- <= 0) return;
      const centerX = this.width / 2, centerY = this.height / 2;
      this.nodes.forEach(node => {
        if (node.fixed) return;
        node.vx += (centerX - node.x) * .0007;
        node.vy += (centerY - node.y) * .0007;
      });
      for (let i = 0; i < this.nodes.length; i++) for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y; const distance2 = Math.max(120, dx * dx + dy * dy);
        const force = 190 / distance2; const distance = Math.sqrt(distance2); dx /= distance; dy /= distance;
        if (!a.fixed) { a.vx -= dx * force; a.vy -= dy * force; }
        if (!b.fixed) { b.vx += dx * force; b.vy += dy * force; }
      }
      this.edges.forEach(edge => {
        const a = edge.sourceNode, b = edge.targetNode; if (!a || !b) return;
        let dx = b.x - a.x, dy = b.y - a.y; const distance = Math.max(1, Math.hypot(dx, dy));
        const ideal = edge.kind === "category" ? 108 : edge.kind === "method" ? 92 : 145; const force = (distance - ideal) * .0018; dx /= distance; dy /= distance;
        if (!a.fixed) { a.vx += dx * force; a.vy += dy * force; }
        if (!b.fixed) { b.vx -= dx * force; b.vy -= dy * force; }
      });
      this.nodes.forEach(node => { if (!node.fixed) { node.vx *= .88; node.vy *= .88; node.x += node.vx; node.y += node.vy; } });
      this.update();
      this.frame = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(tick);
  }

  update() {
    this.edges.forEach(edge => {
      if (!edge.sourceNode || !edge.targetNode) return;
      edge.element.setAttribute("x1", edge.sourceNode.x); edge.element.setAttribute("y1", edge.sourceNode.y);
      edge.element.setAttribute("x2", edge.targetNode.x); edge.element.setAttribute("y2", edge.targetNode.y);
    });
    const query = this.view.query.trim().toLowerCase();
    this.nodes.forEach(node => {
      node.element.setAttribute("transform", `translate(${node.x} ${node.y})`);
      node.element.classList.toggle("is-dimmed", Boolean(query) && !node.label.toLowerCase().includes(query));
    });
    this.viewport.setAttribute("transform", `translate(${this.pan.x} ${this.pan.y}) scale(${this.scale})`);
  }

  bindStage(stage) {
    stage.addEventListener("wheel", event => { event.preventDefault(); this.zoomBy(event.deltaY < 0 ? 1.08 : .92); }, { passive: false });
    stage.addEventListener("pointerdown", event => { if (event.target === this.svg) this.drag = { type: "pan", x: event.clientX, y: event.clientY, startX: this.pan.x, startY: this.pan.y }; });
    window.addEventListener("pointermove", this.onPointerMove = event => {
      if (!this.drag) return;
      if (this.drag.type === "pan") { this.pan.x = this.drag.startX + event.clientX - this.drag.x; this.pan.y = this.drag.startY + event.clientY - this.drag.y; }
      else { const rect = this.svg.getBoundingClientRect(); this.drag.node.x = (event.clientX - rect.left - this.pan.x) / this.scale; this.drag.node.y = (event.clientY - rect.top - this.pan.y) / this.scale; this.drag.node.wasDragged = Math.hypot(event.clientX - this.drag.x, event.clientY - this.drag.y) > 4; }
      this.update();
    });
    window.addEventListener("pointerup", this.onPointerUp = () => { if (this.drag?.node) this.drag.node.fixed = false; this.drag = null; this.simulate(35); });
  }

  startDrag(event, node) { event.stopPropagation(); node.fixed = true; node.wasDragged = false; this.drag = { type: "node", node, x: event.clientX, y: event.clientY }; }
  zoomBy(amount) { this.scale = Math.max(.45, Math.min(2.2, this.scale * amount)); this.update(); }
  resetView() { this.scale = 1; this.pan = { x: 0, y: 0 }; this.update(); }
  showTooltip(event, node) {
    const paper = node.paper;
    this.tooltip.empty();
    this.tooltip.createEl("strong", { text: node.label });
    this.tooltip.createEl("span", { text: paper ? [paper.authors.slice(0, 3).join(", "), paper.year, paper.primaryTopic || paper.category].filter(Boolean).join(" · ") : node.kind === "method" ? "方法节点" : "主要主题节点" });
    this.tooltip.addClass("is-visible"); this.moveTooltip(event);
  }
  moveTooltip(event) { if (!this.tooltip) return; const rect = this.tooltip.parentElement.getBoundingClientRect(); this.tooltip.style.transform = `translate(${event.clientX - rect.left + 16}px, ${event.clientY - rect.top + 16}px)`; }
  hideTooltip() { this.tooltip?.removeClass("is-visible"); }
  truncate(value, length) { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
  destroy() { this.destroyed = true; cancelAnimationFrame(this.frame); if (this.onPointerMove) window.removeEventListener("pointermove", this.onPointerMove); if (this.onPointerUp) window.removeEventListener("pointerup", this.onPointerUp); }
}

module.exports = { PaperGraph };
