const { TFile, loadPdfJs } = require("obsidian");

class ResearchStore {
  constructor(app) {
    this.app = app;
    this.items = [];
  }

  async load() {
    this.items = this.app.vault.getMarkdownFiles().map(file => {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter || {};
      return {
        file,
        path: file.path,
        name: file.basename,
        type: fm.type || this.inferType(file.path),
        status: fm.status || "",
        title: fm.title || file.basename,
        authors: this.list(fm.authors),
        project: this.list(fm.project),
        researchQuestions: this.list(fm.research_questions || fm.related_questions),
        concepts: this.list(fm.concepts || fm.topics),
        primaryTopic: fm.primary_topic || "",
        subtopics: this.list(fm.subtopics),
        methods: this.list(fm.methods),
        tasks: this.list(fm.tasks),
        datasets: this.list(fm.datasets_benchmarks || fm.datasets),
        source: fm.source || "",
        page: fm.page || "",
        year: fm.year || "",
        journal: fm.journal || "",
        category: fm.category || fm.topic || "未分类",
        pdf: fm.pdf || fm.attachment || "",
        slides: fm.slides || fm.ppt || fm.presentation || "",
        readingNote: fm.reading_note || fm.notes || "",
        readingNotes: [...new Set([fm.reading_note || fm.notes || "", ...this.list(fm.reading_notes)].filter(Boolean))],
        claim: fm.claim || "",
        direction: fm.direction || "",
        progressType: fm.progress_type || "",
        progressKind: fm.progress_kind || "note",
        researchGoal: fm.research_goal || "",
        synthesisTopic: fm.synthesis_topic || fm.primary_topic || "",
        synthesisVersion: Number(fm.synthesis_version || 1),
        synthesisSections: this.parseJson(fm.synthesis_sections_json, {}),
        synthesisEvidence: this.parseJson(fm.synthesis_evidence_json, []),
        maturity: fm.maturity || "seed",
        papers: this.list(fm.papers),
        evidenceRoles: fm.evidence_roles && typeof fm.evidence_roles === "object" ? fm.evidence_roles : {},
        nextAction: fm.next_action || "",
        summary: fm.summary || fm.insight || "",
        sourcePaper: fm.source_paper || "",
        extractionLevel: fm.extraction_level || "",
        insightStatus: fm.insight_status || "",
        promptVersion: fm.prompt_version || "",
        contentHash: fm.content_hash || "",
        generatedAt: fm.generated_at || "",
        insightAnswers: this.parseJson(fm.answers_json, {}),
        insightCandidates: this.parseJson(fm.candidates_json, []),
        priority: Number(fm.priority || 0),
        relevance: Number(fm.relevance || 0),
        quality: Number(fm.quality || 0),
        progress: Number(fm.reading_progress ?? fm.progress ?? 0),
        evidenceCount: Number(fm.evidence_count || 0),
        evidenceGap: fm.evidence_gap === true,
        verified: fm.verified === true,
        importance: Number(fm.importance || 0),
        confidence: Number(fm.confidence || 0),
        updated: fm.updated || fm.last_reviewed || this.iso(file.stat.mtime),
        created: fm.created || fm.date_added || this.iso(file.stat.ctime),
        mtime: file.stat.mtime,
        raw: fm
      };
    }).filter(item => item.type && !item.path.startsWith("90 Templates/"));
    return this.items;
  }

  inferType(path) {
    if (path.startsWith("02 Projects/")) return "project";
    if (path.startsWith("03 Literature/")) return "literature";
    if (path.startsWith("04 Notes/Evidence/")) return "evidence";
    if (path.startsWith("04 Notes/Concepts/")) return "concept";
    if (path.startsWith("05 Research/Progress/")) return "research-progress";
    if (path.startsWith("05 Research/Paper Insights/")) return "paper-insight";
    if (path.startsWith("05 Research/Questions/")) return "research-question";
    if (path.startsWith("06 Writing/")) return "writing-section";
    return "";
  }

  list(value) {
    if (!value) return [];
    return Array.isArray(value) ? value.map(String) : [String(value)];
  }

  parseJson(value, fallback) {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    try { return JSON.parse(String(value)); } catch { return fallback; }
  }

  cleanLink(value) {
    return String(value || "").replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
  }

  resolveLink(value, sourcePath = "") {
    const clean = this.cleanLink(value);
    if (!clean) return null;
    const file = this.app.vault.getAbstractFileByPath(clean) || this.app.metadataCache.getFirstLinkpathDest(clean, sourcePath);
    return file instanceof TFile ? file : null;
  }

  iso(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  byType(type) {
    return this.items.filter(item => item.type === type);
  }

  get(path) {
    return this.items.find(item => item.path === path);
  }

  getPaperInsight(paperPath) {
    return this.byType("paper-insight").find(item => this.cleanLink(item.sourcePaper) === paperPath) || null;
  }

  search(query, items = this.items) {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(item => [item.name, item.title, item.claim, item.summary, item.nextAction, item.primaryTopic, item.category, ...item.authors, ...item.project, ...item.subtopics, ...item.methods, ...item.tasks, ...item.datasets]
      .join(" ").toLowerCase().includes(q));
  }

  async updateStatus(item, status) {
    await this.app.fileManager.processFrontMatter(item.file, fm => {
      fm.status = status;
      fm.updated = this.iso(Date.now());
      if (status === "read" || status === "annotated") fm.reading_progress = 100;
    });
    await this.load();
  }

  async updateProgress(item, progress) {
    await this.app.fileManager.processFrontMatter(item.file, fm => {
      fm.reading_progress = Math.max(0, Math.min(100, Number(progress)));
      fm.updated = this.iso(Date.now());
      if (Number(progress) > 0 && ["to-read", "inbox", "to-screen"].includes(fm.status)) fm.status = "reading";
    });
    await this.load();
  }

  async updateProgressMaturity(item, maturity) {
    await this.app.fileManager.processFrontMatter(item.file, fm => {
      fm.maturity = maturity;
      fm.updated = this.iso(Date.now());
    });
    await this.load();
  }

  async updateLiteratureMetadata(item, metadata) {
    const title = String(metadata.title || "").trim();
    if (!title) throw new Error("标题不能为空");
    await this.app.fileManager.processFrontMatter(item.file, fm => {
      fm.title = title;
      fm.authors = Array.isArray(metadata.authors) ? metadata.authors.filter(Boolean) : this.list(metadata.authors);
      fm.year = String(metadata.year || "").trim();
      fm.journal = String(metadata.journal || "").trim();
      fm.abstract = String(metadata.abstract || "").trim();
      fm.primary_topic = String(metadata.primaryTopic || fm.primary_topic || "未分类");
      fm.subtopics = Array.isArray(metadata.subtopics) ? metadata.subtopics.filter(Boolean) : this.list(metadata.subtopics);
      fm.methods = Array.isArray(metadata.methods) ? metadata.methods.filter(Boolean) : this.list(metadata.methods);
      fm.updated = this.iso(Date.now());
    });
    await this.load();
    return this.get(item.path);
  }

  async applyLibraryTaxonomy(assignments) {
    for (const assignment of assignments || []) {
      const item = this.get(assignment.path);
      if (!item?.file) continue;
      await this.app.fileManager.processFrontMatter(item.file, fm => {
        fm.primary_topic = String(assignment.primaryTopic || "未分类");
        fm.subtopics = Array.isArray(assignment.subtopics) ? assignment.subtopics.filter(Boolean).slice(0, 4) : [];
        fm.methods = Array.isArray(assignment.methods) ? assignment.methods.filter(Boolean).slice(0, 4) : fm.methods || [];
        fm.classification_confidence = Math.max(0, Math.min(100, Number(assignment.confidence || 0)));
        fm.updated = this.iso(Date.now());
      });
    }
    await this.load();
  }

  async deleteLiterature(item, deleteAttachments = false) {
    const targets = [item.file];
    if (deleteAttachments) {
      [item.pdf, item.slides].forEach(value => {
        const file = this.resolveLink(value, item.path);
        if (file && !targets.includes(file)) targets.push(file);
      });
      const insight = this.getPaperInsight(item.path);
      if (insight?.file) targets.push(insight.file);
      item.readingNotes.forEach(value => {
        const reading = this.resolveLink(value, item.path);
        if (reading && reading.path !== item.path && !targets.includes(reading)) targets.push(reading);
      });
    }
    for (const file of targets) await this.app.vault.trash(file, true);
    await this.load();
  }

  async extractPdfEvidence(item, maxPages = 80) {
    const pdfFile = this.resolveLink(item.pdf, item.path);
    if (!pdfFile) return { text: "", pages: 0, annotations: [], file: null };
    const pdfjs = await loadPdfJs();
    const bytes = await this.app.vault.readBinary(pdfFile);
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
    const document = await task.promise;
    const pageCount = Math.min(document.numPages, maxPages);
    const chunks = [];
    const annotations = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(token => token.str || "").join(" ").replace(/\s+/g, " ").trim();
      if (text) chunks.push(`\n[PDF 第 ${pageNumber} 页]\n${text}`);
      try {
        const pageAnnotations = await page.getAnnotations({ intent: "display" });
        pageAnnotations.forEach(annotation => {
          const value = String(annotation.contentsObj?.str || annotation.contents || "").trim();
          if (value) annotations.push({ page: pageNumber, text: value, type: annotation.subtype || "annotation" });
        });
      } catch {}
      page.cleanup?.();
    }
    await document.destroy?.();
    return { text: chunks.join("\n"), pages: document.numPages, annotations, file: pdfFile };
  }

  async createResearchProgress(metadata) {
    const title = String(metadata.title || "").trim();
    if (!title) throw new Error("请输入进展标题");
    const folder = "05 Research/Progress";
    if (!this.app.vault.getAbstractFileByPath("05 Research")) await this.app.vault.createFolder("05 Research");
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const safe = title.replace(/[\\/:*?\"<>|]/g, "-").trim();
    const path = await this.uniquePath(`${folder}/${safe}.md`);
    const date = this.iso(Date.now());
    const yamlString = value => JSON.stringify(String(value || ""));
    const selected = Array.isArray(metadata.papers) ? metadata.papers : [];
    const paperYaml = selected.length ? `papers:\n${selected.map(paper => `  - ${yamlString(`[[${paper.path}]]`)}`).join("\n")}` : "papers: []";
    const roleLines = selected.map(paper => `  ${yamlString(paper.path)}: ${yamlString(paper.role || "inspiration")}`).join("\n");
    const rolesYaml = roleLines ? `evidence_roles:\n${roleLines}` : "evidence_roles: {}";
    const summary = String(metadata.summary || "").trim();
    const content = `---
type: research-progress
progress_type: ${yamlString(metadata.progressType || "finding")}
maturity: ${yamlString(metadata.maturity || "seed")}
summary: ${yamlString(summary)}
${paperYaml}
${rolesYaml}
next_action: ${yamlString(metadata.nextAction || "")}
created: ${date}
updated: ${date}
tags:
  - research-progress
---

# ${title}

## 我的发现

${summary}

## 为什么重要


## 当前依据

${selected.map(paper => `- ${paper.role || "inspiration"}：[[${paper.path}]]`).join("\n")}

## 反例与疑问


## 下一步

${metadata.nextAction ? `- [ ] ${metadata.nextAction}` : "- [ ] "}
`;
    const file = await this.app.vault.create(path, content);
    await this.load();
    return file;
  }

  async createResearchSynthesis(metadata) {
    const title = String(metadata.title || metadata.topic || "").trim();
    if (!title) throw new Error("请输入研究主题");
    const selected = Array.isArray(metadata.papers) ? metadata.papers : [];
    if (selected.length < 2) throw new Error("至少选择两篇论文才能生成综合进展");
    const folder = "05 Research/Progress";
    if (!this.app.vault.getAbstractFileByPath("05 Research")) await this.app.vault.createFolder("05 Research");
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const safe = `${title} 综合进展`.replace(/[\\/:*?\"<>|]/g, "-").trim();
    const path = await this.uniquePath(`${folder}/${safe}.md`);
    const date = this.iso(Date.now());
    const yaml = value => JSON.stringify(value);
    const sections = metadata.sections || {};
    const evidence = Array.isArray(metadata.evidence) ? metadata.evidence : [];
    const labels = [
      ["conclusion", "当前结论"], ["consensus", "共识与证据"], ["conflicts", "差异与冲突"],
      ["methods", "方法与实验比较"], ["gaps", "研究空白与局限"], ["nextSteps", "可继续推进的方向"]
    ];
    const body = labels.map(([key, label]) => `## ${label}\n\n${String(sections[key] || "当前材料不足，尚未形成可靠判断。").trim()}`).join("\n\n");
    const content = `---
type: research-progress
progress_kind: synthesis
progress_type: synthesis
maturity: draft
title: ${yaml(title)}
research_goal: ${yaml(metadata.goal || "")}
synthesis_topic: ${yaml(metadata.topic || title)}
synthesis_version: 1
synthesis_sections_json: ${yaml(JSON.stringify(sections))}
synthesis_evidence_json: ${yaml(JSON.stringify(evidence))}
summary: ${yaml(String(sections.conclusion || ""))}
papers:
${selected.map(paper => `  - ${yaml(`[[${paper.path}]]`)}`).join("\n")}
created: ${date}
updated: ${date}
tags:
  - research-progress
  - research-synthesis
---

# ${title}

> 研究目标：${metadata.goal || "理解这些论文共同说明了什么"}  
> 关联论文：${selected.length} 篇  
> 此内容由 AI 综合生成，重要结论应回到原文核验。

${body}

## 关联论文

${selected.map((paper, index) => `${index + 1}. [[${paper.path}]]`).join("\n")}
`;
    const file = await this.app.vault.create(path, content);
    await this.load();
    return file;
  }

  async savePaperInsight(paper, payload) {
    const folder = "05 Research/Paper Insights";
    if (!this.app.vault.getAbstractFileByPath("05 Research")) await this.app.vault.createFolder("05 Research");
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const existing = this.getPaperInsight(paper.path);
    const safe = `${paper.file.basename} AI 提炼`.replace(/[\\/:*?"<>|]/g, "-").trim();
    const path = existing?.path || await this.uniquePath(`${folder}/${safe}.md`);
    const answers = Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
      const key = `q${index + 1}`;
      return [key, String(payload.answers?.[key] || "证据不足，暂时无法判断。").trim()];
    }));
    const previousStates = new Map((existing?.insightCandidates || []).map(candidate => [String(candidate.title).trim().toLowerCase(), candidate.status]));
    const candidates = (payload.candidates || []).slice(0, 4).map((candidate, index) => ({
      id: String(candidate.id || `candidate-${index + 1}`),
      type: String(candidate.type || "finding"),
      title: String(candidate.title || "").trim(),
      summary: String(candidate.summary || "").trim(),
      nextAction: String(candidate.nextAction || "").trim(),
      status: String(previousStates.get(String(candidate.title || "").trim().toLowerCase()) || candidate.status || "pending")
    })).filter(candidate => candidate.title && candidate.summary);
    const taxonomy = payload.taxonomy || {};
    const yaml = value => JSON.stringify(value);
    const generatedAt = new Date().toISOString();
    const labels = [
      "论文试图解决什么问题？",
      "这是否是一个新的问题？",
      "这篇文章要验证一个什么科学假设？",
      "有哪些相关研究？如何归类？谁是这一领域内值得关注的研究员？",
      "论文中提到的解决方案之关键是什么？",
      "论文中的实验是如何设计的？",
      "用于定量评估的数据集是什么？代码有没有开源？",
      "论文中的实验及结果有没有很好地支持需要验证的科学假设？",
      "这篇论文到底有什么贡献？",
      "下一步呢？有什么工作可以继续深入？"
    ];
    const body = labels.map((label, index) => `## Q${index + 1} ${label}\n\n${answers[`q${index + 1}`]}`).join("\n\n");
    const content = `---
type: paper-insight
source_paper: ${yaml(`[[${paper.path}]]`)}
insight_status: ${yaml("generated")}
extraction_level: ${yaml(payload.extractionLevel || "abstract")}
prompt_version: ${yaml(payload.promptVersion || "paper-insight-v1")}
content_hash: ${yaml(payload.contentHash || "")}
generated_at: ${yaml(generatedAt)}
answers_json: ${yaml(JSON.stringify(answers))}
candidates_json: ${yaml(JSON.stringify(candidates))}
primary_topic: ${yaml(String(taxonomy.primaryTopic || "未分类"))}
subtopics: ${yaml(Array.isArray(taxonomy.subtopics) ? taxonomy.subtopics : [])}
methods: ${yaml(Array.isArray(taxonomy.methods) ? taxonomy.methods : [])}
tasks: ${yaml(Array.isArray(taxonomy.tasks) ? taxonomy.tasks : [])}
datasets_benchmarks: ${yaml(Array.isArray(taxonomy.datasets) ? taxonomy.datasets : [])}
classification_confidence: ${Number(taxonomy.confidence || 0)}
updated: ${this.iso(Date.now())}
tags:
  - paper-insight
---

# ${paper.title}：AI 研究提炼

> 生成依据：${payload.extractionLabel || "标题与摘要"}  
> 模型：${payload.model || "未记录"}  
> 此内容由 AI 自动生成，应结合原文核验。

${body}

## 候选研究进展

${candidates.length ? candidates.map(candidate => `### ${candidate.title}\n\n${candidate.summary}\n\n**下一步：** ${candidate.nextAction || "待确定"}`).join("\n\n") : "暂未提取到足够明确的候选进展。"}
`;
    if (existing) await this.app.vault.modify(existing.file, content);
    else await this.app.vault.create(path, content);
    await this.app.fileManager.processFrontMatter(paper.file, fm => {
      fm.ai_insight = `[[${path}]]`;
      fm.ai_provisional_topic = String(taxonomy.primaryTopic || "");
      fm.subtopics = Array.isArray(taxonomy.subtopics) ? taxonomy.subtopics : [];
      fm.methods = Array.isArray(taxonomy.methods) ? taxonomy.methods : [];
      fm.tasks = Array.isArray(taxonomy.tasks) ? taxonomy.tasks : [];
      fm.datasets_benchmarks = Array.isArray(taxonomy.datasets) ? taxonomy.datasets : [];
      fm.updated = this.iso(Date.now());
    });
    await this.load();
    return this.getPaperInsight(paper.path);
  }

  async updateInsightCandidate(insight, candidateId, status) {
    const candidates = insight.insightCandidates.map(candidate => candidate.id === candidateId ? { ...candidate, status } : candidate);
    await this.app.fileManager.processFrontMatter(insight.file, fm => {
      fm.candidates_json = JSON.stringify(candidates);
      fm.updated = this.iso(Date.now());
    });
    await this.load();
    return this.get(insight.path);
  }

  async create(type, title, project = "", metadata = {}) {
    const config = {
      literature: { folder: "03 Literature/Papers", status: "inbox", prefix: "" },
      evidence: { folder: "04 Notes/Evidence", status: "draft", prefix: "EV " },
      "research-question": { folder: "05 Research/Questions", status: "exploring", prefix: "RQ " },
      "writing-section": { folder: "06 Writing", status: "outline", prefix: "CH " },
      concept: { folder: "04 Notes/Concepts", status: "developing", prefix: "" },
      project: { folder: "02 Projects", status: "planning", prefix: "" }
    }[type];
    if (!config) throw new Error("不支持的对象类型");
    const safe = title.replace(/[\\/:*?\"<>|]/g, "-").trim();
    const path = await this.uniquePath(`${config.folder}/${config.prefix}${safe}.md`);
    const projectYaml = project ? `\nproject:\n  - "[[${project.replace(/^\[\[|\]\]$/g, "")}]]"` : "\nproject: []";
    const date = this.iso(Date.now());
    const yamlString = value => JSON.stringify(String(value || ""));
    const linkValue = value => {
      const clean = String(value || "").trim();
      if (!clean) return "";
      return clean.startsWith("[[") ? clean : `[[${clean.replace(/\\/g, "/")}]]`;
    };
    const literatureFields = type === "literature" ? `
category: ${yamlString(metadata.category || "未分类")}
authors: ${metadata.authors ? `[${yamlString(metadata.authors)}]` : "[]"}
year: ${metadata.year ? Number(metadata.year) || yamlString(metadata.year) : ""}
pdf: ${yamlString(linkValue(metadata.pdf))}
slides: ${yamlString(linkValue(metadata.slides))}
doi: ${yamlString(metadata.doi)}
reading_progress: 0` : "";
    const content = `---\ntype: ${type}\ntitle: ${yamlString(title)}\nstatus: ${config.status}${projectYaml}${literatureFields}\ncreated: ${date}\nupdated: ${date}\ntags: []\n---\n\n# ${title}\n\n## 摘要\n\n\n## 高亮与摘录\n\n\n## 我的笔记\n\n\n## 待办\n\n- [ ] \n`;
    const file = await this.app.vault.create(path, content);
    await this.load();
    return file;
  }

  async importPdf(source) {
    const bytes = await source.arrayBuffer();
    const metadata = this.extractPdfMetadata(bytes, source.name);
    const folder = "09 Attachments";
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const attachmentPath = await this.uniqueAttachmentPath(`${folder}/${source.name}`);
    await this.app.vault.createBinary(attachmentPath, bytes);
    const note = await this.create("literature", metadata.title, "", {
      authors: metadata.authors,
      year: metadata.year,
      category: "未分类",
      pdf: attachmentPath,
      doi: metadata.doi
    });
    return { note, attachmentPath, metadata };
  }

  extractPdfMetadata(buffer, filename) {
    const sample = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 5 * 1024 * 1024));
    const raw = new TextDecoder("latin1").decode(sample);
    const literal = key => {
      const match = raw.match(new RegExp(`/${key}\\s*\\(([^)]{2,500})\\)`, "i"));
      return match ? match[1].replace(/\\([()\\])/g, "$1").replace(/\\[nrt]/g, " ").trim() : "";
    };
    const fallback = filename.replace(/\.pdf$/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    const embeddedTitle = literal("Title");
    const doiMatch = raw.match(/10\.\d{4,9}\/[A-Z0-9._;()/:+-]+/i);
    const yearMatch = (literal("CreationDate") || raw.slice(0, 200000)).match(/(?:19|20)\d{2}/);
    return {
      title: embeddedTitle && !/^untitled$/i.test(embeddedTitle) ? embeddedTitle : fallback,
      authors: literal("Author"),
      year: yearMatch ? yearMatch[0] : "",
      doi: doiMatch ? doiMatch[0].replace(/[)>.,;]+$/, "") : ""
    };
  }

  async uniqueAttachmentPath(path) {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const dot = path.lastIndexOf(".");
    const base = dot > -1 ? path.slice(0, dot) : path;
    const ext = dot > -1 ? path.slice(dot) : "";
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(`${base} ${i}${ext}`)) i++;
    return `${base} ${i}${ext}`;
  }

  async attachResource(item, source, existingPath = "") {
    const name = source?.name || existingPath.split("/").pop() || "resource";
    const ext = name.split(".").pop().toLowerCase();
    const isMarkdown = ext === "md";
    const isSlides = ["ppt", "pptx"].includes(ext);
    if (!isMarkdown && !isSlides) throw new Error("当前论文只接受 Markdown、PPT 或 PPTX 文件");
    let targetPath = existingPath;
    if (!targetPath) {
      const folder = isMarkdown ? await this.ensureReadingFolder(item) : "09 Attachments";
      if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
      targetPath = await this.uniqueAttachmentPath(`${folder}/${name}`);
      if (isMarkdown) {
        const text = typeof source.text === "function" ? await source.text() : new TextDecoder().decode(await source.arrayBuffer());
        await this.app.vault.create(targetPath, text);
      } else await this.app.vault.createBinary(targetPath, await source.arrayBuffer());
    }
    await this.app.fileManager.processFrontMatter(item.file, fm => {
      if (isMarkdown) {
        const link = `[[${targetPath}]]`;
        const notes = [...new Set([fm.reading_note || "", ...this.list(fm.reading_notes), link].filter(Boolean))];
        fm.reading_notes = notes;
        if (!fm.reading_note) fm.reading_note = link;
      }
      if (isSlides) fm.slides = `[[${targetPath}]]`;
      fm.updated = this.iso(Date.now());
    });
    await this.load();
    return { type: isMarkdown ? "markdown" : "slides", path: targetPath };
  }

  async ensureReadingFolder(item) {
    const root = "04 Notes/Reading Notes";
    if (!this.app.vault.getAbstractFileByPath("04 Notes")) await this.app.vault.createFolder("04 Notes");
    if (!this.app.vault.getAbstractFileByPath(root)) await this.app.vault.createFolder(root);
    const safe = item.file.basename.replace(/[\\/:*?"<>|]/g, "-").trim();
    const folder = `${root}/${safe}`;
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    return folder;
  }

  async createLearningNote(item, kind = "learning") {
    const folder = await this.ensureReadingFolder(item);
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const base = kind === "main" ? "主阅读笔记" : `学习过程 ${stamp}`;
    const path = await this.uniquePath(`${folder}/${base}.md`);
    const title = kind === "main" ? `${item.title}：主阅读笔记` : `${item.title}：学习过程`;
    const content = `---\ntype: literature-learning-note\nsource_paper: "[[${item.path}]]"\nnote_kind: ${kind}\ncreated: ${this.iso(Date.now())}\n---\n\n# ${title}\n\n${kind === "main" ? "## 核心摘要\n\n\n## 高亮与摘录\n\n\n## 我的理解\n\n\n## 问题与待验证\n" : "## 当前在理解什么\n\n\n## 与 AI / 他人的讨论\n\n\n## 我得到的理解\n\n\n## 仍然没弄懂的地方\n\n\n## 下一步\n"}`;
    const file = await this.app.vault.create(path, content);
    await this.app.fileManager.processFrontMatter(item.file, fm => {
      const link = `[[${path}]]`;
      fm.reading_notes = [...new Set([fm.reading_note || "", ...this.list(fm.reading_notes), link].filter(Boolean))];
      if (kind === "main") fm.reading_note = link;
      fm.updated = this.iso(Date.now());
    });
    await this.load();
    return file;
  }

  async uniquePath(path) {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const base = path.replace(/\.md$/, "");
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(`${base} ${i}.md`)) i++;
    return `${base} ${i}.md`;
  }
}

module.exports = { ResearchStore };
