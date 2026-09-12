var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// .obsidian/plugins/research-os/research-store.js
var require_research_store = __commonJS({
  ".obsidian/plugins/research-os/research-store.js"(exports2, module2) {
    var { TFile, loadPdfJs } = require("obsidian");
    var ResearchStore2 = class {
      constructor(app) {
        this.app = app;
        this.items = [];
      }
      async load() {
        this.items = this.app.vault.getMarkdownFiles().map((file) => {
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
            category: fm.category || fm.topic || "\u672A\u5206\u7C7B",
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
        }).filter((item) => item.type && !item.path.startsWith("90 Templates/"));
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
        try {
          return JSON.parse(String(value));
        } catch {
          return fallback;
        }
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
        return this.items.filter((item) => item.type === type);
      }
      get(path) {
        return this.items.find((item) => item.path === path);
      }
      getPaperInsight(paperPath) {
        return this.byType("paper-insight").find((item) => this.cleanLink(item.sourcePaper) === paperPath) || null;
      }
      search(query, items = this.items) {
        if (!query.trim()) return items;
        const q = query.toLowerCase();
        return items.filter((item) => [item.name, item.title, item.claim, item.summary, item.nextAction, item.primaryTopic, item.category, ...item.authors, ...item.project, ...item.subtopics, ...item.methods, ...item.tasks, ...item.datasets].join(" ").toLowerCase().includes(q));
      }
      async updateStatus(item, status) {
        await this.app.fileManager.processFrontMatter(item.file, (fm) => {
          fm.status = status;
          fm.updated = this.iso(Date.now());
          if (status === "read" || status === "annotated") fm.reading_progress = 100;
        });
        await this.load();
      }
      async updateProgress(item, progress) {
        await this.app.fileManager.processFrontMatter(item.file, (fm) => {
          fm.reading_progress = Math.max(0, Math.min(100, Number(progress)));
          fm.updated = this.iso(Date.now());
          if (Number(progress) > 0 && ["to-read", "inbox", "to-screen"].includes(fm.status)) fm.status = "reading";
        });
        await this.load();
      }
      async updateProgressMaturity(item, maturity) {
        await this.app.fileManager.processFrontMatter(item.file, (fm) => {
          fm.maturity = maturity;
          fm.updated = this.iso(Date.now());
        });
        await this.load();
      }
      async updateLiteratureMetadata(item, metadata) {
        const title = String(metadata.title || "").trim();
        if (!title) throw new Error("\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A");
        await this.app.fileManager.processFrontMatter(item.file, (fm) => {
          fm.title = title;
          fm.authors = Array.isArray(metadata.authors) ? metadata.authors.filter(Boolean) : this.list(metadata.authors);
          fm.year = String(metadata.year || "").trim();
          fm.journal = String(metadata.journal || "").trim();
          fm.abstract = String(metadata.abstract || "").trim();
          fm.primary_topic = String(metadata.primaryTopic || fm.primary_topic || "\u672A\u5206\u7C7B");
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
          await this.app.fileManager.processFrontMatter(item.file, (fm) => {
            fm.primary_topic = String(assignment.primaryTopic || "\u672A\u5206\u7C7B");
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
          [item.pdf, item.slides].forEach((value) => {
            const file = this.resolveLink(value, item.path);
            if (file && !targets.includes(file)) targets.push(file);
          });
          const insight = this.getPaperInsight(item.path);
          if (insight?.file) targets.push(insight.file);
          item.readingNotes.forEach((value) => {
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
        const document2 = await task.promise;
        const pageCount = Math.min(document2.numPages, maxPages);
        const chunks = [];
        const annotations = [];
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
          const page = await document2.getPage(pageNumber);
          const content = await page.getTextContent();
          const text = content.items.map((token) => token.str || "").join(" ").replace(/\s+/g, " ").trim();
          if (text) chunks.push(`
[PDF \u7B2C ${pageNumber} \u9875]
${text}`);
          try {
            const pageAnnotations = await page.getAnnotations({ intent: "display" });
            pageAnnotations.forEach((annotation) => {
              const value = String(annotation.contentsObj?.str || annotation.contents || "").trim();
              if (value) annotations.push({ page: pageNumber, text: value, type: annotation.subtype || "annotation" });
            });
          } catch {
          }
          page.cleanup?.();
        }
        await document2.destroy?.();
        return { text: chunks.join("\n"), pages: document2.numPages, annotations, file: pdfFile };
      }
      async createResearchProgress(metadata) {
        const title = String(metadata.title || "").trim();
        if (!title) throw new Error("\u8BF7\u8F93\u5165\u8FDB\u5C55\u6807\u9898");
        const folder = "05 Research/Progress";
        if (!this.app.vault.getAbstractFileByPath("05 Research")) await this.app.vault.createFolder("05 Research");
        if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
        const safe = title.replace(/[\\/:*?\"<>|]/g, "-").trim();
        const path = await this.uniquePath(`${folder}/${safe}.md`);
        const date = this.iso(Date.now());
        const yamlString = (value) => JSON.stringify(String(value || ""));
        const selected = Array.isArray(metadata.papers) ? metadata.papers : [];
        const paperYaml = selected.length ? `papers:
${selected.map((paper) => `  - ${yamlString(`[[${paper.path}]]`)}`).join("\n")}` : "papers: []";
        const roleLines = selected.map((paper) => `  ${yamlString(paper.path)}: ${yamlString(paper.role || "inspiration")}`).join("\n");
        const rolesYaml = roleLines ? `evidence_roles:
${roleLines}` : "evidence_roles: {}";
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

## \u6211\u7684\u53D1\u73B0

${summary}

## \u4E3A\u4EC0\u4E48\u91CD\u8981


## \u5F53\u524D\u4F9D\u636E

${selected.map((paper) => `- ${paper.role || "inspiration"}\uFF1A[[${paper.path}]]`).join("\n")}

## \u53CD\u4F8B\u4E0E\u7591\u95EE


## \u4E0B\u4E00\u6B65

${metadata.nextAction ? `- [ ] ${metadata.nextAction}` : "- [ ] "}
`;
        const file = await this.app.vault.create(path, content);
        await this.load();
        return file;
      }
      async createResearchSynthesis(metadata) {
        const title = String(metadata.title || metadata.topic || "").trim();
        if (!title) throw new Error("\u8BF7\u8F93\u5165\u7814\u7A76\u4E3B\u9898");
        const selected = Array.isArray(metadata.papers) ? metadata.papers : [];
        if (selected.length < 2) throw new Error("\u81F3\u5C11\u9009\u62E9\u4E24\u7BC7\u8BBA\u6587\u624D\u80FD\u751F\u6210\u7EFC\u5408\u8FDB\u5C55");
        const folder = "05 Research/Progress";
        if (!this.app.vault.getAbstractFileByPath("05 Research")) await this.app.vault.createFolder("05 Research");
        if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
        const safe = `${title} \u7EFC\u5408\u8FDB\u5C55`.replace(/[\\/:*?\"<>|]/g, "-").trim();
        const path = await this.uniquePath(`${folder}/${safe}.md`);
        const date = this.iso(Date.now());
        const yaml = (value) => JSON.stringify(value);
        const sections = metadata.sections || {};
        const evidence = Array.isArray(metadata.evidence) ? metadata.evidence : [];
        const labels = [
          ["conclusion", "\u5F53\u524D\u7ED3\u8BBA"],
          ["consensus", "\u5171\u8BC6\u4E0E\u8BC1\u636E"],
          ["conflicts", "\u5DEE\u5F02\u4E0E\u51B2\u7A81"],
          ["methods", "\u65B9\u6CD5\u4E0E\u5B9E\u9A8C\u6BD4\u8F83"],
          ["gaps", "\u7814\u7A76\u7A7A\u767D\u4E0E\u5C40\u9650"],
          ["nextSteps", "\u53EF\u7EE7\u7EED\u63A8\u8FDB\u7684\u65B9\u5411"]
        ];
        const body = labels.map(([key, label]) => `## ${label}

${String(sections[key] || "\u5F53\u524D\u6750\u6599\u4E0D\u8DB3\uFF0C\u5C1A\u672A\u5F62\u6210\u53EF\u9760\u5224\u65AD\u3002").trim()}`).join("\n\n");
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
${selected.map((paper) => `  - ${yaml(`[[${paper.path}]]`)}`).join("\n")}
created: ${date}
updated: ${date}
tags:
  - research-progress
  - research-synthesis
---

# ${title}

> \u7814\u7A76\u76EE\u6807\uFF1A${metadata.goal || "\u7406\u89E3\u8FD9\u4E9B\u8BBA\u6587\u5171\u540C\u8BF4\u660E\u4E86\u4EC0\u4E48"}  
> \u5173\u8054\u8BBA\u6587\uFF1A${selected.length} \u7BC7  
> \u6B64\u5185\u5BB9\u7531 AI \u7EFC\u5408\u751F\u6210\uFF0C\u91CD\u8981\u7ED3\u8BBA\u5E94\u56DE\u5230\u539F\u6587\u6838\u9A8C\u3002

${body}

## \u5173\u8054\u8BBA\u6587

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
        const safe = `${paper.file.basename} AI \u63D0\u70BC`.replace(/[\\/:*?"<>|]/g, "-").trim();
        const path = existing?.path || await this.uniquePath(`${folder}/${safe}.md`);
        const answers = Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
          const key = `q${index + 1}`;
          return [key, String(payload.answers?.[key] || "\u8BC1\u636E\u4E0D\u8DB3\uFF0C\u6682\u65F6\u65E0\u6CD5\u5224\u65AD\u3002").trim()];
        }));
        const previousStates = new Map((existing?.insightCandidates || []).map((candidate) => [String(candidate.title).trim().toLowerCase(), candidate.status]));
        const candidates = (payload.candidates || []).slice(0, 4).map((candidate, index) => ({
          id: String(candidate.id || `candidate-${index + 1}`),
          type: String(candidate.type || "finding"),
          title: String(candidate.title || "").trim(),
          summary: String(candidate.summary || "").trim(),
          nextAction: String(candidate.nextAction || "").trim(),
          status: String(previousStates.get(String(candidate.title || "").trim().toLowerCase()) || candidate.status || "pending")
        })).filter((candidate) => candidate.title && candidate.summary);
        const taxonomy = payload.taxonomy || {};
        const yaml = (value) => JSON.stringify(value);
        const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
        const labels = [
          "\u8BBA\u6587\u8BD5\u56FE\u89E3\u51B3\u4EC0\u4E48\u95EE\u9898\uFF1F",
          "\u8FD9\u662F\u5426\u662F\u4E00\u4E2A\u65B0\u7684\u95EE\u9898\uFF1F",
          "\u8FD9\u7BC7\u6587\u7AE0\u8981\u9A8C\u8BC1\u4E00\u4E2A\u4EC0\u4E48\u79D1\u5B66\u5047\u8BBE\uFF1F",
          "\u6709\u54EA\u4E9B\u76F8\u5173\u7814\u7A76\uFF1F\u5982\u4F55\u5F52\u7C7B\uFF1F\u8C01\u662F\u8FD9\u4E00\u9886\u57DF\u5185\u503C\u5F97\u5173\u6CE8\u7684\u7814\u7A76\u5458\uFF1F",
          "\u8BBA\u6587\u4E2D\u63D0\u5230\u7684\u89E3\u51B3\u65B9\u6848\u4E4B\u5173\u952E\u662F\u4EC0\u4E48\uFF1F",
          "\u8BBA\u6587\u4E2D\u7684\u5B9E\u9A8C\u662F\u5982\u4F55\u8BBE\u8BA1\u7684\uFF1F",
          "\u7528\u4E8E\u5B9A\u91CF\u8BC4\u4F30\u7684\u6570\u636E\u96C6\u662F\u4EC0\u4E48\uFF1F\u4EE3\u7801\u6709\u6CA1\u6709\u5F00\u6E90\uFF1F",
          "\u8BBA\u6587\u4E2D\u7684\u5B9E\u9A8C\u53CA\u7ED3\u679C\u6709\u6CA1\u6709\u5F88\u597D\u5730\u652F\u6301\u9700\u8981\u9A8C\u8BC1\u7684\u79D1\u5B66\u5047\u8BBE\uFF1F",
          "\u8FD9\u7BC7\u8BBA\u6587\u5230\u5E95\u6709\u4EC0\u4E48\u8D21\u732E\uFF1F",
          "\u4E0B\u4E00\u6B65\u5462\uFF1F\u6709\u4EC0\u4E48\u5DE5\u4F5C\u53EF\u4EE5\u7EE7\u7EED\u6DF1\u5165\uFF1F"
        ];
        const body = labels.map((label, index) => `## Q${index + 1} ${label}

${answers[`q${index + 1}`]}`).join("\n\n");
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
primary_topic: ${yaml(String(taxonomy.primaryTopic || "\u672A\u5206\u7C7B"))}
subtopics: ${yaml(Array.isArray(taxonomy.subtopics) ? taxonomy.subtopics : [])}
methods: ${yaml(Array.isArray(taxonomy.methods) ? taxonomy.methods : [])}
tasks: ${yaml(Array.isArray(taxonomy.tasks) ? taxonomy.tasks : [])}
datasets_benchmarks: ${yaml(Array.isArray(taxonomy.datasets) ? taxonomy.datasets : [])}
classification_confidence: ${Number(taxonomy.confidence || 0)}
updated: ${this.iso(Date.now())}
tags:
  - paper-insight
---

# ${paper.title}\uFF1AAI \u7814\u7A76\u63D0\u70BC

> \u751F\u6210\u4F9D\u636E\uFF1A${payload.extractionLabel || "\u6807\u9898\u4E0E\u6458\u8981"}  
> \u6A21\u578B\uFF1A${payload.model || "\u672A\u8BB0\u5F55"}  
> \u6B64\u5185\u5BB9\u7531 AI \u81EA\u52A8\u751F\u6210\uFF0C\u5E94\u7ED3\u5408\u539F\u6587\u6838\u9A8C\u3002

${body}

## \u5019\u9009\u7814\u7A76\u8FDB\u5C55

${candidates.length ? candidates.map((candidate) => `### ${candidate.title}

${candidate.summary}

**\u4E0B\u4E00\u6B65\uFF1A** ${candidate.nextAction || "\u5F85\u786E\u5B9A"}`).join("\n\n") : "\u6682\u672A\u63D0\u53D6\u5230\u8DB3\u591F\u660E\u786E\u7684\u5019\u9009\u8FDB\u5C55\u3002"}
`;
        if (existing) await this.app.vault.modify(existing.file, content);
        else await this.app.vault.create(path, content);
        await this.app.fileManager.processFrontMatter(paper.file, (fm) => {
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
        const candidates = insight.insightCandidates.map((candidate) => candidate.id === candidateId ? { ...candidate, status } : candidate);
        await this.app.fileManager.processFrontMatter(insight.file, (fm) => {
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
        if (!config) throw new Error("\u4E0D\u652F\u6301\u7684\u5BF9\u8C61\u7C7B\u578B");
        const safe = title.replace(/[\\/:*?\"<>|]/g, "-").trim();
        const path = await this.uniquePath(`${config.folder}/${config.prefix}${safe}.md`);
        const projectYaml = project ? `
project:
  - "[[${project.replace(/^\[\[|\]\]$/g, "")}]]"` : "\nproject: []";
        const date = this.iso(Date.now());
        const yamlString = (value) => JSON.stringify(String(value || ""));
        const linkValue = (value) => {
          const clean = String(value || "").trim();
          if (!clean) return "";
          return clean.startsWith("[[") ? clean : `[[${clean.replace(/\\/g, "/")}]]`;
        };
        const literatureFields = type === "literature" ? `
category: ${yamlString(metadata.category || "\u672A\u5206\u7C7B")}
authors: ${metadata.authors ? `[${yamlString(metadata.authors)}]` : "[]"}
year: ${metadata.year ? Number(metadata.year) || yamlString(metadata.year) : ""}
pdf: ${yamlString(linkValue(metadata.pdf))}
slides: ${yamlString(linkValue(metadata.slides))}
doi: ${yamlString(metadata.doi)}
reading_progress: 0` : "";
        const content = `---
type: ${type}
title: ${yamlString(title)}
status: ${config.status}${projectYaml}${literatureFields}
created: ${date}
updated: ${date}
tags: []
---

# ${title}

## \u6458\u8981


## \u9AD8\u4EAE\u4E0E\u6458\u5F55


## \u6211\u7684\u7B14\u8BB0


## \u5F85\u529E

- [ ] 
`;
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
          category: "\u672A\u5206\u7C7B",
          pdf: attachmentPath,
          doi: metadata.doi
        });
        return { note, attachmentPath, metadata };
      }
      extractPdfMetadata(buffer, filename) {
        const sample = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 5 * 1024 * 1024));
        const raw = new TextDecoder("latin1").decode(sample);
        const literal = (key) => {
          const match = raw.match(new RegExp(`/${key}\\s*\\(([^)]{2,500})\\)`, "i"));
          return match ? match[1].replace(/\\([()\\])/g, "$1").replace(/\\[nrt]/g, " ").trim() : "";
        };
        const fallback = filename.replace(/\.pdf$/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
        const embeddedTitle = literal("Title");
        const doiMatch = raw.match(/10\.\d{4,9}\/[A-Z0-9._;()/:+-]+/i);
        const yearMatch = (literal("CreationDate") || raw.slice(0, 2e5)).match(/(?:19|20)\d{2}/);
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
        if (!isMarkdown && !isSlides) throw new Error("\u5F53\u524D\u8BBA\u6587\u53EA\u63A5\u53D7 Markdown\u3001PPT \u6216 PPTX \u6587\u4EF6");
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
        await this.app.fileManager.processFrontMatter(item.file, (fm) => {
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
        const now = /* @__PURE__ */ new Date();
        const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
        const base = kind === "main" ? "\u4E3B\u9605\u8BFB\u7B14\u8BB0" : `\u5B66\u4E60\u8FC7\u7A0B ${stamp}`;
        const path = await this.uniquePath(`${folder}/${base}.md`);
        const title = kind === "main" ? `${item.title}\uFF1A\u4E3B\u9605\u8BFB\u7B14\u8BB0` : `${item.title}\uFF1A\u5B66\u4E60\u8FC7\u7A0B`;
        const content = `---
type: literature-learning-note
source_paper: "[[${item.path}]]"
note_kind: ${kind}
created: ${this.iso(Date.now())}
---

# ${title}

${kind === "main" ? "## \u6838\u5FC3\u6458\u8981\n\n\n## \u9AD8\u4EAE\u4E0E\u6458\u5F55\n\n\n## \u6211\u7684\u7406\u89E3\n\n\n## \u95EE\u9898\u4E0E\u5F85\u9A8C\u8BC1\n" : "## \u5F53\u524D\u5728\u7406\u89E3\u4EC0\u4E48\n\n\n## \u4E0E AI / \u4ED6\u4EBA\u7684\u8BA8\u8BBA\n\n\n## \u6211\u5F97\u5230\u7684\u7406\u89E3\n\n\n## \u4ECD\u7136\u6CA1\u5F04\u61C2\u7684\u5730\u65B9\n\n\n## \u4E0B\u4E00\u6B65\n"}`;
        const file = await this.app.vault.create(path, content);
        await this.app.fileManager.processFrontMatter(item.file, (fm) => {
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
    };
    module2.exports = { ResearchStore: ResearchStore2 };
  }
});

// .obsidian/plugins/research-os/capture-modal.js
var require_capture_modal = __commonJS({
  ".obsidian/plugins/research-os/capture-modal.js"(exports2, module2) {
    var { Modal, Setting, Notice: Notice2 } = require("obsidian");
    var CaptureModal = class extends Modal {
      constructor(app, plugin, onCreated, initialType = "literature") {
        super(app);
        this.plugin = plugin;
        this.onCreated = onCreated;
        this.type = initialType;
        this.title = "";
        this.project = "";
        this.authors = "";
        this.year = "";
        this.category = "\u672A\u5206\u7C7B";
        this.pdf = "";
        this.slides = "";
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.addClass("ros-capture-modal");
        contentEl.createEl("h2", { text: "\u6DFB\u52A0\u6587\u732E" });
        contentEl.createEl("p", { text: "\u5148\u628A PDF \u6216 PPT \u62D6\u5165 Obsidian \u9644\u4EF6\u6587\u4EF6\u5939\uFF0C\u518D\u586B\u5199\u5176\u77E5\u8BC6\u5E93\u5185\u8DEF\u5F84\u3002\u53EA\u6709\u6807\u9898\u4E3A\u5FC5\u586B\u9879\u3002", cls: "ros-modal-help" });
        new Setting(contentEl).setName("\u6807\u9898").addText((text) => {
          text.setPlaceholder("\u8F93\u5165\u4E00\u4E2A\u660E\u786E\u6807\u9898");
          text.onChange((value) => this.title = value);
          setTimeout(() => text.inputEl.focus(), 0);
        });
        new Setting(contentEl).setName("\u4F5C\u8005").addText((text) => text.setPlaceholder("\u4F8B\u5982\uFF1ADon Norman").onChange((value) => this.authors = value));
        new Setting(contentEl).setName("\u5E74\u4EFD").addText((text) => text.setPlaceholder("\u4F8B\u5982\uFF1A2024").onChange((value) => this.year = value));
        new Setting(contentEl).setName("\u5206\u7C7B").addText((text) => text.setValue(this.category).setPlaceholder("\u4F8B\u5982\uFF1A\u4EBA\u673A\u4EA4\u4E92").onChange((value) => this.category = value));
        new Setting(contentEl).setName("PDF \u8DEF\u5F84").setDesc("\u76F8\u5BF9\u4E8E\u77E5\u8BC6\u5E93\u6839\u76EE\u5F55").addText((text) => text.setPlaceholder("09 Attachments/paper.pdf").onChange((value) => this.pdf = value));
        new Setting(contentEl).setName("PPT \u8DEF\u5F84").setDesc("\u53EF\u7A0D\u540E\u8865\u5145").addText((text) => text.setPlaceholder("09 Attachments/slides.pptx").onChange((value) => this.slides = value));
        const actions = contentEl.createDiv("ros-modal-actions");
        const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
        cancel.addEventListener("click", () => this.close());
        const create = actions.createEl("button", { text: "\u521B\u5EFA\u5E76\u6253\u5F00", cls: "mod-cta" });
        create.addEventListener("click", async () => {
          if (!this.title.trim()) return new Notice2("\u8BF7\u8F93\u5165\u6807\u9898");
          try {
            const file = await this.plugin.store.create("literature", this.title.trim(), "", {
              authors: this.authors.trim(),
              year: this.year.trim(),
              category: this.category.trim() || "\u672A\u5206\u7C7B",
              pdf: this.pdf.trim(),
              slides: this.slides.trim()
            });
            this.close();
            await this.app.workspace.getLeaf("tab").openFile(file);
            this.onCreated?.(file);
            if (this.plugin.ai.settings.autoInsightEnabled && this.plugin.ai.isConfigured()) {
              await this.plugin.store.load();
              const paper = this.plugin.store.get(file.path);
              if (paper) this.plugin.ai.ensurePaperInsight(paper).then(() => this.plugin.refreshViews()).catch((error) => new Notice2(`\u8BBA\u6587\u63D0\u70BC\u5931\u8D25\uFF1A${error.message}`, 8e3));
            }
          } catch (error) {
            new Notice2(`\u521B\u5EFA\u5931\u8D25\uFF1A${error.message}`);
          }
        });
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    module2.exports = { CaptureModal };
  }
});

// .obsidian/plugins/research-os/paper-graph.js
var require_paper_graph = __commonJS({
  ".obsidian/plugins/research-os/paper-graph.js"(exports2, module2) {
    var { setIcon } = require("obsidian");
    var SVG_NS = "http://www.w3.org/2000/svg";
    var PaperGraph = class {
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
        const stage = shell.createDiv({ cls: "ros-graph-stage", attr: { tabindex: "0", role: "application", "aria-label": "\u8BBA\u6587\u5173\u7CFB\u56FE\u8C31" } });
        const controls = stage.createDiv("ros-graph-controls");
        this.control(controls, "minus", "\u7F29\u5C0F", () => this.zoomBy(0.84));
        this.control(controls, "maximize-2", "\u9002\u5E94\u753B\u5E03", () => this.resetView());
        this.control(controls, "plus", "\u653E\u5927", () => this.zoomBy(1.18));
        const stats = stage.createDiv("ros-graph-stats");
        stats.createSpan({ text: `${papers.length} \u7BC7\u8BBA\u6587` });
        stats.createSpan({ text: "\u62D6\u52A8\u8282\u70B9 \xB7 \u6EDA\u8F6E\u7F29\u653E \xB7 \u70B9\u51FB\u8FDB\u5165\u9605\u8BFB" });
        const legend = stage.createDiv("ros-graph-legend");
        [["paper", "\u8BBA\u6587"], ["category", "\u4E3B\u8981\u4E3B\u9898"], ["method", "\u65B9\u6CD5"]].forEach(([kind, label]) => {
          const item = legend.createSpan(`is-${kind}`);
          item.createSpan();
          item.appendText(label);
        });
        if (!papers.length) {
          const empty = stage.createDiv("ros-graph-empty");
          const icon = empty.createDiv();
          setIcon(icon, "git-fork");
          empty.createEl("h3", { text: "\u56FE\u8C31\u4E2D\u8FD8\u6CA1\u6709\u8BBA\u6587" });
          empty.createEl("p", { text: "\u5411\u6587\u732E\u5E93\u6DFB\u52A0\u8BBA\u6587\u540E\uFF0C\u5173\u7CFB\u7F51\u7EDC\u4F1A\u81EA\u52A8\u751F\u6210\u3002" });
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
        const categories = /* @__PURE__ */ new Map();
        const methods = /* @__PURE__ */ new Map();
        papers.forEach((paper) => {
          const category = String(paper.primaryTopic || paper.category || "\u672A\u5206\u7C7B").trim() || "\u672A\u5206\u7C7B";
          if (!categories.has(category)) {
            const node = { id: `category:${category}`, kind: "category", label: category, radius: 7 };
            categories.set(category, node);
            nodes.push(node);
          }
          edges.push({ source: paper.path, target: `category:${category}`, kind: "category" });
          paper.methods.slice(0, 3).forEach((methodName) => {
            const method = String(methodName).trim();
            if (!method) return;
            if (!methods.has(method)) {
              const node = { id: `method:${method}`, kind: "method", label: method, radius: 6 };
              methods.set(method, node);
              nodes.push(node);
            }
            edges.push({ source: paper.path, target: `method:${method}`, kind: "method" });
          });
        });
        const paperByName = new Map(papers.flatMap((p) => [[p.file.basename.toLowerCase(), p], [p.path.toLowerCase(), p]]));
        papers.forEach((paper) => {
          const cache = this.app.metadataCache.getFileCache(paper.file);
          (cache?.links || []).map((entry) => entry.link).filter(Boolean).forEach((link) => {
            const clean = link.replace(/^.*\//, "").replace(/\.md$/i, "").toLowerCase();
            const target = paperByName.get(clean);
            if (target && target.path !== paper.path && !edges.some((edge) => edge.source === paper.path && edge.target === target.path)) {
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
          node.vx = 0;
          node.vy = 0;
        });
      }
      draw() {
        const byId = new Map(this.nodes.map((node) => [node.id, node]));
        this.edges.forEach((edge) => {
          edge.sourceNode = byId.get(edge.source);
          edge.targetNode = byId.get(edge.target);
          const line = document.createElementNS(SVG_NS, "line");
          line.setAttribute("class", `ros-graph-edge is-${edge.kind}`);
          this.edgeLayer.appendChild(line);
          edge.element = line;
        });
        this.nodes.forEach((node) => {
          const group = document.createElementNS(SVG_NS, "g");
          group.setAttribute("class", `ros-graph-node is-${node.kind}`);
          group.setAttribute("tabindex", "0");
          group.setAttribute("role", "button");
          group.setAttribute("aria-label", node.kind === "paper" ? `\u6253\u5F00\u8BBA\u6587\uFF1A${node.label}` : `\u5206\u7C7B\uFF1A${node.label}`);
          const halo = document.createElementNS(SVG_NS, "circle");
          halo.setAttribute("class", "ros-node-halo");
          halo.setAttribute("r", String(node.radius + 11));
          const circle = node.kind === "method" ? document.createElementNS(SVG_NS, "rect") : document.createElementNS(SVG_NS, "circle");
          circle.setAttribute("class", "ros-node-core");
          if (node.kind === "method") {
            circle.setAttribute("x", String(-node.radius));
            circle.setAttribute("y", String(-node.radius));
            circle.setAttribute("width", String(node.radius * 2));
            circle.setAttribute("height", String(node.radius * 2));
            circle.setAttribute("transform", "rotate(45)");
          } else circle.setAttribute("r", String(node.radius));
          const label = document.createElementNS(SVG_NS, "text");
          label.setAttribute("class", "ros-node-label");
          label.setAttribute("x", String(node.radius + 10));
          label.setAttribute("y", "4");
          label.textContent = this.truncate(node.label, node.kind === "paper" ? 42 : 22);
          group.append(halo, circle, label);
          this.nodeLayer.appendChild(group);
          node.element = group;
          group.addEventListener("pointerdown", (event) => this.startDrag(event, node));
          group.addEventListener("pointerenter", (event) => this.showTooltip(event, node));
          group.addEventListener("pointermove", (event) => this.moveTooltip(event));
          group.addEventListener("pointerleave", () => this.hideTooltip());
          group.addEventListener("click", (event) => {
            if (node.kind !== "paper" || node.wasDragged) return;
            event.stopPropagation();
            this.view.selectedPath = node.paper.path;
            this.view.section = "reader";
            this.view.render();
          });
          group.addEventListener("keydown", (event) => {
            if (node.kind === "paper" && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              this.view.selectedPath = node.paper.path;
              this.view.section = "reader";
              this.view.render();
            }
          });
        });
      }
      simulate(iterations) {
        let remaining = iterations;
        const tick = () => {
          if (this.destroyed || remaining-- <= 0) return;
          const centerX = this.width / 2, centerY = this.height / 2;
          this.nodes.forEach((node) => {
            if (node.fixed) return;
            node.vx += (centerX - node.x) * 7e-4;
            node.vy += (centerY - node.y) * 7e-4;
          });
          for (let i = 0; i < this.nodes.length; i++) for (let j = i + 1; j < this.nodes.length; j++) {
            const a = this.nodes[i], b = this.nodes[j];
            let dx = b.x - a.x, dy = b.y - a.y;
            const distance2 = Math.max(120, dx * dx + dy * dy);
            const force = 190 / distance2;
            const distance = Math.sqrt(distance2);
            dx /= distance;
            dy /= distance;
            if (!a.fixed) {
              a.vx -= dx * force;
              a.vy -= dy * force;
            }
            if (!b.fixed) {
              b.vx += dx * force;
              b.vy += dy * force;
            }
          }
          this.edges.forEach((edge) => {
            const a = edge.sourceNode, b = edge.targetNode;
            if (!a || !b) return;
            let dx = b.x - a.x, dy = b.y - a.y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const ideal = edge.kind === "category" ? 108 : edge.kind === "method" ? 92 : 145;
            const force = (distance - ideal) * 18e-4;
            dx /= distance;
            dy /= distance;
            if (!a.fixed) {
              a.vx += dx * force;
              a.vy += dy * force;
            }
            if (!b.fixed) {
              b.vx -= dx * force;
              b.vy -= dy * force;
            }
          });
          this.nodes.forEach((node) => {
            if (!node.fixed) {
              node.vx *= 0.88;
              node.vy *= 0.88;
              node.x += node.vx;
              node.y += node.vy;
            }
          });
          this.update();
          this.frame = requestAnimationFrame(tick);
        };
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(tick);
      }
      update() {
        this.edges.forEach((edge) => {
          if (!edge.sourceNode || !edge.targetNode) return;
          edge.element.setAttribute("x1", edge.sourceNode.x);
          edge.element.setAttribute("y1", edge.sourceNode.y);
          edge.element.setAttribute("x2", edge.targetNode.x);
          edge.element.setAttribute("y2", edge.targetNode.y);
        });
        const query = this.view.query.trim().toLowerCase();
        this.nodes.forEach((node) => {
          node.element.setAttribute("transform", `translate(${node.x} ${node.y})`);
          node.element.classList.toggle("is-dimmed", Boolean(query) && !node.label.toLowerCase().includes(query));
        });
        this.viewport.setAttribute("transform", `translate(${this.pan.x} ${this.pan.y}) scale(${this.scale})`);
      }
      bindStage(stage) {
        stage.addEventListener("wheel", (event) => {
          event.preventDefault();
          this.zoomBy(event.deltaY < 0 ? 1.08 : 0.92);
        }, { passive: false });
        stage.addEventListener("pointerdown", (event) => {
          if (event.target === this.svg) this.drag = { type: "pan", x: event.clientX, y: event.clientY, startX: this.pan.x, startY: this.pan.y };
        });
        window.addEventListener("pointermove", this.onPointerMove = (event) => {
          if (!this.drag) return;
          if (this.drag.type === "pan") {
            this.pan.x = this.drag.startX + event.clientX - this.drag.x;
            this.pan.y = this.drag.startY + event.clientY - this.drag.y;
          } else {
            const rect = this.svg.getBoundingClientRect();
            this.drag.node.x = (event.clientX - rect.left - this.pan.x) / this.scale;
            this.drag.node.y = (event.clientY - rect.top - this.pan.y) / this.scale;
            this.drag.node.wasDragged = Math.hypot(event.clientX - this.drag.x, event.clientY - this.drag.y) > 4;
          }
          this.update();
        });
        window.addEventListener("pointerup", this.onPointerUp = () => {
          if (this.drag?.node) this.drag.node.fixed = false;
          this.drag = null;
          this.simulate(35);
        });
      }
      startDrag(event, node) {
        event.stopPropagation();
        node.fixed = true;
        node.wasDragged = false;
        this.drag = { type: "node", node, x: event.clientX, y: event.clientY };
      }
      zoomBy(amount) {
        this.scale = Math.max(0.45, Math.min(2.2, this.scale * amount));
        this.update();
      }
      resetView() {
        this.scale = 1;
        this.pan = { x: 0, y: 0 };
        this.update();
      }
      showTooltip(event, node) {
        const paper = node.paper;
        this.tooltip.empty();
        this.tooltip.createEl("strong", { text: node.label });
        this.tooltip.createEl("span", { text: paper ? [paper.authors.slice(0, 3).join(", "), paper.year, paper.primaryTopic || paper.category].filter(Boolean).join(" \xB7 ") : node.kind === "method" ? "\u65B9\u6CD5\u8282\u70B9" : "\u4E3B\u8981\u4E3B\u9898\u8282\u70B9" });
        this.tooltip.addClass("is-visible");
        this.moveTooltip(event);
      }
      moveTooltip(event) {
        if (!this.tooltip) return;
        const rect = this.tooltip.parentElement.getBoundingClientRect();
        this.tooltip.style.transform = `translate(${event.clientX - rect.left + 16}px, ${event.clientY - rect.top + 16}px)`;
      }
      hideTooltip() {
        this.tooltip?.removeClass("is-visible");
      }
      truncate(value, length) {
        return value.length > length ? `${value.slice(0, length - 1)}\u2026` : value;
      }
      destroy() {
        this.destroyed = true;
        cancelAnimationFrame(this.frame);
        if (this.onPointerMove) window.removeEventListener("pointermove", this.onPointerMove);
        if (this.onPointerUp) window.removeEventListener("pointerup", this.onPointerUp);
      }
    };
    module2.exports = { PaperGraph };
  }
});

// .obsidian/plugins/research-os/progress-modal.js
var require_progress_modal = __commonJS({
  ".obsidian/plugins/research-os/progress-modal.js"(exports2, module2) {
    var { Modal, Setting, Notice: Notice2 } = require("obsidian");
    var TYPES = {
      finding: "\u7814\u7A76\u53D1\u73B0",
      method: "\u65B9\u6CD5\u542F\u53D1",
      question: "\u95EE\u9898",
      gap: "\u7814\u7A76\u7A7A\u767D",
      conflict: "\u51B2\u7A81",
      hypothesis: "\u7814\u7A76\u5047\u8BBE",
      decision: "\u51B3\u7B56"
    };
    var MATURITY = {
      seed: "\u79CD\u5B50",
      exploring: "\u63A2\u7D22\u4E2D",
      formed: "\u5DF2\u5F62\u6210\u5224\u65AD",
      writing: "\u5DF2\u7528\u4E8E\u5199\u4F5C"
    };
    var ROLES = {
      support: "\u652F\u6301",
      oppose: "\u53CD\u5BF9",
      inspiration: "\u542F\u53D1",
      background: "\u80CC\u666F",
      verify: "\u5F85\u9A8C\u8BC1"
    };
    var ProgressModal = class extends Modal {
      constructor(app, plugin, onCreated, options = {}) {
        super(app);
        this.plugin = plugin;
        this.onCreated = onCreated;
        this.title = options.title || "";
        this.summary = options.summary || "";
        this.progressType = options.progressType || "finding";
        this.maturity = options.maturity || "seed";
        this.nextAction = options.nextAction || "";
        this.selected = /* @__PURE__ */ new Map();
        if (options.paper) this.selected.set(options.paper.path, { paper: options.paper, role: options.role || "inspiration" });
        (options.papers || []).forEach((entry) => {
          const paper = this.plugin.store.get(entry.path);
          if (paper) this.selected.set(paper.path, { paper, role: entry.role || "inspiration" });
        });
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.addClass("ros-progress-modal");
        contentEl.createEl("h2", { text: "\u8BB0\u5F55\u7814\u7A76\u8FDB\u5C55" });
        contentEl.createEl("p", { text: "\u8BB0\u5F55\u4F60\u56E0\u9605\u8BFB\u800C\u5F62\u6210\u7684\u8BA4\u8BC6\uFF0C\u800C\u4E0D\u662F\u9605\u8BFB\u6570\u91CF\u3002\u4E4B\u540E\u4ECD\u53EF\u5728 Markdown \u4E2D\u81EA\u7531\u8865\u5145\u3002", cls: "ros-modal-help" });
        new Setting(contentEl).setName("\u6807\u9898").setDesc("\u7528\u4E00\u53E5\u8BDD\u8868\u8FBE\u5F53\u524D\u8BA4\u8BC6").addText((text) => {
          text.setPlaceholder("\u4F8B\u5982\uFF1AAgent Memory \u53EF\u80FD\u9700\u8981\u4E3B\u52A8\u9057\u5FD8\u673A\u5236").setValue(this.title).onChange((value) => this.title = value);
          setTimeout(() => text.inputEl.focus(), 0);
        });
        new Setting(contentEl).setName("\u7C7B\u578B").addDropdown((dropdown) => dropdown.addOptions(TYPES).setValue(this.progressType).onChange((value) => this.progressType = value));
        new Setting(contentEl).setName("\u6210\u719F\u5EA6").addDropdown((dropdown) => dropdown.addOptions(MATURITY).setValue(this.maturity).onChange((value) => this.maturity = value));
        new Setting(contentEl).setName("\u5F53\u524D\u8BA4\u8BC6").setDesc("\u7B80\u8981\u5199\u6E05\u53D1\u73B0\u3001\u731C\u60F3\u6216\u95EE\u9898").addTextArea((area) => {
          area.setPlaceholder("\u8FD9\u51E0\u7BC7\u8BBA\u6587\u5171\u540C\u8BF4\u660E\u4E86\u4EC0\u4E48\uFF1F\u4E3A\u4EC0\u4E48\u503C\u5F97\u7EE7\u7EED\u7814\u7A76\uFF1F").setValue(this.summary).onChange((value) => this.summary = value);
          area.inputEl.rows = 5;
        });
        new Setting(contentEl).setName("\u552F\u4E00\u4E0B\u4E00\u6B65").setDesc("\u53EA\u4FDD\u7559\u73B0\u5728\u6700\u503C\u5F97\u505A\u7684\u4E00\u4EF6\u4E8B").addText((text) => text.setPlaceholder("\u4F8B\u5982\uFF1A\u5BFB\u627E\u5173\u4E8E memory consolidation \u7684\u76F8\u5173\u5DE5\u4F5C").setValue(this.nextAction).onChange((value) => this.nextAction = value));
        contentEl.createEl("h3", { text: "\u5173\u8054\u8BBA\u6587" });
        contentEl.createEl("p", { text: "\u9009\u62E9\u8BBA\u6587\u5E76\u6807\u8BB0\u5B83\u5728\u8FD9\u6761\u8FDB\u5C55\u4E2D\u626E\u6F14\u7684\u4F5C\u7528\u3002", cls: "ros-modal-help" });
        const papers = contentEl.createDiv("ros-progress-paper-picker");
        const literature = this.plugin.store.byType("literature").sort((a, b) => b.mtime - a.mtime);
        literature.forEach((paper) => this.renderPaperChoice(papers, paper));
        if (!literature.length) papers.createDiv({ text: "\u6587\u732E\u5E93\u4E2D\u8FD8\u6CA1\u6709\u8BBA\u6587\u3002", cls: "ros-simple-empty" });
        const actions = contentEl.createDiv("ros-modal-actions");
        const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
        cancel.addEventListener("click", () => this.close());
        const create = actions.createEl("button", { text: "\u4FDD\u5B58\u8FDB\u5C55", cls: "mod-cta" });
        create.addEventListener("click", async () => {
          if (!this.title.trim()) return new Notice2("\u8BF7\u8F93\u5165\u8FDB\u5C55\u6807\u9898");
          if (!this.summary.trim()) return new Notice2("\u8BF7\u5199\u4E0B\u5F53\u524D\u8BA4\u8BC6");
          create.disabled = true;
          try {
            const file = await this.plugin.store.createResearchProgress({
              title: this.title,
              summary: this.summary,
              progressType: this.progressType,
              maturity: this.maturity,
              nextAction: this.nextAction,
              papers: [...this.selected.values()].map((value) => ({ path: value.paper.path, role: value.role }))
            });
            this.close();
            this.onCreated?.(file);
          } catch (error) {
            create.disabled = false;
            new Notice2(`\u4FDD\u5B58\u5931\u8D25\uFF1A${error.message}`, 7e3);
          }
        });
      }
      renderPaperChoice(parent, paper) {
        const row = parent.createDiv("ros-progress-paper-choice");
        const selected = this.selected.get(paper.path);
        const checkbox = row.createEl("input", { attr: { type: "checkbox", "aria-label": `\u5173\u8054\u8BBA\u6587\uFF1A${paper.title}` } });
        checkbox.checked = Boolean(selected);
        const copy = row.createDiv("ros-progress-paper-copy");
        copy.createDiv({ text: paper.title, cls: "ros-progress-paper-title" });
        copy.createDiv({ text: [paper.year, paper.category].filter(Boolean).join(" \xB7 "), cls: "ros-progress-paper-meta" });
        const role = row.createEl("select", { attr: { "aria-label": `${paper.title} \u7684\u8BC1\u636E\u89D2\u8272` } });
        Object.entries(ROLES).forEach(([value, label]) => role.createEl("option", { text: label, attr: { value } }));
        role.value = selected?.role || "inspiration";
        role.disabled = !selected;
        checkbox.addEventListener("change", () => {
          role.disabled = !checkbox.checked;
          if (checkbox.checked) this.selected.set(paper.path, { paper, role: role.value });
          else this.selected.delete(paper.path);
        });
        role.addEventListener("change", () => {
          if (checkbox.checked) this.selected.set(paper.path, { paper, role: role.value });
        });
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    module2.exports = { ProgressModal, TYPES, MATURITY, ROLES };
  }
});

// .obsidian/plugins/research-os/synthesis-modal.js
var require_synthesis_modal = __commonJS({
  ".obsidian/plugins/research-os/synthesis-modal.js"(exports2, module2) {
    var { Modal, Notice: Notice2, setIcon } = require("obsidian");
    var SynthesisModal = class extends Modal {
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
        copy.createEl("h2", { text: this.step === 1 ? "\u9009\u62E9\u8981\u4E00\u8D77\u7814\u7A76\u7684\u8BBA\u6587" : "\u786E\u5B9A\u8FD9\u6B21\u8981\u5F04\u6E05\u695A\u7684\u95EE\u9898" });
        copy.createEl("p", { text: this.step === 1 ? "\u5EFA\u8BAE\u9009\u62E9 3\u20138 \u7BC7\u3002AI \u4F1A\u5148\u8865\u9F50\u5355\u7BC7\u63D0\u70BC\uFF0C\u518D\u6BD4\u8F83\u5B83\u4EEC\u4E4B\u95F4\u7684\u5171\u8BC6\u3001\u5DEE\u5F02\u548C\u7A7A\u767D\u3002" : "\u4E00\u4E2A\u660E\u786E\u7684\u95EE\u9898\u80FD\u8BA9\u7EFC\u5408\u7ED3\u8BBA\u66F4\u805A\u7126\uFF1B\u4E5F\u53EF\u4EE5\u7559\u7A7A\uFF0C\u7531 AI \u81EA\u52A8\u8BC6\u522B\u5171\u540C\u4E3B\u9898\u3002" });
        head.createSpan({ text: `${this.step} / 2`, cls: "ros-synthesis-step" });
        if (this.step === 1) this.renderPaperStep(root);
        else this.renderGoalStep(root);
      }
      renderPaperStep(root) {
        const search = root.createEl("input", { cls: "ros-synthesis-search", attr: { type: "search", placeholder: "\u641C\u7D22\u6807\u9898\u3001\u4F5C\u8005\u3001\u4E3B\u9898\u6216\u65B9\u6CD5\u2026", "aria-label": "\u641C\u7D22\u53EF\u5173\u8054\u8BBA\u6587" } });
        search.value = this.query;
        search.addEventListener("input", (event) => {
          this.query = event.target.value;
          this.render();
        });
        const papers = this.plugin.store.byType("literature");
        const q = this.query.trim().toLowerCase();
        const visible = papers.filter((paper) => !q || [paper.title, ...paper.authors, paper.primaryTopic, ...paper.subtopics, ...paper.methods].join(" ").toLowerCase().includes(q));
        const topics = this.groupByTopic(visible);
        const list = root.createDiv("ros-synthesis-paper-list");
        if (!visible.length) list.createDiv({ text: "\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u8BBA\u6587", cls: "ros-simple-empty" });
        topics.forEach((group) => {
          const section = list.createEl("section", { cls: "ros-synthesis-paper-group" });
          const groupHead = section.createDiv("ros-synthesis-group-head");
          groupHead.createEl("h3", { text: group.topic });
          groupHead.createSpan({ text: `${group.papers.length} \u7BC7` });
          group.papers.forEach((paper) => {
            const label = section.createEl("label", { cls: `ros-synthesis-paper ${this.selected.has(paper.path) ? "is-selected" : ""}` });
            const checkbox = label.createEl("input", { attr: { type: "checkbox" } });
            checkbox.checked = this.selected.has(paper.path);
            const body = label.createDiv();
            body.createEl("strong", { text: paper.title });
            body.createSpan({ text: [paper.year, paper.authors.slice(0, 3).join(", "), paper.methods.slice(0, 2).join(" / ")].filter(Boolean).join(" \xB7 ") || "\u7B49\u5F85 AI \u8865\u5145\u5206\u7C7B" });
            const state = label.createSpan({ text: this.plugin.store.getPaperInsight(paper.path) ? "\u5DF2\u63D0\u70BC" : "\u5C06\u81EA\u52A8\u63D0\u70BC", cls: "ros-synthesis-paper-state" });
            checkbox.addEventListener("change", () => {
              if (checkbox.checked) this.selected.add(paper.path);
              else this.selected.delete(paper.path);
              this.render();
            });
          });
        });
        this.renderActions(root, false);
      }
      renderGoalStep(root) {
        const selected = [...this.selected].map((path) => this.plugin.store.get(path)).filter(Boolean);
        const summary = root.createDiv("ros-synthesis-selection-summary");
        summary.createEl("strong", { text: `\u5DF2\u9009\u62E9 ${selected.length} \u7BC7\u8BBA\u6587` });
        summary.createSpan({ text: this.suggestedTopic(selected) });
        const form = root.createDiv("ros-synthesis-form");
        const topicLabel = form.createEl("label");
        topicLabel.createSpan({ text: "\u7814\u7A76\u4E3B\u9898" });
        const topic = topicLabel.createEl("input", { attr: { type: "text", placeholder: "\u4F8B\u5982\uFF1AAgent \u5B89\u5168\u5BF9\u9F50" } });
        topic.value = this.topic || this.suggestedTopic(selected, true);
        topic.addEventListener("input", (event) => this.topic = event.target.value);
        const goalLabel = form.createEl("label");
        goalLabel.createSpan({ text: "\u6211\u60F3\u901A\u8FC7\u8FD9\u4E9B\u8BBA\u6587\u5F04\u6E05\u695A\u4EC0\u4E48\uFF1F" });
        const goal = goalLabel.createEl("textarea", { attr: { rows: "4", placeholder: "\u4F8B\u5982\uFF1A\u5931\u8D25\u8F68\u8FF9\u5982\u4F55\u7528\u4E8E Agent \u5B89\u5168\u5BF9\u9F50\uFF1F\u4E0D\u540C\u65B9\u6CD5\u7684\u8BC1\u636E\u548C\u5C40\u9650\u662F\u4EC0\u4E48\uFF1F" } });
        goal.value = this.goal;
        goal.addEventListener("input", (event) => this.goal = event.target.value);
        const presets = form.createDiv("ros-synthesis-presets");
        ["\u4E86\u89E3\u9886\u57DF\u73B0\u72B6", "\u6BD4\u8F83\u65B9\u6CD5\u5DEE\u5F02", "\u5BFB\u627E\u7814\u7A76\u7A7A\u767D", "\u63D0\u70BC\u4E0B\u4E00\u6B65\u7814\u7A76\u95EE\u9898"].forEach((value) => {
          const button = presets.createEl("button", { text: value, attr: { type: "button" } });
          button.addEventListener("click", () => {
            this.goal = value;
            this.render();
          });
        });
        this.renderActions(root, true);
      }
      renderActions(root, finalStep) {
        const actions = root.createDiv("ros-synthesis-actions");
        const count = actions.createSpan({ text: `\u5DF2\u9009\u62E9 ${this.selected.size} \u7BC7` });
        const controls = actions.createDiv();
        if (finalStep) {
          const back = controls.createEl("button", { text: "\u8FD4\u56DE\u9009\u62E9" });
          back.addEventListener("click", () => {
            this.step = 1;
            this.render();
          });
        } else {
          const clear = controls.createEl("button", { text: "\u6E05\u7A7A" });
          clear.disabled = !this.selected.size;
          clear.addEventListener("click", () => {
            this.selected.clear();
            this.render();
          });
        }
        const next = controls.createEl("button", { cls: "mod-cta" });
        const icon = next.createSpan();
        setIcon(icon, finalStep ? "sparkles" : "arrow-right");
        next.createSpan({ text: finalStep ? "\u751F\u6210\u7EFC\u5408\u8FDB\u5C55" : "\u4E0B\u4E00\u6B65" });
        next.disabled = this.selected.size < 2;
        next.addEventListener("click", () => finalStep ? this.generate(next) : (this.step = 2, this.render()));
        if (this.selected.size > 12) count.setText(`\u5DF2\u9009\u62E9 ${this.selected.size} \u7BC7 \xB7 \u5EFA\u8BAE\u7F29\u51CF\u5230 12 \u7BC7\u4EE5\u5185`);
      }
      async generate(button) {
        const papers = [...this.selected].map((path) => this.plugin.store.get(path)).filter(Boolean);
        button.disabled = true;
        button.setText("\u6B63\u5728\u63D0\u70BC\u5E76\u7EFC\u5408\u2026");
        try {
          const result = await this.plugin.ai.synthesizeResearchProgress(papers, this.goal);
          const topic = this.topic.trim() || result.classification?.primaryTopic || result.topic || "\u7814\u7A76\u7EFC\u5408";
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
          new Notice2("\u591A\u8BBA\u6587\u7EFC\u5408\u8FDB\u5C55\u5DF2\u751F\u6210");
        } catch (error) {
          button.disabled = false;
          button.setText("\u91CD\u65B0\u751F\u6210");
          new Notice2(`\u751F\u6210\u5931\u8D25\uFF1A${error.message}`, 9e3);
        }
      }
      groupByTopic(papers) {
        const map = /* @__PURE__ */ new Map();
        papers.forEach((paper) => {
          const rawTopic = paper.primaryTopic || paper.category || "\u5F85\u8BC6\u522B";
          const normalized = this.plugin.ai.normalizeLibraryTopic(rawTopic);
          const topic = normalized === "\u5F85\u8BC6\u522B" ? this.plugin.ai.fallbackLibraryTopic(paper) : normalized;
          if (!map.has(topic)) map.set(topic, []);
          map.get(topic).push(paper);
        });
        return [...map.entries()].map(([topic, grouped]) => ({ topic, papers: grouped.sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || a.title.localeCompare(b.title)) })).sort((a, b) => b.papers.length - a.papers.length || a.topic.localeCompare(b.topic));
      }
      suggestedTopic(papers, valueOnly = false) {
        const counts = /* @__PURE__ */ new Map();
        papers.forEach((paper) => {
          const topic2 = paper.primaryTopic || paper.category;
          if (topic2 && topic2 !== "\u672A\u5206\u7C7B") counts.set(topic2, (counts.get(topic2) || 0) + 1);
        });
        const topic = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "\u5F85\u8BC6\u522B\u5171\u540C\u4E3B\u9898";
        return valueOnly && topic === "\u5F85\u8BC6\u522B\u5171\u540C\u4E3B\u9898" ? "" : topic;
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    module2.exports = { SynthesisModal };
  }
});

// .obsidian/plugins/research-os/literature-modal.js
var require_literature_modal = __commonJS({
  ".obsidian/plugins/research-os/literature-modal.js"(exports2, module2) {
    var { Modal, Setting, Notice: Notice2 } = require("obsidian");
    var LiteratureEditModal = class extends Modal {
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
        root.createEl("h2", { text: "\u7F16\u8F91\u6587\u732E\u4FE1\u606F" });
        root.createEl("p", { text: "\u4FEE\u6539\u53EA\u4F1A\u66F4\u65B0\u6587\u732E\u7B14\u8BB0\u7684 Properties\uFF0C\u4E0D\u4F1A\u6539\u52A8 PDF \u6B63\u6587\u3002", cls: "ros-modal-help" });
        this.text(root, "\u8BBA\u6587\u6807\u9898", "title");
        this.text(root, "\u4F5C\u8005", "authors", "\u591A\u4EBA\u7528\u9017\u53F7\u5206\u9694");
        this.text(root, "\u5E74\u4EFD", "year");
        this.text(root, "\u4F1A\u8BAE / \u671F\u520A", "journal");
        new Setting(root).setName("\u6458\u8981").addTextArea((area) => {
          area.setValue(this.values.abstract).onChange((value) => this.values.abstract = value);
          area.inputEl.rows = 6;
        });
        this.text(root, "\u4E00\u7EA7\u7814\u7A76\u4E3B\u9898", "primaryTopic");
        this.text(root, "\u5B50\u65B9\u5411", "subtopics", "\u591A\u4E2A\u65B9\u5411\u7528\u9017\u53F7\u5206\u9694");
        this.text(root, "\u65B9\u6CD5", "methods", "\u591A\u4E2A\u65B9\u6CD5\u7528\u9017\u53F7\u5206\u9694");
        const actions = root.createDiv("ros-modal-actions");
        const repair = actions.createEl("button", { text: "\u4ECE PDF \u81EA\u52A8\u8BC6\u522B" });
        repair.disabled = !this.item.pdf;
        repair.addEventListener("click", () => this.repair(repair));
        const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
        cancel.addEventListener("click", () => this.close());
        const save = actions.createEl("button", { text: "\u4FDD\u5B58", cls: "mod-cta" });
        save.addEventListener("click", () => this.save(save));
      }
      text(root, name, key, description = "") {
        const setting = new Setting(root).setName(name);
        if (description) setting.setDesc(description);
        setting.addText((input) => input.setValue(String(this.values[key] || "")).onChange((value) => this.values[key] = value));
      }
      list(value) {
        return String(value || "").split(/[,，;；]/).map((item) => item.trim()).filter(Boolean);
      }
      async save(button) {
        if (!this.values.title.trim()) return new Notice2("\u8BBA\u6587\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A");
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
          new Notice2(`\u4FDD\u5B58\u5931\u8D25\uFF1A${error.message}`, 7e3);
        }
      }
      async repair(button) {
        button.disabled = true;
        button.setText("\u6B63\u5728\u8BFB\u53D6 PDF\u2026");
        try {
          const identified = await this.plugin.ai.repairPaperMetadata(this.item);
          this.values.title = identified.title || this.values.title;
          this.values.authors = identified.authors.length ? identified.authors.join(", ") : this.values.authors;
          this.values.year = identified.year || this.values.year;
          this.values.journal = identified.journal || this.values.journal;
          this.values.abstract = identified.abstract || this.values.abstract;
          this.contentEl.empty();
          this.onOpen();
          new Notice2("\u5DF2\u4ECE PDF \u8BC6\u522B\u6807\u9898\u3001\u4F5C\u8005\u4E0E\u6458\u8981\uFF0C\u8BF7\u68C0\u67E5\u540E\u4FDD\u5B58");
        } catch (error) {
          button.disabled = false;
          button.setText("\u91CD\u8BD5\u81EA\u52A8\u8BC6\u522B");
          new Notice2(`\u8BC6\u522B\u5931\u8D25\uFF1A${error.message}`, 8e3);
        }
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    var LiteratureDeleteModal = class extends Modal {
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
        root.createEl("h2", { text: "\u4ECE\u6587\u732E\u5E93\u5220\u9664\uFF1F" });
        root.createEl("p", { text: this.item.title });
        root.createEl("p", { text: "\u9ED8\u8BA4\u53EA\u628A\u6587\u732E\u7B14\u8BB0\u79FB\u5230\u7CFB\u7EDF\u56DE\u6536\u7AD9\uFF0C\u539F\u59CB PDF\u3001PPT \u548C\u72EC\u7ACB\u7B14\u8BB0\u4F1A\u7EE7\u7EED\u4FDD\u7559\u3002", cls: "ros-modal-help" });
        new Setting(root).setName("\u540C\u65F6\u5220\u9664\u5173\u8054\u6750\u6599").setDesc("\u5305\u62EC PDF\u3001PPT\u3001\u72EC\u7ACB Markdown \u7B14\u8BB0\u548C AI \u5341\u95EE\u63D0\u70BC\uFF1B\u6587\u4EF6\u4F1A\u8FDB\u5165\u7CFB\u7EDF\u56DE\u6536\u7AD9\u3002").addToggle((toggle) => toggle.setValue(false).onChange((value) => this.deleteAttachments = value));
        const actions = root.createDiv("ros-modal-actions");
        const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
        cancel.addEventListener("click", () => this.close());
        const remove = actions.createEl("button", { text: "\u79FB\u5230\u56DE\u6536\u7AD9", cls: "mod-warning" });
        remove.addEventListener("click", async () => {
          remove.disabled = true;
          try {
            await this.plugin.store.deleteLiterature(this.item, this.deleteAttachments);
            this.close();
            this.onDeleted?.();
            new Notice2("\u6587\u732E\u5DF2\u79FB\u5230\u56DE\u6536\u7AD9");
          } catch (error) {
            remove.disabled = false;
            new Notice2(`\u5220\u9664\u5931\u8D25\uFF1A${error.message}`, 7e3);
          }
        });
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    module2.exports = { LiteratureEditModal, LiteratureDeleteModal };
  }
});

// .obsidian/plugins/research-os/research-view.js
var require_research_view = __commonJS({
  ".obsidian/plugins/research-os/research-view.js"(exports2, module2) {
    var { ItemView: ItemView2, Notice: Notice2, setIcon, TFile } = require("obsidian");
    var { CaptureModal } = require_capture_modal();
    var { PaperGraph } = require_paper_graph();
    var { ProgressModal, TYPES: PROGRESS_TYPES, MATURITY, ROLES: EVIDENCE_ROLES } = require_progress_modal();
    var { SynthesisModal } = require_synthesis_modal();
    var { LiteratureEditModal, LiteratureDeleteModal } = require_literature_modal();
    var VIEW_TYPE2 = "research-os-view";
    var STATUS = {
      inbox: "\u6536\u4EF6\u7BB1",
      "to-read": "\u5F85\u8BFB",
      reading: "\u9605\u8BFB\u4E2D",
      read: "\u5DF2\u5B8C\u6210",
      annotated: "\u5DF2\u5B8C\u6210"
    };
    var ResearchView2 = class extends ItemView2 {
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
      getViewType() {
        return VIEW_TYPE2;
      }
      getDisplayText() {
        return "Research OS";
      }
      getIcon() {
        return "book-open";
      }
      async onOpen() {
        this.contentEl.addClass("research-os-host");
        this.applyForestBackground();
        await this.plugin.store.load();
        this.render();
      }
      async onClose() {
        if (this.paperGraph) {
          this.paperGraph.destroy();
          this.paperGraph = null;
        }
      }
      applyForestBackground() {
        if (this.plugin.theme) return this.plugin.theme.applyTo(this.contentEl);
        const forest = this.app.vault.getAbstractFileByPath("forest.jpg");
        const forestUrl = forest ? this.app.vault.getResourcePath(forest) : this.app.vault.adapter.getResourcePath(".obsidian/plugins/research-os/forest.jpg");
        this.contentEl.style.setProperty("--ros-forest-image", `url("${forestUrl}")`);
      }
      render() {
        const root = this.contentEl;
        if (this.paperGraph) {
          this.paperGraph.destroy();
          this.paperGraph = null;
        }
        root.empty();
        root.addClass("research-os-host");
        root.removeClass("ros-skin-forest");
        root.removeClass("ros-skin-crt");
        this.applyForestBackground();
        const shell = root.createDiv("ros-shell ros-simple-shell");
        this.installFileDrop(shell);
        const dropOverlay = shell.createDiv("ros-pdf-drop-overlay");
        const dropIcon = dropOverlay.createDiv("ros-pdf-drop-icon");
        setIcon(dropIcon, "file-down");
        dropOverlay.createEl("strong", { text: "\u677E\u5F00\u5373\u53EF\u5BFC\u5165\u6216\u5173\u8054\u6587\u4EF6" });
        dropOverlay.createSpan({ text: "PDF \u521B\u5EFA\u6587\u732E\uFF1BPPT \u4E0E Markdown \u5173\u8054\u5230\u5F53\u524D\u8BBA\u6587" });
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
        const nav = sidebar.createEl("nav", { cls: "ros-nav", attr: { "aria-label": "\u6587\u732E\u5DE5\u4F5C\u533A" } });
        [
          ["discover", "sparkles", "AI \u53D1\u73B0"],
          ["queue", "list-checks", "\u9605\u8BFB\u961F\u5217"],
          ["library", "library", "\u6587\u732E\u5E93"],
          ["graph", "git-fork", "\u8BBA\u6587\u56FE\u8C31"],
          ["progress", "sprout", "\u7814\u7A76\u8FDB\u5C55"],
          ["reader", "book-open", "\u9605\u8BFB\u7B14\u8BB0"]
        ].forEach(([id, icon, label]) => {
          const button = nav.createEl("button", { cls: `ros-nav-item ${this.section === id ? "is-active" : ""}` });
          const iconEl = button.createSpan("ros-nav-icon");
          setIcon(iconEl, icon);
          button.createSpan({ text: label });
          button.addEventListener("click", () => {
            this.section = id;
            this.render();
          });
        });
        const bottom = sidebar.createDiv("ros-sidebar-bottom");
        const literature = this.plugin.store.byType("literature");
        bottom.createDiv({ text: "\u5F53\u524D\u6587\u732E\u5E93", cls: "ros-meta-label" });
        bottom.createDiv({ text: this.app.vault.getName(), cls: "ros-vault-name" });
        bottom.createDiv({ text: `${literature.length} \u7BC7\u6587\u732E \xB7 ${literature.filter((x) => x.status === "reading").length} \u7BC7\u9605\u8BFB\u4E2D`, cls: "ros-vault-stats" });
      }
      renderTopbar(workspace) {
        const bar = workspace.createEl("header", { cls: "ros-topbar" });
        const title = bar.createDiv("ros-page-title");
        const titles = { discover: ["AI \u8BBA\u6587\u53D1\u73B0", "\u6BCF\u5468\u7B5B\u9009\u5927\u6A21\u578B\u4E0E Agent \u65B0\u8BBA\u6587"], queue: ["\u9605\u8BFB\u961F\u5217", "\u660E\u786E\u4E0B\u4E00\u7BC7\uFF0C\u4FDD\u6301\u9605\u8BFB\u8282\u594F"], library: ["\u6587\u732E\u5E93", "\u6536\u96C6\u3001\u641C\u7D22\u3001\u5206\u7C7B\u4E0E\u7BA1\u7406\u9605\u8BFB\u72B6\u6001"], graph: ["\u8BBA\u6587\u56FE\u8C31", "\u63A2\u7D22\u8BBA\u6587\u4E4B\u95F4\u7684\u4E3B\u9898\u3001\u4F5C\u8005\u4E0E\u6982\u5FF5\u8054\u7CFB"], progress: ["\u7814\u7A76\u8FDB\u5C55", "\u628A\u8BFB\u8FC7\u7684\u8BBA\u6587\u8F6C\u5316\u4E3A\u81EA\u5DF1\u7684\u5224\u65AD\u4E0E\u4E0B\u4E00\u6B65"], reader: ["\u9605\u8BFB\u7B14\u8BB0", "PDF\u3001Markdown \u4E0E AI \u7814\u7A76\u52A9\u624B"] };
        title.createEl("h1", { text: titles[this.section][0] });
        title.createEl("p", { text: titles[this.section][1] });
        const tools = bar.createDiv("ros-tools");
        const searchWrap = tools.createDiv("ros-search");
        const searchIcon = searchWrap.createSpan();
        setIcon(searchIcon, "search");
        const search = searchWrap.createEl("input", { attr: { type: "search", placeholder: "\u641C\u7D22\u6807\u9898\u3001\u4F5C\u8005\u6216\u5206\u7C7B\u2026", "aria-label": "\u641C\u7D22\u6587\u732E" } });
        search.value = this.query;
        search.addEventListener("input", (e) => {
          const target = e.target;
          this.query = target.value;
          window.clearTimeout(this.searchRenderTimer);
          this.searchRenderTimer = window.setTimeout(() => {
            const cursor = target.selectionStart ?? this.query.length;
            this.render();
            const next = this.contentEl.querySelector(".ros-search input");
            if (next) {
              next.focus();
              next.setSelectionRange(cursor, cursor);
            }
          }, 120);
        });
        const capture = tools.createEl("button", { cls: "ros-primary-btn" });
        const plus = capture.createSpan();
        setIcon(plus, this.section === "discover" ? "refresh-cw" : this.section === "progress" ? "sprout" : "plus");
        capture.createSpan({ text: this.section === "discover" ? "\u7ACB\u5373\u53D1\u73B0" : this.section === "progress" ? "\u9009\u62E9\u8BBA\u6587\u751F\u6210\u8FDB\u5C55" : "\u624B\u52A8\u6DFB\u52A0" });
        capture.addEventListener("click", () => {
          if (this.section === "discover") return this.runDiscovery();
          if (this.section === "progress") return new SynthesisModal(this.app, this.plugin, () => this.render()).open();
          new CaptureModal(this.app, this.plugin, () => this.render(), "literature").open();
        });
      }
      async runDiscovery() {
        const notice = new Notice2("\u6B63\u5728\u6293\u53D6\u5E76\u5206\u6790\u65B0\u8BBA\u6587\u2026", 0);
        try {
          await this.plugin.ai.runWeeklyDiscovery(true);
          notice.hide();
          this.render();
          new Notice2("\u8BBA\u6587\u53D1\u73B0\u5B8C\u6210");
        } catch (error) {
          notice.hide();
          new Notice2(error.message, 8e3);
        }
      }
      renderDiscovery(page) {
        const intro = page.createEl("section", { cls: "ros-simple-card ros-ai-intro" });
        const last = this.plugin.ai.settings.lastDiscoveryAt ? new Date(this.plugin.ai.settings.lastDiscoveryAt).toLocaleString() : "\u5C1A\u672A\u8FD0\u884C";
        intro.createEl("h2", { text: "\u672C\u5468\u5019\u9009\u8BBA\u6587" });
        intro.createEl("p", { text: `\u5173\u6CE8\uFF1A${this.plugin.ai.settings.interests} \xB7 \u4E0A\u6B21\u66F4\u65B0\uFF1A${last}` });
        if (!this.plugin.ai.isConfigured()) {
          const warning = intro.createDiv("ros-ai-warning");
          warning.createSpan({ text: "\u5C1A\u672A\u914D\u7F6E DeepSeek API Key\u3002\u53EF\u4EE5\u6293\u53D6\u8BBA\u6587\uFF0C\u4F46\u65E0\u6CD5\u751F\u6210\u4E2A\u6027\u5316\u63A8\u8350\u7406\u7531\u4E0E\u5BFC\u8BFB\u3002" });
          const open = warning.createEl("button", { text: "\u6253\u5F00\u8BBE\u7F6E" });
          open.addEventListener("click", () => {
            this.app.setting.open();
            this.app.setting.openTabById(this.plugin.manifest.id);
          });
        }
        const papers = (this.plugin.ai.settings.discoveries || []).filter((x) => x.state !== "dismissed");
        if (!papers.length) {
          const empty = page.createDiv("ros-empty-state ros-simple-card");
          const icon = empty.createDiv("ros-empty-icon");
          setIcon(icon, "radar");
          empty.createEl("h2", { text: "\u8FD8\u6CA1\u6709\u672C\u5468\u63A8\u8350" });
          empty.createEl("p", { text: "\u70B9\u51FB\u53F3\u4E0A\u89D2\u201C\u7ACB\u5373\u53D1\u73B0\u201D\uFF0C\u7CFB\u7EDF\u4F1A\u6293\u53D6\u6700\u65B0\u8BBA\u6587\u5E76\u6309\u4F60\u7684\u7814\u7A76\u5174\u8DA3\u6392\u5E8F\u3002" });
          return;
        }
        const list = page.createDiv("ros-ai-paper-list");
        papers.forEach((paper) => {
          const card = list.createEl("article", { cls: "ros-simple-card ros-ai-paper" });
          const meta = card.createDiv("ros-ai-paper-meta");
          meta.createSpan({ text: paper.source });
          meta.createSpan({ text: paper.published });
          meta.createSpan({ text: paper.readingMode });
          card.createEl("h2", { text: paper.title });
          card.createDiv({ text: paper.authors.slice(0, 5).join(", "), cls: "ros-ai-authors" });
          card.createEl("p", { text: paper.reason || paper.abstract.slice(0, 260), cls: "ros-ai-reason" });
          const foot = card.createDiv("ros-ai-paper-foot");
          foot.createSpan({ text: `\u76F8\u5173\u5EA6 ${Math.round(paper.score || 0)}` });
          const actions = foot.createDiv("ros-ai-actions");
          const dismiss = actions.createEl("button", { text: "\u4E0D\u611F\u5174\u8DA3" });
          dismiss.addEventListener("click", async () => {
            paper.state = "dismissed";
            await this.plugin.ai.save();
            this.render();
          });
          const add = actions.createEl("button", { text: paper.state === "imported" ? "\u5DF2\u52A0\u5165" : "\u52A0\u5165\u9605\u8BFB\u8BA1\u5212", cls: "ros-primary-btn" });
          add.disabled = paper.state === "imported";
          add.addEventListener("click", async () => {
            add.disabled = true;
            add.setText("\u6B63\u5728\u5BFC\u5165\u2026");
            try {
              const note = await this.plugin.ai.importDiscovery(paper);
              this.selectedPath = note.path;
              this.section = "reader";
              this.render();
              new Notice2("\u8BBA\u6587\u5DF2\u52A0\u5165\u9605\u8BFB\u8BA1\u5212\uFF0CAI \u5BFC\u8BFB\u5DF2\u5199\u5165\u7B14\u8BB0");
            } catch (error) {
              add.disabled = false;
              add.setText("\u91CD\u8BD5");
              new Notice2(error.message, 8e3);
            }
          });
          const link = actions.createEl("button", { text: "\u67E5\u770B\u6458\u8981" });
          link.addEventListener("click", () => window.open(paper.url));
        });
      }
      installFileDrop(shell) {
        const internalFile = (event) => {
          const raw = event.dataTransfer?.getData("text/plain")?.trim() || "";
          const clean = raw.replace(/^!?\[\[/, "").replace(/\]\]$/, "").split("|")[0];
          const file = this.app.vault.getAbstractFileByPath(clean) || this.app.metadataCache.getFirstLinkpathDest(clean, this.selectedPath || "");
          return file instanceof TFile && /\.(md|ppt|pptx)$/i.test(file.name) ? file : null;
        };
        const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files") || Boolean(internalFile(event));
        shell.addEventListener("dragenter", (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          shell.addClass("is-pdf-dragging");
        });
        shell.addEventListener("dragover", (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          shell.addClass("is-pdf-dragging");
        });
        shell.addEventListener("dragleave", (event) => {
          if (!shell.contains(event.relatedTarget)) shell.removeClass("is-pdf-dragging");
        });
        shell.addEventListener("drop", async (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          shell.removeClass("is-pdf-dragging");
          const files = Array.from(event.dataTransfer.files || []);
          const pdfs = files.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
          const resources = files.filter((file) => /\.(md|ppt|pptx)$/i.test(file.name));
          const current = this.plugin.store.get(this.selectedPath);
          const internal = !files.length ? internalFile(event) : null;
          if (!pdfs.length && !resources.length && !internal) return new Notice2("\u652F\u6301\u62D6\u5165 PDF\u3001Markdown\u3001PPT \u548C PPTX \u6587\u4EF6");
          if ((resources.length || internal) && (!current || this.section !== "reader")) return new Notice2("\u8BF7\u5148\u6253\u5F00\u4E00\u7BC7\u8BBA\u6587\u7684\u201C\u9605\u8BFB\u7B14\u8BB0\u201D\u9875\u9762\uFF0C\u518D\u62D6\u5165 Markdown \u6216 PPT");
          const notice = new Notice2("\u6B63\u5728\u5904\u7406\u62D6\u5165\u7684\u6587\u4EF6\u2026", 0);
          try {
            let latest = null;
            const importedPapers = [];
            for (const pdf of pdfs) {
              latest = await this.plugin.store.importPdf(pdf);
              importedPapers.push(latest.note.path);
            }
            for (const resource of resources) await this.plugin.store.attachResource(current, resource);
            if (internal) await this.plugin.store.attachResource(current, null, internal.path);
            await this.plugin.store.load();
            if (latest) {
              this.selectedPath = latest.note.path;
              this.section = "library";
            }
            this.render();
            notice.hide();
            const parts = [];
            if (pdfs.length) parts.push(`${pdfs.length} \u7BC7 PDF`);
            if (resources.length || internal) parts.push(`${resources.length + (internal ? 1 : 0)} \u4E2A\u5173\u8054\u6587\u4EF6`);
            new Notice2(`\u5DF2\u5904\u7406 ${parts.join("\u3001")}`);
            if (this.plugin.ai.settings.autoInsightEnabled && this.plugin.ai.isConfigured()) {
              importedPapers.forEach((path) => {
                const paper = this.plugin.store.get(path);
                if (paper) (async () => {
                  let current2 = paper;
                  if (paper.pdf && (!paper.raw.abstract || paper.title === paper.file.basename)) {
                    try {
                      const metadata = await this.plugin.ai.repairPaperMetadata(paper);
                      current2 = await this.plugin.store.updateLiteratureMetadata(paper, metadata);
                    } catch (error) {
                      console.warn(`Metadata repair skipped for ${paper.path}`, error);
                    }
                  }
                  await this.plugin.ai.ensurePaperInsight(current2);
                  await this.plugin.ai.organizeLibraryTaxonomy();
                  this.render();
                })().catch((error) => new Notice2(`\u8BBA\u6587\u5206\u6790\u5931\u8D25\uFF1A${error.message}`, 8e3));
              });
            }
          } catch (error) {
            notice.hide();
            new Notice2(`\u5BFC\u5165\u5931\u8D25\uFF1A${error.message}`);
          }
        });
      }
      literature() {
        return this.plugin.store.search(this.query, this.plugin.store.byType("literature"));
      }
      renderQueue(page) {
        const items = this.literature();
        const active = items.filter((x) => x.status === "reading");
        const next = items.filter((x) => ["to-read", "inbox", "to-screen"].includes(x.status)).sort((a, b) => b.priority - a.priority);
        const done = items.filter((x) => ["read", "annotated"].includes(x.status)).sort((a, b) => b.mtime - a.mtime).slice(0, 5);
        const overview = page.createDiv("ros-queue-overview");
        this.renderQueueSection(overview, "\u6B63\u5728\u9605\u8BFB", "\u7EE7\u7EED\u4E0A\u6B21\u7684\u8FDB\u5EA6", active, "\u73B0\u5728\u6CA1\u6709\u6B63\u5728\u9605\u8BFB\u7684\u6587\u732E");
        this.renderQueueSection(overview, "\u63A5\u4E0B\u6765\u9605\u8BFB", "\u6309\u4F18\u5148\u7EA7\u6392\u5217", next, "\u961F\u5217\u5DF2\u6E05\u7A7A");
        this.renderQueueSection(overview, "\u6700\u8FD1\u5B8C\u6210", "\u4FDD\u7559\u6700\u8FD1 5 \u7BC7", done, "\u8FD8\u6CA1\u6709\u5B8C\u6210\u8BB0\u5F55");
      }
      renderQueueSection(parent, title, hint, items, empty) {
        const panel = parent.createEl("section", { cls: "ros-simple-card ros-queue-section" });
        const head = panel.createDiv("ros-section-heading");
        head.createEl("h2", { text: title });
        head.createSpan({ text: hint });
        if (!items.length) return panel.createDiv({ text: empty, cls: "ros-simple-empty" });
        items.forEach((item) => this.renderLiteratureRow(panel, item, true));
      }
      renderLibrary(page) {
        const controls = page.createDiv("ros-library-controls");
        const filters = controls.createDiv("ros-filterbar");
        [["all", "\u5168\u90E8"], ["inbox", "\u6536\u4EF6\u7BB1"], ["to-read", "\u5F85\u8BFB"], ["reading", "\u9605\u8BFB\u4E2D"], ["read", "\u5DF2\u5B8C\u6210"]].forEach(([id, label]) => {
          const button = filters.createEl("button", { text: label, cls: this.filter === id ? "is-active" : "" });
          button.addEventListener("click", () => {
            this.filter = id;
            this.render();
          });
        });
        const organize = controls.createEl("button", { cls: ["ros-secondary-btn", "ros-ai-library-action"] });
        const organizeIcon = organize.createSpan();
        setIcon(organizeIcon, "sparkles");
        organize.createSpan({ text: "AI \u91CD\u6574\u6587\u732E\u5E93" });
        organize.addEventListener("click", () => this.organizeLibrary(organize));
        let items = this.literature();
        if (this.filter !== "all") items = items.filter((x) => this.filter === "read" ? ["read", "annotated"].includes(x.status) : x.status === this.filter);
        const groups = this.groupLiteratureByTopic(items);
        const layout = page.createDiv("ros-library-layout");
        const directory = layout.createEl("aside", { cls: "ros-topic-directory", attr: { "aria-label": "AI \u7814\u7A76\u4E3B\u9898\u76EE\u5F55" } });
        const directoryHead = directory.createDiv("ros-topic-directory-head");
        directoryHead.createEl("h2", { text: "\u7814\u7A76\u4E3B\u9898" });
        directoryHead.createSpan({ text: `${groups.length} \u4E2A\u4E3B\u9898` });
        const all = directory.createEl("button", { cls: this.libraryTopic === "all" ? "is-active" : "" });
        all.createSpan({ text: "\u5168\u90E8\u6587\u732E" });
        all.createSpan({ text: String(items.length) });
        all.addEventListener("click", () => {
          this.libraryTopic = "all";
          this.render();
        });
        groups.forEach((group) => {
          const button = directory.createEl("button", { cls: this.libraryTopic === group.topic ? "is-active" : "" });
          button.createSpan({ text: group.topic });
          button.createSpan({ text: String(group.items.length) });
          button.addEventListener("click", () => {
            this.libraryTopic = group.topic;
            this.render();
          });
        });
        const content = layout.createDiv("ros-library-groups");
        const visibleGroups = this.libraryTopic === "all" ? groups : groups.filter((group) => group.topic === this.libraryTopic);
        if (!visibleGroups.length) return content.createDiv({ text: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u6587\u732E", cls: "ros-simple-empty ros-simple-card" });
        visibleGroups.forEach((group) => this.renderLiteratureGroup(content, group));
      }
      groupLiteratureByTopic(items) {
        const map = /* @__PURE__ */ new Map();
        items.forEach((item) => {
          const rawTopic = item.primaryTopic || item.category || "\u5F85\u8BC6\u522B";
          const normalized = this.plugin.ai.normalizeLibraryTopic(rawTopic);
          const topic = normalized === "\u5F85\u8BC6\u522B" ? this.plugin.ai.fallbackLibraryTopic(item) : normalized;
          if (!map.has(topic)) map.set(topic, []);
          map.get(topic).push(item);
        });
        return [...map.entries()].map(([topic, grouped]) => ({
          topic,
          items: grouped.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || Number(b.year || 0) - Number(a.year || 0) || a.title.localeCompare(b.title)),
          subtopics: [...new Set(grouped.flatMap((item) => item.subtopics).filter(Boolean))].slice(0, 5)
        })).sort((a, b) => a.topic === "\u672A\u5206\u7C7B" ? 1 : b.topic === "\u672A\u5206\u7C7B" ? -1 : b.items.length - a.items.length || a.topic.localeCompare(b.topic));
      }
      renderLiteratureGroup(parent, group) {
        const section = parent.createEl("section", { cls: "ros-library-topic ros-simple-card" });
        const head = section.createDiv("ros-library-topic-head");
        const copy = head.createDiv();
        copy.createEl("h2", { text: group.topic });
        if (group.subtopics.length) copy.createEl("p", { text: group.subtopics.join(" \xB7 ") });
        head.createSpan({ text: `${group.items.length} \u7BC7` });
        group.items.forEach((item) => this.renderLiteratureRow(section, item, false));
      }
      async organizeLibrary(button) {
        if (!this.plugin.ai.isConfigured()) return new Notice2("\u8BF7\u5148\u914D\u7F6E DeepSeek API Key");
        let papers = this.plugin.store.byType("literature");
        if (!papers.length) return new Notice2("\u6587\u732E\u5E93\u4E2D\u8FD8\u6CA1\u6709\u8BBA\u6587");
        button.disabled = true;
        button.setText(`\u6B63\u5728\u6821\u6B63 ${papers.length} \u7BC7\u2026`);
        try {
          const suspicious = papers.filter((paper) => paper.pdf && (!paper.raw.abstract || /^\d+(?:[._-]\w+)*$/i.test(paper.title) || paper.title === paper.file.basename));
          for (const paper of suspicious) {
            try {
              const metadata = await this.plugin.ai.repairPaperMetadata(paper);
              await this.plugin.store.updateLiteratureMetadata(paper, metadata);
            } catch (error) {
              console.warn(`Metadata repair skipped for ${paper.path}`, error);
            }
          }
          await this.plugin.store.load();
          papers = this.plugin.store.byType("literature");
          button.setText("\u6B63\u5728\u8BFB\u53D6\u6B63\u6587\u4E0E\u7B14\u8BB0\u2026");
          for (const paper of papers) {
            try {
              await this.plugin.ai.ensurePaperInsight(paper);
            } catch (error) {
              console.warn(`Insight refresh skipped for ${paper.path}`, error);
            }
          }
          button.setText("\u6B63\u5728\u7EDF\u4E00\u4E3B\u9898\u76EE\u5F55\u2026");
          await this.plugin.ai.organizeLibraryTaxonomy();
          this.render();
          new Notice2("\u5DF2\u4FEE\u590D\u53EF\u8BC6\u522B\u7684\u6587\u732E\u4FE1\u606F\uFF0C\u5E76\u5B8C\u6210\u5168\u5E93\u4E3B\u9898\u805A\u7C7B");
        } catch (error) {
          button.disabled = false;
          button.setText("\u91CD\u65B0\u6574\u7406");
          new Notice2(`\u6574\u7406\u5931\u8D25\uFF1A${error.message}`, 8e3);
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
        return this.plugin.store.byType("paper-insight").flatMap((insight) => {
          const sourcePath = this.cleanLink(insight.sourcePaper);
          const paper = this.plugin.store.get(sourcePath);
          if (!paper) return [];
          return insight.insightCandidates.filter((candidate) => candidate.status === "pending").map((candidate) => ({ insight, paper, candidate }));
        });
      }
      renderResearchProgress(page) {
        const items = this.researchProgress();
        const syntheses = items.filter((item) => item.progressKind === "synthesis");
        const notes = items.filter((item) => item.progressKind !== "synthesis");
        const intro = page.createEl("section", { cls: "ros-progress-intro ros-simple-card" });
        const introCopy = intro.createDiv();
        introCopy.createEl("h2", { text: "\u4ECE\u8BBA\u6587\u96C6\u5408\u5F62\u6210\u9636\u6BB5\u6027\u7ED3\u8BBA" });
        introCopy.createEl("p", { text: "\u9009\u62E9\u51E0\u7BC7\u76F8\u5173\u8BBA\u6587\uFF0CAI \u4F1A\u6BD4\u8F83\u5171\u8BC6\u3001\u51B2\u7A81\u3001\u65B9\u6CD5\u548C\u7814\u7A76\u7A7A\u767D\uFF0C\u5E76\u4FDD\u7559\u6BCF\u6761\u5224\u65AD\u7684\u8BBA\u6587\u4F9D\u636E\u3002" });
        const create = intro.createEl("button", { cls: "ros-primary-btn" });
        const createIcon = create.createSpan();
        setIcon(createIcon, "sparkles");
        create.createSpan({ text: "\u9009\u62E9\u8BBA\u6587\u751F\u6210\u8FDB\u5C55" });
        create.addEventListener("click", () => new SynthesisModal(this.app, this.plugin, () => this.render()).open());
        if (syntheses.length) {
          const workspace = page.createDiv("ros-synthesis-workspaces");
          const grouped = /* @__PURE__ */ new Map();
          syntheses.forEach((item) => {
            const topic = item.synthesisTopic || "\u672A\u5206\u7C7B\u7814\u7A76\u4E3B\u9898";
            if (!grouped.has(topic)) grouped.set(topic, []);
            grouped.get(topic).push(item);
          });
          [...grouped.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([topic, topicItems]) => {
            const section = workspace.createEl("section", { cls: "ros-synthesis-topic" });
            const head = section.createDiv("ros-synthesis-topic-head");
            head.createEl("h2", { text: topic });
            head.createSpan({ text: `${topicItems.length} \u4EFD\u9636\u6BB5\u7ED3\u8BBA` });
            topicItems.sort((a, b) => b.mtime - a.mtime).forEach((item) => this.renderSynthesisItem(section, item));
          });
        } else {
          const empty = page.createDiv("ros-empty-state ros-simple-card");
          empty.createEl("h2", { text: "\u8FD8\u6CA1\u6709\u591A\u8BBA\u6587\u7EFC\u5408\u8FDB\u5C55" });
          empty.createEl("p", { text: "\u4ECE 2\u20138 \u7BC7\u76F8\u5173\u8BBA\u6587\u5F00\u59CB\uFF0C\u56F4\u7ED5\u4E00\u4E2A\u95EE\u9898\u751F\u6210\u7B2C\u4E00\u4EFD\u9636\u6BB5\u6027\u7ED3\u8BBA\u3002" });
        }
        const automatic = this.pendingPaperInsightCandidates();
        if (automatic.length || notes.length) {
          const drawer = page.createEl("details", { cls: "ros-progress-inbox ros-simple-card" });
          drawer.createEl("summary", { text: `\u5F85\u6574\u7406\u6750\u6599 ${automatic.length + notes.length}` });
          const inbox = drawer.createDiv("ros-progress-suggestions");
          const inboxHead = inbox.createDiv("ros-section-heading");
          inboxHead.createEl("h2", { text: "\u5355\u7BC7\u8BBA\u6587\u7EBF\u7D22" });
          inboxHead.createSpan({ text: "\u53EF\u4FDD\u7559\u4E3A\u72EC\u7ACB\u7B14\u8BB0\uFF0C\u6216\u7528\u4E8E\u4E0B\u4E00\u6B21\u591A\u8BBA\u6587\u7EFC\u5408" });
          automatic.forEach(({ insight, paper, candidate }) => {
            const row = inbox.createDiv("ros-progress-suggestion");
            const copy = row.createDiv();
            copy.createSpan({ text: PROGRESS_TYPES[candidate.type] || "\u7814\u7A76\u8FDB\u5C55", cls: `ros-progress-type is-${candidate.type}` });
            copy.createEl("h3", { text: candidate.title });
            copy.createEl("p", { text: candidate.summary });
            copy.createEl("small", { text: `\u6765\u6E90\uFF1A${paper.title}${candidate.nextAction ? ` \xB7 \u4E0B\u4E00\u6B65\uFF1A${candidate.nextAction}` : ""}` });
            const actions = row.createDiv("ros-progress-suggestion-actions");
            const dismiss = actions.createEl("button", { text: "\u5FFD\u7565" });
            dismiss.addEventListener("click", async () => {
              await this.plugin.store.updateInsightCandidate(insight, candidate.id, "dismissed");
              this.render();
            });
            const save = actions.createEl("button", { text: "\u4FDD\u7559", cls: "ros-primary-btn" });
            save.addEventListener("click", () => this.promoteInsightCandidate(paper, insight, candidate, save));
          });
          if (notes.length) {
            const noteHead = inbox.createDiv("ros-section-heading");
            noteHead.createEl("h2", { text: "\u5DF2\u4FDD\u7559\u7684\u72EC\u7ACB\u7B14\u8BB0" });
            noteHead.createSpan({ text: `${notes.length} \u6761` });
            notes.forEach((item) => this.renderProgressItem(inbox, item));
          }
        }
      }
      renderSynthesisItem(parent, item) {
        const article = parent.createEl("article", { cls: "ros-synthesis-item ros-simple-card" });
        const head = article.createDiv("ros-synthesis-item-head");
        const copy = head.createDiv();
        copy.createEl("h3", { text: item.title });
        copy.createSpan({ text: `${item.papers.length} \u7BC7\u8BBA\u6587 \xB7 \u7B2C ${item.synthesisVersion} \u7248 \xB7 ${item.updated}` });
        const status = head.createSpan({ text: item.maturity === "draft" ? "\u5F85\u6838\u9A8C" : MATURITY[item.maturity] || "\u9636\u6BB5\u7ED3\u8BBA", cls: "ros-synthesis-status" });
        article.createEl("p", { text: item.synthesisSections.conclusion || item.summary || "\u5C1A\u672A\u5F62\u6210\u5F53\u524D\u7ED3\u8BBA", cls: "ros-synthesis-conclusion" });
        const metrics = article.createDiv("ros-synthesis-metrics");
        [["\u5171\u8BC6", item.synthesisSections.consensus], ["\u51B2\u7A81", item.synthesisSections.conflicts], ["\u7814\u7A76\u7A7A\u767D", item.synthesisSections.gaps]].forEach(([label, value]) => {
          if (!value) return;
          const metric = metrics.createDiv();
          metric.createSpan({ text: label });
          metric.createEl("p", { text: value });
        });
        const foot = article.createDiv("ros-synthesis-item-foot");
        const sources = foot.createDiv("ros-synthesis-source-stack");
        item.papers.slice(0, 4).forEach((reference) => {
          const paper = this.plugin.store.get(this.cleanLink(reference));
          if (paper) sources.createSpan({ text: paper.title.slice(0, 1), attr: { title: paper.title } });
        });
        foot.createSpan({ text: item.researchGoal || "\u7531 AI \u8BC6\u522B\u5171\u540C\u7814\u7A76\u95EE\u9898" });
        const open = foot.createEl("button", { text: "\u6253\u5F00\u5B8C\u6574\u8FDB\u5C55" });
        open.addEventListener("click", () => this.app.workspace.getLeaf("tab").openFile(item.file));
      }
      renderProgressItem(parent, item) {
        const article = parent.createEl("article", { cls: "ros-progress-item ros-simple-card" });
        const head = article.createDiv("ros-progress-item-head");
        const heading = head.createDiv();
        heading.createSpan({ text: PROGRESS_TYPES[item.progressType] || "\u8FDB\u5C55", cls: `ros-progress-type is-${item.progressType || "finding"}` });
        heading.createEl("h2", { text: item.title });
        const maturity = head.createEl("select", { cls: "ros-progress-maturity", attr: { "aria-label": `${item.title}\u7684\u6210\u719F\u5EA6` } });
        Object.entries(MATURITY).forEach(([value, label]) => maturity.createEl("option", { text: label, attr: { value } }));
        maturity.value = item.maturity || "seed";
        maturity.addEventListener("change", async () => {
          await this.plugin.store.updateProgressMaturity(item, maturity.value);
          this.render();
        });
        if (item.summary) article.createEl("p", { text: item.summary, cls: "ros-progress-summary" });
        const paperRow = article.createDiv("ros-progress-linked-papers");
        item.papers.forEach((reference) => {
          const path = this.cleanLink(reference);
          const paper = this.plugin.store.get(path) || this.literature().find((candidate) => candidate.file.basename === path.replace(/^.*\//, ""));
          if (!paper) return;
          const chip = paperRow.createEl("button", { cls: "ros-progress-paper-chip" });
          chip.createSpan({ text: EVIDENCE_ROLES[item.evidenceRoles[path]] || EVIDENCE_ROLES[item.evidenceRoles[paper.path]] || "\u5173\u8054" });
          chip.createSpan({ text: paper.title });
          chip.addEventListener("click", () => {
            this.selectedPath = paper.path;
            this.section = "reader";
            this.render();
          });
        });
        const foot = article.createDiv("ros-progress-item-foot");
        const next = foot.createDiv("ros-progress-next");
        next.createSpan({ text: "\u4E0B\u4E00\u6B65" });
        next.createEl("strong", { text: item.nextAction || "\u5C1A\u672A\u8BBE\u7F6E" });
        const actions = foot.createDiv("ros-progress-item-actions");
        actions.createSpan({ text: `\u66F4\u65B0\u4E8E ${item.updated}` });
        const open = actions.createEl("button", { text: "\u6253\u5F00\u5B8C\u6574\u7B14\u8BB0" });
        open.addEventListener("click", () => this.app.workspace.getLeaf("tab").openFile(item.file));
      }
      cleanLink(value) {
        return String(value || "").replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
      }
      async generateProgressSuggestions(button) {
        const read = this.literature().filter((item) => ["read", "annotated"].includes(item.status));
        if (!read.length) return new Notice2("\u8BF7\u5148\u5C06\u81F3\u5C11\u4E00\u7BC7\u8BBA\u6587\u6807\u8BB0\u4E3A\u5DF2\u5B8C\u6210");
        button.disabled = true;
        const label = button.querySelector("span:last-child");
        if (label) label.setText("\u6B63\u5728\u7EFC\u5408\u5DF2\u8BFB\u8BBA\u6587\u2026");
        try {
          this.progressSuggestions = await this.plugin.ai.suggestResearchProgress(read);
          if (!this.progressSuggestions.length) new Notice2("\u6682\u672A\u53D1\u73B0\u8DB3\u591F\u660E\u786E\u7684\u5019\u9009\u7EBF\u7D22");
          this.render();
        } catch (error) {
          button.disabled = false;
          if (label) label.setText("\u4ECE\u5DF2\u8BFB\u8BBA\u6587\u5BFB\u627E\u7EBF\u7D22");
          new Notice2(error.message, 8e3);
        }
      }
      renderLiteratureRow(parent, item, compact) {
        const row = parent.createDiv({ cls: `ros-literature-row ${compact ? "is-compact" : ""}` });
        const openArea = row.createEl("button", { cls: "ros-literature-open", attr: { "aria-label": `\u6253\u5F00\u6587\u732E\uFF1A${item.title}` } });
        const main = openArea.createDiv("ros-literature-main");
        main.createDiv({ text: item.title, cls: "ros-row-title" });
        const meta = [item.authors.join(", "), item.year, item.journal].filter(Boolean).join(" \xB7 ");
        main.createDiv({ text: meta || "\u672A\u8865\u5145\u6587\u732E\u4FE1\u606F", cls: "ros-row-meta" });
        if (!compact) {
          main.createEl("p", { text: item.raw.abstract ? String(item.raw.abstract).slice(0, 220) : "\u6458\u8981\u5C1A\u672A\u8BC6\u522B\uFF0C\u53EF\u70B9\u51FB\u7F16\u8F91\u6309\u94AE\u4ECE PDF \u81EA\u52A8\u8865\u5168\u3002", cls: `ros-row-abstract ${item.raw.abstract ? "" : "is-missing"}` });
          const taxonomy = main.createDiv("ros-row-taxonomy");
          const subtopics = item.subtopics.slice(0, 2);
          const methods = item.methods.slice(0, 2);
          if (subtopics.length) taxonomy.createSpan({ text: `\u5B50\u65B9\u5411\uFF1A${subtopics.join(" / ")}` });
          if (methods.length) taxonomy.createSpan({ text: `\u65B9\u6CD5\uFF1A${methods.join(" / ")}` });
          if (!subtopics.length && !methods.length) taxonomy.createSpan({ text: "\u7B49\u5F85 AI \u5B8C\u5584\u5B50\u65B9\u5411\u4E0E\u65B9\u6CD5" });
        }
        const resources = openArea.createDiv("ros-resource-icons");
        this.resourceIcon(resources, "file-text", true, "Markdown \u7B14\u8BB0");
        if (item.pdf) this.resourceIcon(resources, "file-scan", true, "PDF");
        if (item.slides) this.resourceIcon(resources, "presentation", true, "PPT");
        const state = openArea.createDiv("ros-row-state");
        state.createSpan({ text: STATUS[item.status] || "\u672A\u8BBE\u7F6E", cls: `ros-status status-${item.status}` });
        if (item.status === "reading") state.createSpan({ text: `${item.progress}%`, cls: "ros-progress-text" });
        openArea.addEventListener("click", () => {
          this.selectedPath = item.path;
          this.section = "reader";
          this.render();
        });
        if (!compact) {
          const actions = row.createDiv("ros-literature-actions");
          const edit = actions.createEl("button", { attr: { "aria-label": `\u7F16\u8F91 ${item.title}`, title: "\u7F16\u8F91\u6587\u732E\u4FE1\u606F" } });
          setIcon(edit, "pencil");
          edit.addEventListener("click", () => new LiteratureEditModal(this.app, this.plugin, item, () => this.render()).open());
          const remove = actions.createEl("button", { attr: { "aria-label": `\u5220\u9664 ${item.title}`, title: "\u5220\u9664\u6587\u732E" } });
          setIcon(remove, "trash-2");
          remove.addEventListener("click", () => new LiteratureDeleteModal(this.app, this.plugin, item, () => this.render()).open());
        }
      }
      resourceIcon(parent, icon, enabled, label) {
        const span = parent.createSpan({ cls: enabled ? "is-ready" : "", attr: { title: label } });
        setIcon(span, icon);
      }
      renderReader(page) {
        const item = this.plugin.store.get(this.selectedPath) || this.literature().find((x) => x.status === "reading") || this.literature()[0];
        if (!item) return this.renderEmpty(page, "\u8FD8\u6CA1\u6709\u53EF\u9605\u8BFB\u7684\u6587\u732E", "\u5148\u5728\u6587\u732E\u5E93\u6DFB\u52A0\u4E00\u7BC7\u6587\u732E\u3002", true);
        this.selectedPath = item.path;
        const reader = page.createDiv("ros-reader-layout");
        const head = reader.createEl("section", { cls: "ros-simple-card ros-reader-head" });
        head.createDiv({ text: item.category || "\u672A\u5206\u7C7B", cls: "ros-detail-kind" });
        head.createEl("h2", { text: item.title });
        head.createDiv({ text: [item.authors.join(", "), item.year, item.journal].filter(Boolean).join(" \xB7 ") || "\u5C1A\u672A\u8865\u5145\u4F5C\u8005\u4E0E\u51FA\u7248\u4FE1\u606F", cls: "ros-reader-meta" });
        const insight = this.plugin.store.getPaperInsight(item.path);
        const headActions = head.createDiv("ros-reader-head-actions");
        const extract = headActions.createEl("button", { cls: ["ros-secondary-btn", "ros-ai-extract-action"] });
        const extractIcon = extract.createSpan();
        setIcon(extractIcon, "sprout");
        extract.createSpan({ text: insight ? "\u91CD\u65B0\u63D0\u70BC\u672C\u7BC7\u8BBA\u6587" : "\u751F\u6210\u5341\u95EE\u63D0\u70BC" });
        extract.addEventListener("click", () => this.generatePaperInsight(item, extract, true));
        const resources = reader.createEl("section", { cls: "ros-simple-card ros-resource-panel" });
        const sectionHead = resources.createDiv("ros-section-heading");
        sectionHead.createEl("h2", { text: "\u8BBA\u6587\u8D44\u6599\u5939" });
        sectionHead.createSpan({ text: "PDF\u3001\u7B14\u8BB0\u3001\u5B66\u4E60\u8BB0\u5F55\u4E0E\u6F14\u793A\u6750\u6599" });
        this.renderResourceButton(resources, item, "pdf", "file-scan", "\u539F\u6587 PDF", "\u9605\u8BFB\u3001\u9AD8\u4EAE\u4E0E\u52FE\u753B", item.pdf);
        this.renderReadingNotes(resources, item);
        this.renderResourceButton(resources, item, "slides", "presentation", "PPT / \u6F14\u793A", "\u6C47\u62A5\u6216\u8BFE\u7A0B\u6750\u6599", item.slides);
        const progress = reader.createEl("section", { cls: "ros-simple-card ros-reading-control" });
        const progressHead = progress.createDiv("ros-section-heading");
        progressHead.createEl("h2", { text: "\u9605\u8BFB\u8FDB\u5EA6" });
        progressHead.createSpan({ text: `${item.progress}%` });
        const slider = progress.createEl("input", { attr: { type: "range", min: "0", max: "100", value: String(item.progress), "aria-label": "\u9605\u8BFB\u8FDB\u5EA6" } });
        slider.addEventListener("change", async (e) => {
          await this.plugin.store.updateProgress(item, e.target.value);
          this.render();
        });
        const actions = progress.createDiv("ros-reader-statuses");
        [["inbox", "\u6536\u4EF6\u7BB1"], ["to-read", "\u5F85\u8BFB"], ["reading", "\u9605\u8BFB\u4E2D"], ["read", "\u5DF2\u5B8C\u6210"]].forEach(([status, label]) => {
          const button = actions.createEl("button", { text: label, cls: ["read", "annotated"].includes(item.status) && status === "read" || item.status === status ? "is-active" : "" });
          button.addEventListener("click", async () => {
            await this.plugin.store.updateStatus(item, status);
            this.render();
            if (status === "read" && this.plugin.ai.settings.autoInsightEnabled && this.plugin.ai.isConfigured()) {
              const current = this.plugin.store.get(item.path) || item;
              this.plugin.ai.ensurePaperInsight(current, true).then(() => this.render()).catch((error) => new Notice2(`\u5B8C\u6210\u9605\u8BFB\u540E\u7684\u63D0\u70BC\u66F4\u65B0\u5931\u8D25\uFF1A${error.message}`, 8e3));
            }
          });
        });
        const related = this.researchProgress().filter((progressItem) => progressItem.papers.some((reference) => {
          const path = this.cleanLink(reference);
          return path === item.path || path === item.file.basename;
        }));
        if (related.length) {
          const contribution = reader.createEl("section", { cls: "ros-simple-card ros-paper-progress" });
          const contributionHead = contribution.createDiv("ros-section-heading");
          contributionHead.createEl("h2", { text: "\u4FC3\u6210\u7684\u7814\u7A76\u8FDB\u5C55" });
          contributionHead.createSpan({ text: `${related.length} \u6761` });
          related.forEach((progressItem) => {
            const row = contribution.createEl("button", { cls: "ros-paper-progress-row" });
            row.createSpan({ text: PROGRESS_TYPES[progressItem.progressType] || "\u8FDB\u5C55", cls: `ros-progress-type is-${progressItem.progressType || "finding"}` });
            row.createEl("strong", { text: progressItem.title });
            row.createSpan({ text: MATURITY[progressItem.maturity] || "\u79CD\u5B50" });
            row.addEventListener("click", () => this.app.workspace.getLeaf("tab").openFile(progressItem.file));
          });
        }
        this.renderPaperInsight(reader, item, insight);
        this.renderPaperAI(reader, item);
      }
      renderPaperInsight(reader, paper, insight) {
        const panel = reader.createEl("section", { cls: "ros-simple-card ros-paper-insight" });
        const head = panel.createDiv("ros-section-heading");
        head.createEl("h2", { text: "AI \u5341\u95EE\u63D0\u70BC" });
        head.createSpan({ text: insight ? `${insight.extractionLevel === "notes" ? "\u7B14\u8BB0\u589E\u5F3A" : insight.extractionLevel === "abstract" ? "\u6458\u8981\u7EA7" : "\u5143\u6570\u636E\u7EA7"} \xB7 ${insight.generatedAt ? new Date(insight.generatedAt).toLocaleDateString() : "\u5DF2\u751F\u6210"}` : "\u5C1A\u672A\u751F\u6210" });
        if (!insight) {
          const empty = panel.createDiv("ros-insight-empty");
          empty.createEl("p", { text: this.plugin.ai.isConfigured() ? "\u7CFB\u7EDF\u4F1A\u4F9D\u636E\u8BBA\u6587\u6750\u6599\u56DE\u7B54\u5341\u4E2A\u7814\u7A76\u95EE\u9898\uFF0C\u5E76\u751F\u6210\u53EF\u4FDD\u7559\u7684\u5019\u9009\u8FDB\u5C55\u3002" : "\u914D\u7F6E DeepSeek API Key \u540E\uFF0C\u53EF\u4EE5\u81EA\u52A8\u751F\u6210\u6BCF\u7BC7\u8BBA\u6587\u7684\u5341\u95EE\u63D0\u70BC\u3002" });
          const button = empty.createEl("button", { text: "\u751F\u6210\u5341\u95EE\u63D0\u70BC", cls: "ros-primary-btn" });
          button.disabled = !this.plugin.ai.isConfigured();
          button.addEventListener("click", () => this.generatePaperInsight(paper, button, true));
          return;
        }
        const questions = [
          "\u8BBA\u6587\u8BD5\u56FE\u89E3\u51B3\u4EC0\u4E48\u95EE\u9898\uFF1F",
          "\u8FD9\u662F\u5426\u662F\u4E00\u4E2A\u65B0\u7684\u95EE\u9898\uFF1F",
          "\u8FD9\u7BC7\u6587\u7AE0\u8981\u9A8C\u8BC1\u4E00\u4E2A\u4EC0\u4E48\u79D1\u5B66\u5047\u8BBE\uFF1F",
          "\u6709\u54EA\u4E9B\u76F8\u5173\u7814\u7A76\uFF1F\u5982\u4F55\u5F52\u7C7B\uFF1F\u8C01\u662F\u8FD9\u4E00\u9886\u57DF\u5185\u503C\u5F97\u5173\u6CE8\u7684\u7814\u7A76\u5458\uFF1F",
          "\u8BBA\u6587\u4E2D\u63D0\u5230\u7684\u89E3\u51B3\u65B9\u6848\u4E4B\u5173\u952E\u662F\u4EC0\u4E48\uFF1F",
          "\u8BBA\u6587\u4E2D\u7684\u5B9E\u9A8C\u662F\u5982\u4F55\u8BBE\u8BA1\u7684\uFF1F",
          "\u7528\u4E8E\u5B9A\u91CF\u8BC4\u4F30\u7684\u6570\u636E\u96C6\u662F\u4EC0\u4E48\uFF1F\u4EE3\u7801\u6709\u6CA1\u6709\u5F00\u6E90\uFF1F",
          "\u8BBA\u6587\u4E2D\u7684\u5B9E\u9A8C\u53CA\u7ED3\u679C\u6709\u6CA1\u6709\u5F88\u597D\u5730\u652F\u6301\u9700\u8981\u9A8C\u8BC1\u7684\u79D1\u5B66\u5047\u8BBE\uFF1F",
          "\u8FD9\u7BC7\u8BBA\u6587\u5230\u5E95\u6709\u4EC0\u4E48\u8D21\u732E\uFF1F",
          "\u4E0B\u4E00\u6B65\u5462\uFF1F\u6709\u4EC0\u4E48\u5DE5\u4F5C\u53EF\u4EE5\u7EE7\u7EED\u6DF1\u5165\uFF1F"
        ];
        const list = panel.createDiv("ros-insight-questions");
        questions.forEach((question, index) => {
          const detail = list.createEl("details", { cls: "ros-insight-question" });
          if (index === 0) detail.open = true;
          const summary = detail.createEl("summary");
          summary.createSpan({ text: `Q${index + 1}`, cls: "ros-insight-number" });
          summary.createSpan({ text: question });
          detail.createEl("p", { text: insight.insightAnswers[`q${index + 1}`] || "\u6750\u6599\u4E2D\u672A\u8BF4\u660E\u3002" });
        });
        const pending = insight.insightCandidates.filter((candidate) => candidate.status === "pending");
        const candidateSection = panel.createDiv("ros-insight-candidates");
        const candidateHead = candidateSection.createDiv("ros-section-heading");
        candidateHead.createEl("h3", { text: "\u5019\u9009\u7814\u7A76\u8FDB\u5C55" });
        candidateHead.createSpan({ text: pending.length ? `${pending.length} \u6761\u5F85\u786E\u8BA4` : "\u5DF2\u5904\u7406" });
        if (!pending.length) candidateSection.createEl("p", { text: "\u5F53\u524D\u6CA1\u6709\u5F85\u786E\u8BA4\u7684\u5019\u9009\u8FDB\u5C55\u3002", cls: "ros-simple-empty" });
        pending.forEach((candidate) => {
          const row = candidateSection.createDiv("ros-insight-candidate");
          const copy = row.createDiv("ros-insight-candidate-copy");
          copy.createSpan({ text: PROGRESS_TYPES[candidate.type] || "\u7814\u7A76\u8FDB\u5C55", cls: `ros-progress-type is-${candidate.type}` });
          copy.createEl("h3", { text: candidate.title });
          copy.createEl("p", { text: candidate.summary });
          if (candidate.nextAction) copy.createEl("small", { text: `\u4E0B\u4E00\u6B65\uFF1A${candidate.nextAction}` });
          const actions = row.createDiv("ros-insight-candidate-actions");
          const ignore = actions.createEl("button", { text: "\u5FFD\u7565" });
          ignore.addEventListener("click", async () => {
            await this.plugin.store.updateInsightCandidate(insight, candidate.id, "dismissed");
            this.render();
          });
          const keep = actions.createEl("button", { text: "\u4FDD\u7559\u4E3A\u7814\u7A76\u8FDB\u5C55", cls: "ros-primary-btn" });
          keep.addEventListener("click", () => this.promoteInsightCandidate(paper, insight, candidate, keep));
        });
        const foot = panel.createDiv("ros-insight-footer");
        const open = foot.createEl("button", { text: "\u6253\u5F00\u5B8C\u6574\u63D0\u70BC\u7B14\u8BB0", cls: "ros-secondary-btn" });
        open.addEventListener("click", () => this.app.workspace.getLeaf("tab").openFile(insight.file));
      }
      async generatePaperInsight(paper, button, force = false) {
        if (this.aiBusy) return;
        this.aiBusy = true;
        button.disabled = true;
        const original = button.textContent;
        button.setText("\u6B63\u5728\u56DE\u7B54\u5341\u4E2A\u95EE\u9898\u2026");
        try {
          await this.plugin.ai.ensurePaperInsight(paper, force);
          this.aiBusy = false;
          await this.plugin.store.load();
          this.render();
          new Notice2("\u8BBA\u6587\u5341\u95EE\u63D0\u70BC\u5DF2\u66F4\u65B0");
        } catch (error) {
          this.aiBusy = false;
          button.disabled = false;
          button.setText(original);
          new Notice2(`\u8BBA\u6587\u63D0\u70BC\u5931\u8D25\uFF1A${error.message}`, 8e3);
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
          new Notice2("\u5DF2\u4FDD\u7559\u4E3A\u7814\u7A76\u8FDB\u5C55");
        } catch (error) {
          button.disabled = false;
          new Notice2(`\u4FDD\u5B58\u7814\u7A76\u8FDB\u5C55\u5931\u8D25\uFF1A${error.message}`, 8e3);
        }
      }
      renderPaperAI(reader, item) {
        const panel = reader.createEl("section", { cls: "ros-simple-card ros-paper-ai" });
        const head = panel.createDiv("ros-section-heading");
        head.createEl("h2", { text: "DeepSeek \u8BBA\u6587\u52A9\u624B" });
        head.createSpan({ text: this.plugin.ai.settings.deepseekModel });
        const guide = panel.createEl("button", { text: "\u91CD\u65B0\u751F\u6210 AI \u5BFC\u8BFB", cls: "ros-secondary-btn" });
        guide.disabled = this.aiBusy;
        guide.addEventListener("click", async () => {
          this.aiBusy = true;
          guide.disabled = true;
          guide.setText("\u6B63\u5728\u5206\u6790\u2026");
          try {
            await this.plugin.ai.generateGuide(item.file);
            this.aiBusy = false;
            this.render();
            new Notice2("AI \u5BFC\u8BFB\u5DF2\u66F4\u65B0\u5230 Markdown \u7B14\u8BB0");
          } catch (error) {
            this.aiBusy = false;
            guide.disabled = false;
            guide.setText("\u91CD\u65B0\u751F\u6210 AI \u5BFC\u8BFB");
            new Notice2(error.message, 8e3);
          }
        });
        const history = this.plugin.ai.settings.chats[item.path] || [];
        const messages = panel.createDiv("ros-ai-chat");
        history.slice(-6).forEach((message) => {
          const bubble = messages.createDiv(`ros-ai-message is-${message.role}`);
          bubble.createDiv({ text: message.role === "user" ? "\u4F60" : "AI", cls: "ros-ai-role" });
          bubble.createDiv({ text: message.content, cls: "ros-ai-content" });
        });
        if (!history.length) messages.createDiv({ text: "\u53EF\u4EE5\u95EE\uFF1A\u8FD9\u7BC7\u8BBA\u6587\u89E3\u51B3\u4E86\u4EC0\u4E48\uFF1F\u65B9\u6CD5\u4E3A\u4EC0\u4E48\u6709\u6548\uFF1F\u7ED9\u4E00\u4E2A\u5177\u4F53\u4F8B\u5B50\u3002", cls: "ros-simple-empty" });
        const compose = panel.createDiv("ros-ai-compose");
        const input = compose.createEl("textarea", { attr: { placeholder: "\u9488\u5BF9\u8FD9\u7BC7\u8BBA\u6587\u63D0\u95EE\u2026", rows: "3", "aria-label": "\u8BBA\u6587\u95EE\u9898" } });
        const send = compose.createEl("button", { text: "\u53D1\u9001", cls: "ros-primary-btn" });
        send.addEventListener("click", async () => {
          const question = input.value.trim();
          if (!question || this.aiBusy) return;
          this.aiBusy = true;
          send.disabled = true;
          send.setText("\u601D\u8003\u4E2D\u2026");
          try {
            await this.plugin.ai.askPaper(item, question);
            this.aiBusy = false;
            this.render();
          } catch (error) {
            this.aiBusy = false;
            send.disabled = false;
            send.setText("\u53D1\u9001");
            new Notice2(error.message, 8e3);
          }
        });
        const lastAssistant = [...history].reverse().find((x) => x.role === "assistant");
        const lastQuestion = [...history].reverse().find((x) => x.role === "user");
        if (lastAssistant && lastQuestion) {
          const save = panel.createEl("button", { text: "\u5C06\u6700\u8FD1\u56DE\u7B54\u4FDD\u5B58\u5230 Markdown", cls: "ros-ai-save" });
          save.addEventListener("click", async () => {
            await this.plugin.ai.saveChatToNote(item, lastQuestion.content, lastAssistant.content);
            new Notice2("\u5DF2\u4FDD\u5B58\u5230\u6587\u732E\u7B14\u8BB0");
          });
        }
      }
      renderResourceButton(parent, item, kind, icon, title, help, path) {
        const button = parent.createEl("button", { cls: `ros-resource-button ${path ? "is-available" : "is-missing"}` });
        const iconEl = button.createSpan("ros-resource-button-icon");
        setIcon(iconEl, icon);
        const copy = button.createSpan("ros-resource-button-copy");
        copy.createSpan({ text: title });
        copy.createEl("small", { text: path ? help : "\u5C1A\u672A\u5173\u8054\u6587\u4EF6" });
        const action = button.createSpan({ text: path ? kind === "pdf" ? "\u5206\u680F\u9605\u8BFB" : "\u6253\u5F00" : "\u5F85\u5173\u8054", cls: "ros-resource-action" });
        button.addEventListener("click", async () => {
          if (!path) return new Notice2(`\u8BF7\u5728\u6587\u732E\u7B14\u8BB0 Properties \u4E2D\u586B\u5199 ${kind === "pdf" ? "pdf" : "slides"} \u6587\u4EF6\u8DEF\u5F84`);
          if (kind === "pdf") return this.openReadingPair(item, path);
          await this.openResource(path, item.file);
        });
      }
      renderReadingNotes(parent, item) {
        const group = parent.createEl("section", { cls: "ros-reading-notes-group" });
        const head = group.createDiv("ros-reading-notes-head");
        const title = head.createDiv();
        const icon = title.createSpan();
        setIcon(icon, "folder-open");
        const copy = title.createDiv();
        copy.createEl("strong", { text: "Markdown \u5B66\u4E60\u8D44\u6599\u5939" });
        copy.createSpan({ text: `${item.readingNotes.length} \u4EFD\u8BB0\u5F55 \xB7 \u53EF\u7EE7\u7EED\u62D6\u5165\u591A\u4E2A MD` });
        const create = head.createEl("button", { text: "+ \u65B0\u5EFA\u5B66\u4E60\u8FC7\u7A0B" });
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
            new Notice2(`\u521B\u5EFA\u5931\u8D25\uFF1A${error.message}`, 7e3);
          }
        });
        const list = group.createDiv("ros-reading-notes-list");
        if (!item.readingNotes.length) {
          const empty = list.createDiv("ros-reading-notes-empty");
          empty.createSpan({ text: "\u8FD8\u6CA1\u6709\u72EC\u7ACB Markdown \u8BB0\u5F55" });
          const main = empty.createEl("button", { text: "\u521B\u5EFA\u4E3B\u9605\u8BFB\u7B14\u8BB0" });
          main.addEventListener("click", async () => {
            main.disabled = true;
            try {
              const file = await this.plugin.store.createLearningNote(item, "main");
              await this.plugin.store.load();
              this.render();
              await this.app.workspace.getLeaf("tab").openFile(file);
            } catch (error) {
              main.disabled = false;
              new Notice2(`\u521B\u5EFA\u5931\u8D25\uFF1A${error.message}`, 7e3);
            }
          });
          return;
        }
        item.readingNotes.forEach((value, index) => {
          const file = this.plugin.store.resolveLink(value, item.path);
          const row = list.createEl("button", { cls: "ros-reading-note-row" });
          const isMain = value === item.readingNote;
          const rowIcon = row.createSpan();
          setIcon(rowIcon, isMain ? "book-open" : "message-square-text");
          const rowCopy = row.createDiv();
          rowCopy.createEl("strong", { text: file?.basename || this.cleanLink(value).split("/").pop() || "Markdown \u8BB0\u5F55" });
          rowCopy.createSpan({ text: isMain ? "\u4E3B\u9605\u8BFB\u7B14\u8BB0" : "\u5B66\u4E60\u8FC7\u7A0B / \u8865\u5145\u8BB0\u5F55" });
          const arrow = row.createSpan();
          setIcon(arrow, "arrow-up-right");
          row.disabled = !file;
          row.addEventListener("click", () => file && this.app.workspace.getLeaf("tab").openFile(file));
        });
      }
      async openReadingPair(item, pdfPath) {
        const clean = String(pdfPath).replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
        const pdfFile = this.app.metadataCache.getFirstLinkpathDest(clean, item.file.path) || this.app.vault.getAbstractFileByPath(clean);
        if (!(pdfFile instanceof TFile)) return new Notice2(`\u627E\u4E0D\u5230 PDF\uFF1A${clean}`);
        const pdfLeaf = this.app.workspace.getLeaf("tab");
        await pdfLeaf.openFile(pdfFile);
        const noteLeaf = typeof this.app.workspace.createLeafBySplit === "function" ? this.app.workspace.createLeafBySplit(pdfLeaf, "vertical", false) : this.app.workspace.getLeaf("split", "vertical");
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
        new Notice2(`\u627E\u4E0D\u5230\u6587\u4EF6\uFF1A${clean}`);
      }
      renderEmpty(parent, title, body, action) {
        const empty = parent.createDiv("ros-empty-state ros-simple-card");
        const icon = empty.createDiv("ros-empty-icon");
        setIcon(icon, "book-open");
        empty.createEl("h2", { text: title });
        empty.createEl("p", { text: body });
        if (action) {
          const button = empty.createEl("button", { text: "\u6DFB\u52A0\u6587\u732E", cls: "ros-primary-btn" });
          button.addEventListener("click", () => new CaptureModal(this.app, this.plugin, () => this.render(), "literature").open());
        }
      }
    };
    module2.exports = { ResearchView: ResearchView2, VIEW_TYPE: VIEW_TYPE2 };
  }
});

// .obsidian/plugins/research-os/theme-engine.js
var require_theme_engine = __commonJS({
  ".obsidian/plugins/research-os/theme-engine.js"(exports2, module2) {
    var DEFAULT_CONTROLS = Object.freeze({
      overlayStrength: 0.32,
      glassOpacity: 0.48,
      glassBlur: 22,
      contrastBoost: 0.12,
      accentStrength: 0.55,
      locked: false
    });
    var clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value)));
    var channel = (value) => {
      value /= 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    var luminance = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
    var contrastRatio = (a, b) => {
      const l1 = luminance(a), l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    var hex = (rgb) => `#${rgb.map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
    var rgba = (rgb, alpha) => `rgba(${rgb.map(Math.round).join(", ")}, ${clamp(alpha).toFixed(3)})`;
    var mix = (a, b, amount) => a.map((value, index) => value + (b[index] - value) * clamp(amount));
    function rgbToHsl([r, g, b]) {
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
      let h = 0;
      if (delta) {
        if (max === r) h = (g - b) / delta % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h = (h * 60 + 360) % 360;
      }
      const l = (max + min) / 2;
      const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
      return [h, s, l];
    }
    function hslToRgb([h, s, l]) {
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs(h / 60 % 2 - 1));
      const m = l - c / 2;
      let base = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
      return base.map((value) => (value + m) * 255);
    }
    function clusterColors(samples, count = 6) {
      if (!samples.length) return [[103, 127, 72]];
      const sorted = [...samples].sort((a, b) => luminance(a) - luminance(b));
      let centers = Array.from({ length: Math.min(count, sorted.length) }, (_, index) => sorted[Math.floor(index * (sorted.length - 1) / Math.max(1, count - 1))].slice());
      for (let iteration = 0; iteration < 10; iteration++) {
        const groups = centers.map(() => []);
        samples.forEach((sample) => {
          let best = 0, distance = Infinity;
          centers.forEach((center, index) => {
            const next = Math.pow(sample[0] - center[0], 2) + Math.pow(sample[1] - center[1], 2) + Math.pow(sample[2] - center[2], 2);
            if (next < distance) {
              distance = next;
              best = index;
            }
          });
          groups[best].push(sample);
        });
        centers = centers.map((center, index) => groups[index].length ? [0, 1, 2].map((channelIndex) => groups[index].reduce((sum, value) => sum + value[channelIndex], 0) / groups[index].length) : center);
      }
      return centers.map((center) => ({ rgb: center, population: samples.filter((sample) => {
        let best = 0, distance = Infinity;
        centers.forEach((candidate, index) => {
          const next = Math.pow(sample[0] - candidate[0], 2) + Math.pow(sample[1] - candidate[1], 2) + Math.pow(sample[2] - candidate[2], 2);
          if (next < distance) {
            distance = next;
            best = index;
          }
        });
        return centers[best] === center;
      }).length })).sort((a, b) => b.population - a.population);
    }
    function regionMetrics(samples) {
      if (!samples.length) return { luminance: 0.35, spread: 0.2, complexity: 0.2 };
      const values = samples.map(luminance).sort((a, b) => a - b);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const spread = values[Math.floor(values.length * 0.9)] - values[Math.floor(values.length * 0.1)];
      const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
      return { luminance: mean, spread, complexity: Math.sqrt(variance) };
    }
    function analyzePixels(data, width, height) {
      const regions = { global: [], sidebar: [], topbar: [], content: [] };
      const step = Math.max(1, Math.floor(Math.sqrt(width * height / 9e3)));
      for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
        const index = (y * width + x) * 4;
        if (data[index + 3] < 200) continue;
        const rgb = [data[index], data[index + 1], data[index + 2]];
        const light = luminance(rgb);
        if (light < 8e-3 || light > 0.985) continue;
        regions.global.push(rgb);
        if (x / width < 0.22) regions.sidebar.push(rgb);
        if (y / height < 0.18) regions.topbar.push(rgb);
        if (x / width >= 0.18 && y / height >= 0.12) regions.content.push(rgb);
      }
      const clusters = clusterColors(regions.global);
      return {
        clusters,
        metrics: Object.fromEntries(Object.entries(regions).map(([key, value]) => [key, regionMetrics(value)]))
      };
    }
    function ensureText(surface, preferred, minimum) {
      if (contrastRatio(surface, preferred) >= minimum) return preferred;
      const white = [248, 252, 249], black = [13, 18, 15];
      return contrastRatio(surface, white) >= contrastRatio(surface, black) ? white : black;
    }
    function ensureContrast(surface, candidate, target, anchor) {
      let result = candidate;
      for (let step = 0; step < 24 && contrastRatio(surface, result) < target; step++) {
        result = mix(result, anchor, 0.12);
      }
      return contrastRatio(surface, result) >= target ? result : anchor;
    }
    function generateTheme(analysis, inputControls = {}) {
      const controls = { ...DEFAULT_CONTROLS, ...inputControls };
      const clusters = analysis?.clusters?.length ? analysis.clusters : [{ rgb: [103, 127, 72], population: 1 }];
      const dominant = clusters[0].rgb;
      const accentCandidate = [...clusters].sort((a, b) => {
        const ah = rgbToHsl(a.rgb), bh = rgbToHsl(b.rgb);
        return bh[1] * 0.75 + bh[2] * 0.25 - (ah[1] * 0.75 + ah[2] * 0.25);
      })[0].rgb;
      const [accentHue, accentSat, accentLight] = rgbToHsl(accentCandidate);
      const accent = hslToRgb([accentHue, clamp(accentSat * (0.75 + controls.accentStrength * 0.55), 0.28, 0.72), clamp(accentLight, 0.44, 0.68)]);
      const onAccent = ensureText(accent, [250, 253, 251], 4.5);
      const base = mix(dominant, [10, 18, 13], 0.72);
      const surface = mix(base, [255, 255, 255], 0.06 + controls.contrastBoost * 0.08);
      const text = ensureText(surface, [246, 252, 248], 4.5);
      const lightText = luminance(text) > 0.5;
      const secondary = ensureContrast(surface, mix(text, surface, 0.12), 4.5, text);
      const muted = ensureContrast(surface, mix(text, surface, 0.18), 4.5, text);
      const metric = (key) => analysis?.metrics?.[key] || analysis?.metrics?.global || { luminance: 0.35, spread: 0.2, complexity: 0.2 };
      const regionAlpha = (key) => clamp(controls.glassOpacity + metric(key).luminance * 0.16 + metric(key).complexity * 0.28, 0.3, 0.78);
      const overlay = clamp(controls.overlayStrength + metric("global").spread * 0.18, 0.08, 0.72);
      return {
        controls,
        palette: { dominant: hex(dominant), accent: hex(accent), text: hex(text), surface: hex(surface) },
        tokens: {
          "--skin-sidebar": rgba(base, regionAlpha("sidebar")),
          "--skin-topbar": rgba(base, regionAlpha("topbar")),
          "--skin-surface": rgba(surface, regionAlpha("content")),
          "--skin-surface-hover": rgba(mix(surface, accent, 0.12), clamp(regionAlpha("content") + 0.08)),
          "--skin-border": rgba(mix(text, accent, 0.16), 0.18 + controls.contrastBoost * 0.24),
          "--skin-border-strong": rgba(mix(text, accent, 0.12), 0.32 + controls.contrastBoost * 0.28),
          "--skin-text": hex(text),
          "--skin-text-secondary": hex(secondary),
          "--skin-text-muted": hex(muted),
          "--skin-accent": hex(accent),
          "--skin-on-accent": hex(onAccent),
          "--skin-accent-soft": rgba(accent, 0.14 + controls.accentStrength * 0.18),
          "--skin-graph-node": hex(mix(accent, text, 0.48)),
          "--skin-graph-glow": rgba(accent, 0.34 + controls.accentStrength * 0.34),
          "--skin-graph-line": rgba(mix(accent, text, 0.35), 0.22),
          "--skin-overlay": rgba(base, overlay),
          "--skin-blur": `${Math.round(clamp(controls.glassBlur, 0, 40))}px`
        },
        contrast: { body: contrastRatio(surface, text), secondary: contrastRatio(surface, secondary) }
      };
    }
    module2.exports = { DEFAULT_CONTROLS, analyzePixels, generateTheme, contrastRatio, luminance };
  }
});

// .obsidian/plugins/research-os/theme-service.js
var require_theme_service = __commonJS({
  ".obsidian/plugins/research-os/theme-service.js"(exports2, module2) {
    var { TFile } = require("obsidian");
    var { DEFAULT_CONTROLS, analyzePixels, generateTheme } = require_theme_engine();
    var FOREST_THEME_ID = "forest-original";
    var CUSTOM_THEME_ID = "custom-dynamic";
    var FOREST_ORIGINAL_THEME = Object.freeze({
      id: FOREST_THEME_ID,
      name: "\u68EE\u6797\u539F\u7248",
      backgroundPath: "forest.jpg",
      protected: true
    });
    var ThemeService2 = class {
      constructor(plugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.previewTheme = null;
      }
      async initialize() {
        const settings = this.plugin.ai.settings;
        let changed = false;
        if (Object.prototype.hasOwnProperty.call(settings, "backgroundImagePath")) {
          delete settings.backgroundImagePath;
          changed = true;
        }
        if (![FOREST_THEME_ID, CUSTOM_THEME_ID].includes(settings.activeThemeId)) {
          settings.activeThemeId = FOREST_THEME_ID;
          changed = true;
        }
        // A valid saved custom theme is the user's persistent choice. Do not
        // gate restoration on vault file identity checks: Obsidian can expose
        // a newly loaded file through a different object during startup.
        if (this.isValidCustom(settings.customTheme)) {
          settings.activeThemeId = CUSTOM_THEME_ID;
          changed = true;
        }
        if (this.isValidCustom(settings.customTheme) && settings.customTheme.analysis && !settings.customTheme.tokens["--skin-on-accent"]) {
          const generated = generateTheme(settings.customTheme.analysis, settings.customTheme.controls);
          settings.customTheme = { ...settings.customTheme, id: CUSTOM_THEME_ID, ...generated };
          changed = true;
        } else if (this.isValidCustom(settings.customTheme) && settings.customTheme.id !== CUSTOM_THEME_ID) {
          settings.customTheme = { ...settings.customTheme, id: CUSTOM_THEME_ID };
          changed = true;
        }
        if (changed) await this.plugin.ai.save();
      }
      isValidCustom(theme) {
        return Boolean(theme && theme.backgroundPath && theme.tokens && theme.controls);
      }
      get activeThemeId() {
        return this.plugin.ai.settings.activeThemeId || FOREST_THEME_ID;
      }
      get customTheme() {
        return this.plugin.ai.settings.customTheme || null;
      }
      get editingTheme() {
        return this.previewTheme || this.customTheme;
      }
      async ensureFolder(path) {
        const parts = path.split("/");
        let current = "";
        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
          if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
        }
      }
      async importBackground(file) {
        const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const folder = "09 Attachments/Research OS Themes";
        await this.ensureFolder(folder);
        const path = `${folder}/custom-background.${extension}`;
        const existing = this.app.vault.getAbstractFileByPath(path);
        const bytes = await file.arrayBuffer();
        if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, bytes);
        else await this.app.vault.createBinary(path, bytes);
        const current = this.customTheme;
        if (current?.controls?.locked) {
          this.previewTheme = { ...current, backgroundPath: path, imageHash: `${bytes.byteLength}:${Date.now()}` };
        } else {
          this.previewTheme = await this.analyzePath(path, { ...current?.controls || DEFAULT_CONTROLS, locked: false });
        }
        this.plugin.refreshViews();
        return this.previewTheme;
      }
      async analyzePath(path, controls = this.editingTheme?.controls || DEFAULT_CONTROLS) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error("\u627E\u4E0D\u5230\u81EA\u5B9A\u4E49\u80CC\u666F\u56FE\u7247");
        const bytes = await this.app.vault.readBinary(file);
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 100;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("\u5F53\u524D\u73AF\u5883\u65E0\u6CD5\u5206\u6790\u56FE\u7247\u989C\u8272");
        const blob = new Blob([bytes], { type: this.mimeFor(file.extension) });
        if (typeof createImageBitmap === "function") {
          const bitmap = await createImageBitmap(blob);
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          bitmap.close?.();
        } else {
          const url = URL.createObjectURL(blob);
          try {
            const image = await new Promise((resolve, reject) => {
              const element = new Image();
              element.onload = () => resolve(element);
              element.onerror = () => reject(new Error("\u56FE\u7247\u89E3\u7801\u5931\u8D25"));
              element.src = url;
            });
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const analysis = analyzePixels(imageData.data, canvas.width, canvas.height);
        const generated = generateTheme(analysis, controls);
        return {
          id: CUSTOM_THEME_ID,
          name: "\u81EA\u5B9A\u4E49\u52A8\u6001\u76AE\u80A4",
          backgroundPath: path,
          imageHash: `${file.stat.size}:${file.stat.mtime}`,
          analysis,
          ...generated
        };
      }
      mimeFor(extension) {
        return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[String(extension).toLowerCase()] || "image/jpeg";
      }
      async reanalyze() {
        const source = this.editingTheme || this.customTheme;
        if (!source?.backgroundPath) throw new Error("\u8BF7\u5148\u9009\u62E9\u81EA\u5B9A\u4E49\u80CC\u666F\u56FE\u7247");
        this.previewTheme = await this.analyzePath(source.backgroundPath, { ...source.controls, locked: false });
        this.plugin.refreshViews();
        return this.previewTheme;
      }
      previewControls(patch) {
        const source = this.previewTheme || this.customTheme;
        if (!source) return null;
        const controls = { ...DEFAULT_CONTROLS, ...source.controls, ...patch };
        const generated = generateTheme(source.analysis, controls);
        this.previewTheme = { ...source, ...generated, controls };
        this.plugin.refreshViews();
        return this.previewTheme;
      }
      async applyCustom() {
        if (!this.isValidCustom(this.previewTheme || this.customTheme)) throw new Error("\u8FD8\u6CA1\u6709\u53EF\u4EE5\u5E94\u7528\u7684\u81EA\u5B9A\u4E49\u76AE\u80A4");
        this.plugin.ai.settings.customTheme = { ...(this.previewTheme || this.customTheme), id: CUSTOM_THEME_ID };
        this.plugin.ai.settings.activeThemeId = CUSTOM_THEME_ID;
        this.previewTheme = null;
        await this.plugin.ai.save();
        this.plugin.refreshViews();
      }
      cancelPreview() {
        this.previewTheme = null;
        this.plugin.refreshViews();
      }
      async useForest() {
        this.previewTheme = null;
        this.plugin.ai.settings.activeThemeId = FOREST_THEME_ID;
        await this.plugin.ai.save();
        this.plugin.refreshViews();
      }
      async deleteCustom() {
        this.previewTheme = null;
        this.plugin.ai.settings.customTheme = null;
        this.plugin.ai.settings.activeThemeId = FOREST_THEME_ID;
        await this.plugin.ai.save();
        this.plugin.refreshViews();
      }
      resolveTheme() {
        if (this.previewTheme) return this.previewTheme;
        if (this.activeThemeId === CUSTOM_THEME_ID && this.isValidCustom(this.customTheme)) return this.customTheme;
        return FOREST_ORIGINAL_THEME;
      }
      applyTo(root) {
        const theme = this.resolveTheme();
        root.removeClass("ros-theme-custom");
        root.removeClass("ros-skin-forest");
        root.removeClass("ros-skin-crt");
        this.clearTokens(root);
        const background = this.app.vault.getAbstractFileByPath(theme.backgroundPath) || this.app.vault.getAbstractFileByPath("forest.jpg");
        const backgroundUrl = background && typeof background.path === "string" ? this.app.vault.getResourcePath(background) : this.app.vault.adapter.getResourcePath(".obsidian/plugins/research-os/forest.jpg");
        root.style.setProperty("--ros-forest-image", `url("${backgroundUrl}")`);
        if (theme.id !== CUSTOM_THEME_ID) {
          root.addClass("ros-skin-forest");
          return;
        }
        root.addClass("ros-theme-custom");
        Object.entries(theme.tokens || {}).forEach(([name, value]) => root.style.setProperty(name, value));
        const aliases = {
          "--ros-bg": "transparent",
          "--ros-panel": theme.tokens["--skin-sidebar"],
          "--ros-panel-2": theme.tokens["--skin-surface"],
          "--ros-panel-3": theme.tokens["--skin-surface-hover"],
          "--ros-border": theme.tokens["--skin-border"],
          "--ros-border-strong": theme.tokens["--skin-border-strong"],
          "--ros-text": theme.tokens["--skin-text"],
          "--ros-text-2": theme.tokens["--skin-text-secondary"],
          "--ros-text-3": theme.tokens["--skin-text-muted"],
          "--ros-green": theme.tokens["--skin-accent"],
          "--ros-green-soft": theme.tokens["--skin-accent-soft"],
          "--ros-accent": theme.tokens["--skin-accent"],
          "--ros-accent-hover": theme.tokens["--skin-accent"]
        };
        Object.entries(aliases).forEach(([name, value]) => value && root.style.setProperty(name, value));
      }
      clearTokens(root) {
        ["--skin-sidebar", "--skin-topbar", "--skin-surface", "--skin-surface-hover", "--skin-border", "--skin-border-strong", "--skin-text", "--skin-text-secondary", "--skin-text-muted", "--skin-accent", "--skin-on-accent", "--skin-accent-soft", "--skin-graph-node", "--skin-graph-glow", "--skin-graph-line", "--skin-overlay", "--skin-blur", "--ros-bg", "--ros-panel", "--ros-panel-2", "--ros-panel-3", "--ros-border", "--ros-border-strong", "--ros-text", "--ros-text-2", "--ros-text-3", "--ros-green", "--ros-green-soft", "--ros-accent", "--ros-accent-hover"].forEach((name) => root.style.removeProperty(name));
      }
    };
    module2.exports = { ThemeService: ThemeService2, FOREST_ORIGINAL_THEME, FOREST_THEME_ID, CUSTOM_THEME_ID };
  }
});

// .obsidian/plugins/research-os/theme-settings.js
var require_theme_settings = __commonJS({
  ".obsidian/plugins/research-os/theme-settings.js"(exports2, module2) {
    var { Setting, Notice: Notice2 } = require("obsidian");
    var { DEFAULT_CONTROLS } = require_theme_engine();
    var { FOREST_THEME_ID, CUSTOM_THEME_ID } = require_theme_service();
    var CONTROL_DEFS = [
      ["overlayStrength", "\u80CC\u666F\u906E\u7F69\u5F3A\u5EA6", "\u964D\u4F4E\u590D\u6742\u80CC\u666F\u5BF9\u6587\u5B57\u7684\u5E72\u6270", 0.08, 0.72, 0.01, (value) => `${Math.round(value * 100)}%`],
      ["glassOpacity", "\u73BB\u7483\u900F\u660E\u5EA6", "\u63A7\u5236\u524D\u666F\u73BB\u7483\u7684\u5B9E\u5EA6", 0.3, 0.78, 0.01, (value) => `${Math.round(value * 100)}%`],
      ["glassBlur", "\u73BB\u7483\u6A21\u7CCA", "\u63A7\u5236\u80CC\u666F\u900F\u8FC7\u5361\u7247\u65F6\u7684\u6A21\u7CCA\u7A0B\u5EA6", 0, 40, 1, (value) => `${Math.round(value)}px`],
      ["contrastBoost", "\u6587\u5B57\u5BF9\u6BD4\u5EA6", "\u589E\u5F3A\u8FB9\u6846\u548C\u6587\u5B57\u7684\u6E05\u6670\u5EA6", 0, 0.3, 0.01, (value) => `${Math.round(value * 100)}%`],
      ["accentStrength", "\u5F3A\u8C03\u8272\u5F3A\u5EA6", "\u63A7\u5236\u6309\u94AE\u3001\u72B6\u6001\u548C\u56FE\u8C31\u5149\u6655", 0.15, 1, 0.01, (value) => `${Math.round(value * 100)}%`]
    ];
    function renderThemeSettings(containerEl, plugin, refresh) {
      const service = plugin.theme;
      containerEl.createEl("h2", { text: "\u754C\u9762\u76AE\u80A4" });
      containerEl.createEl("p", {
        cls: "ros-theme-help",
        text: "\u68EE\u6797\u539F\u7248\u662F\u5185\u7F6E\u4FDD\u62A4\u4E3B\u9898\uFF0C\u4E0D\u4F1A\u88AB\u80CC\u666F\u9009\u62E9\u3001\u81EA\u52A8\u53D6\u8272\u6216\u53C2\u6570\u8C03\u6574\u8986\u76D6\u3002\u81EA\u5B9A\u4E49\u76AE\u80A4\u59CB\u7EC8\u72EC\u7ACB\u4FDD\u5B58\u3002"
      });
      const forest = new Setting(containerEl).setName("\u68EE\u6797\u539F\u7248\uFF08\u5185\u7F6E\u4FDD\u62A4\uFF09").setDesc("\u56FA\u5B9A\u4F7F\u7528 forest.jpg \u4E0E\u5F53\u524D\u5B8C\u6574\u89C6\u89C9\u53C2\u6570\uFF1B\u4E0D\u53EF\u7F16\u8F91\u3001\u5220\u9664\u6216\u8986\u76D6\u3002");
      forest.addButton((button) => button.setButtonText(service.activeThemeId === FOREST_THEME_ID && !service.previewTheme ? "\u6B63\u5728\u4F7F\u7528" : "\u4F7F\u7528\u68EE\u6797\u539F\u7248").setDisabled(service.activeThemeId === FOREST_THEME_ID && !service.previewTheme).onClick(async () => {
        await service.useForest();
        refresh();
      }));
      const editing = service.editingTheme;
      const custom = new Setting(containerEl).setName("\u81EA\u5B9A\u4E49\u52A8\u6001\u76AE\u80A4").setDesc(editing ? `\u80CC\u666F\uFF1A${editing.backgroundPath}${service.previewTheme ? " \xB7 \u6B63\u5728\u9884\u89C8\uFF0C\u5C1A\u672A\u4FDD\u5B58" : ""}` : "\u5C1A\u672A\u521B\u5EFA\uFF1B\u9009\u62E9\u4E00\u5F20\u56FE\u7247\u540E\u81EA\u52A8\u751F\u6210\u9884\u89C8\u3002");
      custom.addButton((button) => attachBackgroundPicker(plugin, button.setButtonText("\u9009\u62E9\u80CC\u666F"), refresh));
      custom.addButton((button) => button.setButtonText("\u91CD\u65B0\u5206\u6790").setDisabled(!editing).onClick(async () => {
        button.setDisabled(true);
        try {
          await service.reanalyze();
          refresh();
          new Notice2("\u81EA\u5B9A\u4E49\u76AE\u80A4\u5DF2\u91CD\u65B0\u5206\u6790\u5E76\u8FDB\u5165\u9884\u89C8");
        } catch (error) {
          new Notice2(`\u56FE\u7247\u5206\u6790\u5931\u8D25\uFF1A${error.message}`, 7e3);
        } finally {
          button.setDisabled(false);
        }
      }));
      if (editing?.palette) {
        const palette = containerEl.createDiv("ros-theme-palette");
        [["\u4E3B\u8272", editing.palette.dominant], ["\u5F3A\u8C03", editing.palette.accent], ["\u6587\u5B57", editing.palette.text], ["\u8868\u9762", editing.palette.surface]].forEach(([label, color]) => {
          const item = palette.createDiv("ros-theme-swatch");
          item.createSpan({ attr: { style: `background:${color}` } });
          item.createEl("small", { text: `${label} ${color}` });
        });
      }
      const controls = { ...DEFAULT_CONTROLS, ...editing?.controls || {} };
      CONTROL_DEFS.forEach(([key, name, desc, min, max, step, format]) => {
        const setting = new Setting(containerEl).setName(name).setDesc(desc);
        setting.addSlider((slider) => {
          slider.setLimits(min, max, step).setValue(controls[key]).setDynamicTooltip();
          slider.sliderEl.disabled = !editing;
          slider.onChange((value) => {
            service.previewControls({ [key]: value });
            updateValue();
          });
          const valueEl = setting.controlEl.createSpan({ cls: "ros-theme-control-value" });
          const updateValue = () => valueEl.setText(format(Number(slider.getValue())));
          updateValue();
        });
      });
      new Setting(containerEl).setName("\u9501\u5B9A\u914D\u8272").setDesc("\u9501\u5B9A\u540E\u66F4\u6362\u80CC\u666F\u53EA\u66FF\u6362\u56FE\u7247\uFF0C\u4E0D\u91CD\u65B0\u8BA1\u7B97\u73B0\u6709\u989C\u8272\u3002").addToggle((toggle) => toggle.setValue(Boolean(controls.locked)).setDisabled(!editing).onChange((value) => service.previewControls({ locked: value })));
      const actions = containerEl.createDiv("ros-theme-actions");
      const apply = actions.createEl("button", { text: "\u5E94\u7528\u81EA\u5B9A\u4E49\u76AE\u80A4", cls: "mod-cta" });
      apply.disabled = !editing;
      apply.addEventListener("click", async () => {
        try {
          await service.applyCustom();
          refresh();
          new Notice2("\u81EA\u5B9A\u4E49\u52A8\u6001\u76AE\u80A4\u5DF2\u5E94\u7528");
        } catch (error) {
          new Notice2(error.message, 7e3);
        }
      });
      const cancel = actions.createEl("button", { text: "\u53D6\u6D88\u9884\u89C8" });
      cancel.disabled = !service.previewTheme;
      cancel.addEventListener("click", () => {
        service.cancelPreview();
        refresh();
      });
      const restore = actions.createEl("button", { text: "\u4E00\u952E\u6062\u590D\u68EE\u6797\u539F\u7248" });
      restore.addEventListener("click", async () => {
        await service.useForest();
        refresh();
      });
      const remove = actions.createEl("button", { text: "\u5220\u9664\u81EA\u5B9A\u4E49\u76AE\u80A4", cls: "mod-warning" });
      remove.disabled = !service.customTheme && !service.previewTheme;
      remove.addEventListener("click", async () => {
        await service.deleteCustom();
        refresh();
        new Notice2("\u81EA\u5B9A\u4E49\u76AE\u80A4\u914D\u7F6E\u5DF2\u5220\u9664\uFF0C\u68EE\u6797\u539F\u7248\u5DF2\u6062\u590D");
      });
    }
    function attachBackgroundPicker(plugin, button, refresh) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp,image/gif";
      input.tabIndex = -1;
      input.setAttribute("aria-label", "\u9009\u62E9\u81EA\u5B9A\u4E49\u76AE\u80A4\u80CC\u666F\u56FE\u7247");
      Object.assign(button.buttonEl.style, { position: "relative", overflow: "hidden" });
      Object.assign(input.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        opacity: "0",
        cursor: "pointer",
        zIndex: "2"
      });
      button.buttonEl.appendChild(input);
      input.addEventListener("click", (event) => event.stopPropagation());
      button.onClick(() => input.click());
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        button.setDisabled(true);
        input.disabled = true;
        try {
          await plugin.theme.importBackground(file);
          refresh();
          new Notice2("\u80CC\u666F\u5DF2\u5206\u6790\u3002\u5F53\u524D\u4EC5\u4E3A\u9884\u89C8\uFF0C\u70B9\u51FB\u201C\u5E94\u7528\u81EA\u5B9A\u4E49\u76AE\u80A4\u201D\u540E\u4FDD\u5B58\u3002");
        } catch (error) {
          plugin.theme.cancelPreview();
          new Notice2(`\u80CC\u666F\u56FE\u7247\u5904\u7406\u5931\u8D25\uFF1A${error.message}`, 7e3);
        } finally {
          button.setDisabled(false);
          input.disabled = false;
          input.value = "";
        }
      });
    }
    module2.exports = { renderThemeSettings };
  }
});

// .obsidian/plugins/research-os/ai-service.js
var require_ai_service = __commonJS({
  ".obsidian/plugins/research-os/ai-service.js"(exports2, module2) {
    var { PluginSettingTab, Setting, Notice: Notice2, requestUrl, TFile } = require("obsidian");
    var { renderThemeSettings } = require_theme_settings();
    var DEFAULT_AI_SETTINGS = {
      activeThemeId: "forest-original",
      customTheme: null,
      deepseekApiKey: "",
      deepseekBaseUrl: "https://api.deepseek.com",
      deepseekModel: "deepseek-v4-flash",
      apiKey: "",
      apiBaseUrl: "",
      apiModel: "",
      weeklyEnabled: true,
      autoInsightEnabled: true,
      weeklyLimit: 8,
      weeklyDay: 1,
      lastDiscoveryAt: "",
      interests: "large language model, LLM agent, multi-agent, agent memory, tool use, planning, RAG, model alignment, agent evaluation",
      discoveries: [],
      chats: {}
    };
    var AIService2 = class {
      constructor(plugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.settings = { ...DEFAULT_AI_SETTINGS };
        this.insightJobs = /* @__PURE__ */ new Map();
      }
      async load() {
        this.settings = { ...DEFAULT_AI_SETTINGS, ...await this.plugin.loadData() || {} };
        this.settings.apiKey = this.settings.apiKey || this.settings.deepseekApiKey;
        this.settings.apiBaseUrl = this.settings.apiBaseUrl || this.settings.deepseekBaseUrl;
        this.settings.apiModel = this.settings.apiModel || this.settings.deepseekModel;
      }
      async save() {
        await this.plugin.saveData(this.settings);
      }
      isConfigured() {
        return Boolean(String(this.settings.apiKey || "").trim());
      }
      get apiEndpoint() {
        const base = String(this.settings.apiBaseUrl || "").trim().replace(/\/+$/, "");
        if (/\/chat\/completions$/i.test(base)) return base;
        return `${base}/chat/completions`;
      }
      async chat(messages, options = {}) {
        if (!this.isConfigured()) throw new Error("\u8BF7\u5148\u5728\u8BBE\u7F6E \u2192 Research OS AI \u4E2D\u586B\u5199 API Key");
        const response = await requestUrl({
          url: this.apiEndpoint,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${String(this.settings.apiKey).trim()}`
          },
          body: JSON.stringify({
            model: this.settings.apiModel,
            messages,
            stream: false,
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens ?? 2600,
            ...options.json ? { response_format: { type: "json_object" } } : {}
          }),
          throw: false
        });
        if (response.status < 200 || response.status >= 300) {
          const message = response.json?.error?.message || response.text || `HTTP ${response.status}`;
          throw new Error(`AI \u8BF7\u6C42\u5931\u8D25\uFF1A${message}`);
        }
        return response.json?.choices?.[0]?.message?.content || "";
      }
      async testConnection() {
        const text = await this.chat([
          { role: "system", content: "\u53EA\u56DE\u7B54 OK\u3002" },
          { role: "user", content: "\u8FDE\u63A5\u6D4B\u8BD5" }
        ], { maxTokens: 16 });
        return text.trim();
      }
      async fetchArxiv() {
        const terms = this.settings.interests.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12);
        const search = terms.map((term) => `all:"${term}"`).join(" OR ");
        const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(search)}&start=0&max_results=30&sortBy=submittedDate&sortOrder=descending`;
        const response = await requestUrl({ url, method: "GET", headers: { "User-Agent": "ResearchOS/0.2" } });
        const xml = new DOMParser().parseFromString(response.text, "application/xml");
        return Array.from(xml.querySelectorAll("entry")).map((entry) => {
          const value = (tag) => entry.querySelector(tag)?.textContent?.replace(/\s+/g, " ").trim() || "";
          const id = value("id").split("/").pop();
          const links = Array.from(entry.querySelectorAll("link"));
          const pdf = links.find((link) => link.getAttribute("type") === "application/pdf")?.getAttribute("href") || `https://arxiv.org/pdf/${id}`;
          return {
            id: `arxiv:${id}`,
            arxivId: id,
            title: value("title"),
            abstract: value("summary"),
            authors: Array.from(entry.querySelectorAll("author > name")).map((x) => x.textContent.trim()),
            published: value("published").slice(0, 10),
            updated: value("updated").slice(0, 10),
            url: value("id"),
            pdf,
            source: "arXiv",
            venue: "\u9884\u5370\u672C",
            score: 0,
            reason: "\u7B49\u5F85 AI \u5206\u6790",
            readingMode: "\u901F\u8BFB",
            state: "new"
          };
        });
      }
      async runWeeklyDiscovery(force = false) {
        if (!force && !this.shouldRunWeekly()) return this.settings.discoveries;
        const papers = await this.fetchArxiv();
        const libraryTitles = new Set(this.plugin.store.byType("literature").map((x) => x.title.toLowerCase()));
        const candidates = papers.filter((p) => !libraryTitles.has(p.title.toLowerCase()));
        let ranked = candidates;
        if (this.isConfigured() && candidates.length) ranked = await this.rankPapers(candidates);
        ranked = ranked.sort((a, b) => b.score - a.score).slice(0, Number(this.settings.weeklyLimit) || 8);
        const oldStates = new Map(this.settings.discoveries.map((x) => [x.id, x.state]));
        this.settings.discoveries = ranked.map((x) => ({ ...x, state: oldStates.get(x.id) || "new" }));
        this.settings.lastDiscoveryAt = (/* @__PURE__ */ new Date()).toISOString();
        await this.save();
        return this.settings.discoveries;
      }
      shouldRunWeekly() {
        if (!this.settings.weeklyEnabled) return false;
        if (!this.settings.lastDiscoveryAt) return true;
        return Date.now() - new Date(this.settings.lastDiscoveryAt).getTime() >= 6.5 * 24 * 60 * 60 * 1e3;
      }
      async rankPapers(papers) {
        const compact = papers.slice(0, 20).map(({ id, title, abstract, authors, published }) => ({ id, title, abstract: abstract.slice(0, 1800), authors: authors.slice(0, 4), published }));
        const content = await this.chat([
          { role: "system", content: '\u4F60\u662F\u4E25\u8C28\u7684AI\u8BBA\u6587\u7814\u7A76\u52A9\u7406\u3002\u6839\u636E\u7528\u6237\u5174\u8DA3\u8BC4\u4EF7\u8BBA\u6587\u3002\u53EA\u8FD4\u56DEJSON\u5BF9\u8C61\uFF0C\u683C\u5F0F\u4E3A {"papers":[{"id":string,"score":0-100,"reason":string,"readingMode":"\u7CBE\u8BFB|\u901F\u8BFB|\u7565\u8FC7"}]}\u3002\u63A8\u8350\u7406\u7531\u5FC5\u987B\u5177\u4F53\u8BF4\u660E\u8BBA\u6587\u89E3\u51B3\u4EC0\u4E48\u95EE\u9898\u3001\u4E0E\u5174\u8DA3\u7684\u5173\u7CFB\uFF0C\u7981\u6B62\u7A7A\u6CDB\u3002' },
          { role: "user", content: `\u7528\u6237\u5174\u8DA3\uFF1A${this.settings.interests}
\u5019\u9009\u8BBA\u6587\uFF1A${JSON.stringify(compact)}` }
        ], { json: true, maxTokens: 3500 });
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error("DeepSeek \u8FD4\u56DE\u7684\u63A8\u8350\u7ED3\u679C\u65E0\u6CD5\u89E3\u6790");
        }
        const byId = new Map((parsed.papers || []).map((x) => [x.id, x]));
        return papers.map((p) => ({ ...p, ...byId.get(p.id) || { score: 30, reason: "\u4E0E\u5173\u6CE8\u5173\u952E\u8BCD\u5339\u914D", readingMode: "\u901F\u8BFB" } }));
      }
      async importDiscovery(paper) {
        const response = await requestUrl({ url: paper.pdf, method: "GET" });
        const filename = `${paper.arxivId.replace(/[^a-zA-Z0-9._-]/g, "-")}.pdf`;
        const source = { name: filename, arrayBuffer: async () => response.arrayBuffer };
        const imported = await this.plugin.store.importPdf(source);
        await this.app.fileManager.processFrontMatter(imported.note, (fm) => {
          fm.title = paper.title;
          fm.authors = paper.authors;
          fm.year = Number(paper.published.slice(0, 4));
          fm.arxiv_id = paper.arxivId;
          fm.url = paper.url;
          fm.abstract = paper.abstract;
          fm.category = "AI / Agent";
          fm.status = "to-read";
        });
        if (this.isConfigured()) {
          try {
            await this.generateGuide(imported.note, paper);
            await this.plugin.store.load();
            const importedPaper = this.plugin.store.get(imported.note.path);
            if (importedPaper) await this.ensurePaperInsight(importedPaper, true);
          } catch (error) {
            console.error(`Research OS automatic analysis failed for ${imported.note.path}`, error);
          }
        }
        paper.state = "imported";
        await this.save();
        await this.plugin.store.load();
        return imported.note;
      }
      async generateGuide(noteFile, paperData = null) {
        const cache = this.app.metadataCache.getFileCache(noteFile)?.frontmatter || {};
        const title = paperData?.title || cache.title || noteFile.basename;
        const abstract = paperData?.abstract || cache.abstract || "\u672A\u63D0\u4F9B\u6458\u8981";
        const guide = await this.chat([
          { role: "system", content: "\u4F60\u662F\u8BBA\u6587\u5BFC\u8BFB\u8001\u5E08\u3002\u8F93\u51FA\u4E2D\u6587Markdown\u3002\u5FC5\u987B\u751F\u52A8\u3001\u5177\u4F53\u3001\u7ED9\u73B0\u5B9E\u4F8B\u5B50\uFF0C\u4E0D\u5806\u672F\u8BED\u3002\u4E25\u683C\u533A\u5206\u8BBA\u6587\u660E\u786E\u5185\u5BB9\u548C\u4F60\u7684\u63A8\u65AD\u3002\u57FA\u4E8E\u6458\u8981\u65F6\u8981\u58F0\u660E\u8BC1\u636E\u8303\u56F4\uFF0C\u4E0D\u5F97\u865A\u6784\u5B9E\u9A8C\u6570\u5B57\u6216\u9875\u7801\u3002\u5305\u542B\uFF1A\u4E00\u53E5\u8BDD\u8BF4\u660E\u3001\u8981\u89E3\u51B3\u7684\u95EE\u9898\u3001\u751F\u52A8\u4F8B\u5B50\u3001\u65B9\u6CD5\u6B65\u9AA4\u3001\u6838\u5FC3\u8D21\u732E\u3001\u5B9E\u9A8C\u4E0E\u7ED3\u8BBA\u3001\u5C40\u9650\u3001\u7CBE\u8BFB\u8DEF\u7EBF\u3001\u9605\u8BFB\u65F6\u8981\u95EE\u7684\u95EE\u9898\u3002" },
          { role: "user", content: `\u8BBA\u6587\u6807\u9898\uFF1A${title}
\u8BBA\u6587\u6458\u8981\uFF1A${abstract}` }
        ], { maxTokens: 3200, thinking: true });
        const current = await this.app.vault.read(noteFile);
        const block = `

## AI \u5BFC\u8BFB

> \u751F\u6210\u4F9D\u636E\uFF1A\u6807\u9898\u4E0E\u6458\u8981\uFF1B\u6A21\u578B\uFF1A${this.settings.deepseekModel}\uFF1B\u65F6\u95F4\uFF1A${(/* @__PURE__ */ new Date()).toLocaleString()}

${guide}
`;
        if (/\n## AI 导读\n/.test(current)) {
          const next = current.replace(/\n## AI 导读\n[\s\S]*?(?=\n## (?!#)|$)/, block.trimEnd());
          await this.app.vault.modify(noteFile, next);
        } else await this.app.vault.modify(noteFile, current.trimEnd() + block);
        return guide;
      }
      async askPaper(item, question) {
        const note = await this.app.vault.read(item.file);
        const readingNotes = await this.readingNotesContext(item, 26e3);
        const history = (this.settings.chats[item.path] || []).slice(-8);
        const context = `\u6807\u9898\uFF1A${item.title}
\u4F5C\u8005\uFF1A${item.authors.join(", ")}
\u6458\u8981\uFF1A${item.raw.abstract || "\u65E0"}
\u6587\u732E\u8BB0\u5F55\uFF1A
${note.slice(0, 18e3)}
\u8BBA\u6587\u8D44\u6599\u5939\u4E2D\u7684 Markdown\uFF1A
${readingNotes}`;
        const answer = await this.chat([
          { role: "system", content: "\u4F60\u662F\u4E25\u8C28\u7684\u5355\u7BC7\u8BBA\u6587\u7814\u7A76\u52A9\u624B\u3002\u53EA\u4F9D\u636E\u63D0\u4F9B\u7684\u8BBA\u6587\u6458\u8981\u548C\u9605\u8BFB\u7B14\u8BB0\u56DE\u7B54\u3002\u6CA1\u6709\u5168\u6587\u8BC1\u636E\u65F6\u660E\u786E\u8BF4\u4E0D\u77E5\u9053\uFF0C\u4E0D\u5F97\u4F2A\u9020\u9875\u7801\u3001\u5B9E\u9A8C\u7ED3\u679C\u6216\u5F15\u7528\u3002\u89E3\u91CA\u8981\u5177\u4F53\u5E76\u5C3D\u91CF\u4E3E\u4F8B\u3002" },
          { role: "user", content: context },
          ...history,
          { role: "user", content: question }
        ], { maxTokens: 2600, thinking: true });
        const messages = [...history, { role: "user", content: question }, { role: "assistant", content: answer }].slice(-10);
        this.settings.chats[item.path] = messages;
        await this.save();
        return answer;
      }
      hashText(value) {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index++) {
          hash ^= value.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16);
      }
      parseJsonResponse(content, errorMessage) {
        const clean = String(content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        try {
          return JSON.parse(clean);
        } catch {
          throw new Error(errorMessage);
        }
      }
      async paperInsightContext(paper) {
        const note = await this.app.vault.read(paper.file);
        const readingNote = await this.readingNotesContext(paper, 3e4);
        const abstract = String(paper.raw.abstract || "").trim();
        let pdfEvidence = { text: "", pages: 0, annotations: [] };
        try {
          if (paper.pdf) pdfEvidence = await this.plugin.store.extractPdfEvidence(paper);
        } catch (error) {
          console.warn(`Research OS PDF extraction failed for ${paper.path}`, error);
        }
        const pdfText = this.selectPdfEvidence(pdfEvidence.text);
        const highlights = pdfEvidence.annotations.map((annotation) => `\u7B2C ${annotation.page} \u9875\uFF1A${annotation.text}`).join("\n");
        const hasNotes = Boolean(readingNote.trim() || this.meaningfulReadingNotes(note));
        const extractionLevel = pdfText ? hasNotes || highlights ? "pdf+notes" : "pdf" : hasNotes ? "notes" : abstract ? "abstract" : "metadata";
        const extractionLabel = pdfText ? `PDF \u6B63\u6587${hasNotes ? "\u3001Markdown \u9605\u8BFB\u7B14\u8BB0" : ""}${highlights ? "\u4E0E PDF \u6279\u6CE8" : ""}` : hasNotes ? "\u6807\u9898\u3001\u6458\u8981\u4E0E Markdown \u9605\u8BFB\u7B14\u8BB0" : abstract ? "\u6807\u9898\u4E0E\u6458\u8981" : "\u8BBA\u6587\u5143\u6570\u636E\uFF1B\u8BC1\u636E\u6709\u9650";
        const material = `\u6807\u9898\uFF1A${paper.title}
\u4F5C\u8005\uFF1A${paper.authors.join(", ") || "\u672A\u77E5"}
\u4F1A\u8BAE/\u671F\u520A\uFF1A${paper.journal || paper.raw.venue || "\u672A\u77E5"}
\u5E74\u4EFD\uFF1A${paper.year || "\u672A\u77E5"}
\u6458\u8981\uFF1A${abstract || "\u672A\u63D0\u4F9B"}

\u7528\u6237 Markdown \u7B14\u8BB0\uFF08\u6700\u9AD8\u4F18\u5148\u7EA7\u7EBF\u7D22\uFF09\uFF1A
${readingNote.slice(0, 18e3)}

\u6587\u732E\u8BB0\u5F55\u4E2D\u7684\u9AD8\u4EAE\u4E0E\u7B14\u8BB0\uFF1A
${note.slice(0, 18e3)}

PDF \u5185\u5D4C\u6279\u6CE8\uFF1A
${highlights.slice(0, 1e4)}

PDF \u6B63\u6587\u8BC1\u636E\uFF1A
${pdfText}`;
        return { material, extractionLevel, extractionLabel, contentHash: this.hashText(material) };
      }
      meaningfulReadingNotes(note) {
        const body = String(note || "").replace(/^---[\s\S]*?---/, "").replace(/^# .*$/m, "").replace(/## (摘要|高亮与摘录|我的笔记|待办)/g, "").replace(/- \[ \]/g, "").trim();
        return body.length > 120;
      }
      selectPdfEvidence(text) {
        const source = String(text || "");
        if (!source || source.length <= 7e4) return source;
        const windows = [source.slice(0, 26e3), source.slice(-16e3)];
        const keywords = /(?:method|methodology|approach|experiment|evaluation|result|discussion|limitation|conclusion|方法|实验|评估|结果|讨论|局限|结论)/ig;
        const seen = /* @__PURE__ */ new Set();
        for (const match of source.matchAll(keywords)) {
          const start = Math.max(0, match.index - 2200);
          const key = Math.floor(start / 4e3);
          if (seen.has(key)) continue;
          seen.add(key);
          windows.push(source.slice(start, start + 6500));
          if (windows.join("").length > 68e3) break;
        }
        return windows.join("\n\n[\u2026\u8282\u9009\u2026]\n\n").slice(0, 72e3);
      }
      async ensurePaperInsight(paper, force = false) {
        if (!this.isConfigured()) throw new Error("\u8BF7\u5148\u914D\u7F6E DeepSeek API Key\uFF0C\u518D\u751F\u6210\u8BBA\u6587\u63D0\u70BC");
        if (this.insightJobs.has(paper.path)) return this.insightJobs.get(paper.path);
        const job = (async () => {
          await this.plugin.store.load();
          paper = this.plugin.store.get(paper.path) || paper;
          const context = await this.paperInsightContext(paper);
          const existing = this.plugin.store.getPaperInsight(paper.path);
          if (!force && existing?.contentHash === context.contentHash && existing.promptVersion === "paper-insight-v2") return existing;
          const response = await this.chat([
            {
              role: "system",
              content: `\u4F60\u662F\u4E25\u8C28\u7684\u8BBA\u6587\u7814\u7A76\u63D0\u70BC\u52A9\u624B\u3002\u53EA\u80FD\u4F9D\u636E\u7528\u6237\u63D0\u4F9B\u7684\u8BBA\u6587\u6750\u6599\u56DE\u7B54\uFF0C\u4E0D\u5F97\u865A\u6784\u5B9E\u9A8C\u6570\u5B57\u3001\u6570\u636E\u96C6\u3001\u5F00\u6E90\u5730\u5740\u3001\u4F5C\u8005\u89C2\u70B9\u6216\u76F8\u5173\u7814\u7A76\u3002\u8BC1\u636E\u4E0D\u8DB3\u65F6\u5FC5\u987B\u660E\u786E\u5199\u201C\u6750\u6599\u4E2D\u672A\u8BF4\u660E\u201D\u3002\u56DE\u7B54\u8981\u5177\u4F53\u3001\u6E05\u695A\u3001\u9002\u5408\u7814\u7A76\u8005\u590D\u6838\u3002\u53EA\u8FD4\u56DE JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981 Markdown \u4EE3\u7801\u5757\u3002

\u5FC5\u987B\u9010\u4E00\u56DE\u7B54\u5341\u4E2A\u95EE\u9898\uFF1A
Q1 \u8BBA\u6587\u8BD5\u56FE\u89E3\u51B3\u4EC0\u4E48\u95EE\u9898\uFF1F
Q2 \u8FD9\u662F\u5426\u662F\u4E00\u4E2A\u65B0\u7684\u95EE\u9898\uFF1F
Q3 \u8FD9\u7BC7\u6587\u7AE0\u8981\u9A8C\u8BC1\u4E00\u4E2A\u4EC0\u4E48\u79D1\u5B66\u5047\u8BBE\uFF1F
Q4 \u6709\u54EA\u4E9B\u76F8\u5173\u7814\u7A76\uFF1F\u5982\u4F55\u5F52\u7C7B\uFF1F\u8C01\u662F\u8FD9\u4E00\u9886\u57DF\u5185\u503C\u5F97\u5173\u6CE8\u7684\u7814\u7A76\u5458\uFF1F
Q5 \u8BBA\u6587\u4E2D\u63D0\u5230\u7684\u89E3\u51B3\u65B9\u6848\u4E4B\u5173\u952E\u662F\u4EC0\u4E48\uFF1F
Q6 \u8BBA\u6587\u4E2D\u7684\u5B9E\u9A8C\u662F\u5982\u4F55\u8BBE\u8BA1\u7684\uFF1F
Q7 \u7528\u4E8E\u5B9A\u91CF\u8BC4\u4F30\u7684\u6570\u636E\u96C6\u662F\u4EC0\u4E48\uFF1F\u4EE3\u7801\u6709\u6CA1\u6709\u5F00\u6E90\uFF1F
Q8 \u8BBA\u6587\u4E2D\u7684\u5B9E\u9A8C\u53CA\u7ED3\u679C\u6709\u6CA1\u6709\u5F88\u597D\u5730\u652F\u6301\u9700\u8981\u9A8C\u8BC1\u7684\u79D1\u5B66\u5047\u8BBE\uFF1F
Q9 \u8FD9\u7BC7\u8BBA\u6587\u5230\u5E95\u6709\u4EC0\u4E48\u8D21\u732E\uFF1F
Q10 \u4E0B\u4E00\u6B65\u5462\uFF1F\u6709\u4EC0\u4E48\u5DE5\u4F5C\u53EF\u4EE5\u7EE7\u7EED\u6DF1\u5165\uFF1F

JSON \u683C\u5F0F\uFF1A{"answers":{"q1":string,"q2":string,"q3":string,"q4":string,"q5":string,"q6":string,"q7":string,"q8":string,"q9":string,"q10":string},"taxonomy":{"primaryTopic":string,"subtopics":string[],"methods":string[],"tasks":string[],"datasets":string[],"confidence":0-100},"candidates":[{"id":string,"type":"finding|method|question|gap|conflict|hypothesis|decision","title":string,"summary":string,"nextAction":string}]}\u3002primaryTopic \u53EA\u80FD\u6709\u4E00\u4E2A\uFF1Bsubtopics 2\u81F34\u4E2A\uFF1Bmethods \u6700\u591A3\u4E2A\uFF1Btasks \u6700\u591A2\u4E2A\uFF1Bcandidates \u6700\u591A3\u6761\u3002`
            },
            { role: "user", content: `\u751F\u6210\u4F9D\u636E\u7B49\u7EA7\uFF1A${context.extractionLabel}

${context.material}` }
          ], { json: true, thinking: true, maxTokens: 5200 });
          const parsed = this.parseJsonResponse(response, "DeepSeek \u8FD4\u56DE\u7684\u8BBA\u6587\u63D0\u70BC\u65E0\u6CD5\u89E3\u6790");
          if (!parsed.answers || typeof parsed.answers !== "object") throw new Error("\u8BBA\u6587\u63D0\u70BC\u7F3A\u5C11\u5341\u95EE\u7B54\u6848");
          return this.plugin.store.savePaperInsight(paper, {
            answers: parsed.answers,
            taxonomy: parsed.taxonomy || {},
            candidates: parsed.candidates || [],
            extractionLevel: context.extractionLevel,
            extractionLabel: context.extractionLabel,
            contentHash: context.contentHash,
            promptVersion: "paper-insight-v2",
            model: this.settings.deepseekModel
          });
        })().finally(() => this.insightJobs.delete(paper.path));
        this.insightJobs.set(paper.path, job);
        return job;
      }
      async ensureMissingPaperInsights() {
        if (!this.settings.autoInsightEnabled || !this.isConfigured()) return [];
        await this.plugin.store.load();
        const papers = this.plugin.store.byType("literature");
        const generated = [];
        for (const paper of papers) {
          try {
            const existing = this.plugin.store.getPaperInsight(paper.path);
            if (!existing) generated.push(await this.ensurePaperInsight(paper));
          } catch (error) {
            console.error(`Research OS insight generation failed for ${paper.path}`, error);
          }
        }
        return generated;
      }
      async suggestResearchProgress(papers) {
        if (!papers.length) throw new Error("\u8BF7\u5148\u5B8C\u6210\u81F3\u5C11\u4E00\u7BC7\u8BBA\u6587\u7684\u9605\u8BFB");
        const materials = [];
        for (const paper of papers.slice(0, 8)) {
          const note = await this.app.vault.read(paper.file);
          const insight = this.plugin.store.getPaperInsight(paper.path);
          materials.push({
            path: paper.path,
            title: paper.title,
            authors: paper.authors.slice(0, 4),
            category: paper.category,
            abstract: String(paper.raw.abstract || "").slice(0, 1800),
            notes: note.slice(0, 5e3),
            tenQuestionInsight: insight?.insightAnswers || null,
            taxonomy: insight ? { primaryTopic: insight.primaryTopic, subtopics: insight.subtopics, methods: insight.methods, tasks: insight.tasks } : null
          });
        }
        const content = await this.chat([
          {
            role: "system",
            content: '\u4F60\u662F\u4E25\u8C28\u7684\u8DE8\u8BBA\u6587\u7814\u7A76\u7EFC\u5408\u52A9\u624B\u3002\u57FA\u4E8E\u7528\u6237\u5DF2\u8BFB\u8BBA\u6587\u7684\u5341\u95EE\u63D0\u70BC\u548C\u7B14\u8BB0\uFF0C\u627E\u51FA\u6700\u591A3\u6761\u771F\u6B63\u9700\u8981\u591A\u7BC7\u8BBA\u6587\u5171\u540C\u652F\u6301\u7684\u8FDB\u5C55\uFF1A\u5171\u8BC6\u3001\u65B9\u6CD5\u542F\u53D1\u3001\u7814\u7A76\u95EE\u9898\u3001\u7814\u7A76\u7A7A\u767D\u3001\u8BC1\u636E\u51B2\u7A81\u3001\u7814\u7A76\u5047\u8BBE\u6216\u7814\u7A76\u51B3\u7B56\u3002\u4E0D\u5F97\u865A\u6784\u8BBA\u6587\u5185\u5BB9\uFF1B\u6750\u6599\u4E0D\u8DB3\u65F6\u4E0D\u8981\u751F\u6210\u3002\u6BCF\u6761\u5FC5\u987B\u8BF4\u660E\u8DE8\u8BBA\u6587\u5173\u7CFB\u548C\u4E00\u4E2A\u660E\u786E\u4E0B\u4E00\u6B65\u3002\u53EA\u8FD4\u56DEJSON\uFF1A{"candidates":[{"title":string,"summary":string,"progressType":"finding|method|question|gap|conflict|hypothesis|decision","nextAction":string,"papers":[{"path":string,"role":"support|oppose|inspiration|background|verify"}]}]}'
          },
          { role: "user", content: JSON.stringify(materials) }
        ], { json: true, thinking: true, maxTokens: 2400 });
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error("AI \u8FD4\u56DE\u7684\u7814\u7A76\u8FDB\u5C55\u5EFA\u8BAE\u65E0\u6CD5\u89E3\u6790");
        }
        const validPaths = new Set(papers.map((paper) => paper.path));
        return (parsed.candidates || []).slice(0, 3).map((candidate) => ({
          title: String(candidate.title || "").trim(),
          summary: String(candidate.summary || "").trim(),
          progressType: ["finding", "method", "question", "gap", "conflict", "hypothesis", "decision"].includes(candidate.progressType) ? candidate.progressType : "finding",
          nextAction: String(candidate.nextAction || "").trim(),
          papers: (candidate.papers || []).filter((paper) => validPaths.has(paper.path))
        })).filter((candidate) => candidate.title && candidate.summary);
      }
      async synthesizeResearchProgress(papers, goal = "") {
        if (!this.isConfigured()) throw new Error("\u8BF7\u5148\u914D\u7F6E DeepSeek API Key");
        if (!Array.isArray(papers) || papers.length < 2) throw new Error("\u8BF7\u81F3\u5C11\u9009\u62E9\u4E24\u7BC7\u8BBA\u6587");
        const selected = papers.slice(0, 12);
        const materials = [];
        for (const paper of selected) {
          let insight = this.plugin.store.getPaperInsight(paper.path);
          if (!insight || insight.promptVersion !== "paper-insight-v2") insight = await this.ensurePaperInsight(paper);
          materials.push({
            path: paper.path,
            title: paper.title,
            authors: paper.authors.slice(0, 6),
            year: paper.year,
            taxonomy: {
              primaryTopic: insight?.primaryTopic || paper.primaryTopic || paper.category,
              subtopics: insight?.subtopics || paper.subtopics,
              methods: insight?.methods || paper.methods,
              tasks: insight?.tasks || paper.tasks,
              datasets: insight?.datasets || paper.datasets
            },
            answers: insight?.insightAnswers || {},
            evidenceLevel: insight?.extractionLevel || "metadata"
          });
        }
        const response = await this.chat([
          {
            role: "system",
            content: `\u4F60\u662F\u4E25\u8C28\u7684\u8DE8\u8BBA\u6587\u7814\u7A76\u7EFC\u5408\u52A9\u624B\u3002\u6839\u636E\u7528\u6237\u9009\u5B9A\u8BBA\u6587\u7684\u5341\u95EE\u63D0\u70BC\uFF0C\u56F4\u7ED5\u7814\u7A76\u76EE\u6807\u5F62\u6210\u4E00\u4EFD\u53EF\u4EE5\u7EE7\u7EED\u63A8\u8FDB\u7814\u7A76\u7684\u9636\u6BB5\u6027\u7ED3\u8BBA\u3002\u4E0D\u5F97\u8865\u9020\u8BBA\u6587\u4FE1\u606F\uFF1B\u6750\u6599\u4E0D\u8DB3\u5FC5\u987B\u660E\u786E\u8BF4\u660E\u3002\u4E0D\u8981\u9010\u7BC7\u590D\u8FF0\uFF0C\u8981\u6BD4\u8F83\u8BBA\u6587\u4E4B\u95F4\u7684\u5171\u8BC6\u3001\u5DEE\u5F02\u3001\u51B2\u7A81\u548C\u8BC1\u636E\u7F3A\u53E3\u3002\u6BCF\u6761\u5173\u952E\u5224\u65AD\u4F7F\u7528 [P1]\u3001[P2] \u5F62\u5F0F\u6807\u6CE8\u6765\u6E90\u3002\u53EA\u8FD4\u56DE JSON\uFF0C\u4E0D\u8981 Markdown \u4EE3\u7801\u5757\u3002

\u8FD4\u56DE\u7ED3\u6784\uFF1A{"topic":string,"title":string,"sections":{"conclusion":string,"consensus":string,"conflicts":string,"methods":string,"gaps":string,"nextSteps":string},"evidence":[{"claim":string,"paperPaths":string[],"role":"support|oppose|background|method","confidence":0-100}],"classification":{"primaryTopic":string,"subtopics":string[]}}\u3002\u516D\u4E2A sections \u5FC5\u987B\u5168\u90E8\u586B\u5199\uFF1BnextSteps \u8981\u4ECE\u524D\u8FF0\u7A7A\u767D\u6216\u51B2\u7A81\u63A8\u5BFC\uFF0C\u4E0D\u5F97\u6CDB\u6CDB\u800C\u8C08\u3002`
          },
          {
            role: "user",
            content: `\u7814\u7A76\u76EE\u6807\uFF1A${goal.trim() || "\u8BF7\u8BC6\u522B\u8FD9\u4E9B\u8BBA\u6587\u5171\u540C\u7814\u7A76\u7684\u6838\u5FC3\u95EE\u9898\uFF0C\u5E76\u603B\u7ED3\u5F53\u524D\u8FDB\u5C55"}

\u8BBA\u6587\u7F16\u53F7\u6620\u5C04\uFF1A
${materials.map((paper, index) => `[P${index + 1}] ${paper.path} \u2014 ${paper.title}`).join("\n")}

\u7ED3\u6784\u5316\u6750\u6599\uFF1A
${JSON.stringify(materials)}`
          }
        ], { json: true, thinking: true, maxTokens: 5200 });
        const parsed = this.parseJsonResponse(response, "DeepSeek \u8FD4\u56DE\u7684\u7EFC\u5408\u8FDB\u5C55\u65E0\u6CD5\u89E3\u6790");
        if (!parsed.sections?.conclusion) throw new Error("AI \u7EFC\u5408\u7ED3\u679C\u7F3A\u5C11\u5F53\u524D\u7ED3\u8BBA");
        const validPaths = new Set(selected.map((paper) => paper.path));
        parsed.evidence = (parsed.evidence || []).map((item) => ({
          claim: String(item.claim || "").trim(),
          paperPaths: (item.paperPaths || []).filter((path) => validPaths.has(path)),
          role: ["support", "oppose", "background", "method"].includes(item.role) ? item.role : "support",
          confidence: Math.max(0, Math.min(100, Number(item.confidence || 0)))
        })).filter((item) => item.claim && item.paperPaths.length);
        return parsed;
      }
      async repairPaperMetadata(paper) {
        if (!this.isConfigured()) throw new Error("\u8BF7\u5148\u914D\u7F6E DeepSeek API Key");
        let pdf;
        try {
          pdf = await this.plugin.store.extractPdfEvidence(paper, 8);
        } catch {
          pdf = { text: "" };
        }
        const currentNote = await this.app.vault.read(paper.file);
        const response = await this.chat([
          { role: "system", content: '\u4F60\u662F\u8BBA\u6587\u4E66\u76EE\u4FE1\u606F\u6574\u7406\u52A9\u624B\u3002\u53EA\u4F9D\u636E\u7ED9\u5B9A PDF \u9996\u9875\u6B63\u6587\u548C\u73B0\u6709\u7B14\u8BB0\u8BC6\u522B\u4E66\u76EE\u4FE1\u606F\uFF0C\u4E0D\u786E\u5B9A\u5219\u7559\u7A7A\u3002\u6807\u9898\u5FC5\u987B\u662F\u8BBA\u6587\u771F\u5B9E\u6807\u9898\uFF0C\u4E0D\u80FD\u8FD4\u56DE\u6587\u4EF6\u7F16\u53F7\u3002\u6458\u8981\u5E94\u5FE0\u5B9E\u6982\u62EC\u539F\u6587\uFF0C\u4E0D\u5F97\u865A\u6784\u3002\u53EA\u8FD4\u56DE JSON\uFF1A{"title":string,"authors":string[],"year":string,"journal":string,"abstract":string}\u3002' },
          { role: "user", content: `\u5F53\u524D\u6587\u4EF6\u540D\uFF1A${paper.file.basename}
\u5F53\u524D\u6807\u9898\uFF1A${paper.title}

PDF \u524D\u90E8\u6B63\u6587\uFF1A
${String(pdf.text || "").slice(0, 26e3)}

\u73B0\u6709\u6587\u732E\u7B14\u8BB0\uFF1A
${currentNote.slice(0, 8e3)}` }
        ], { json: true, thinking: false, maxTokens: 1800 });
        const metadata = this.parseJsonResponse(response, "AI \u8FD4\u56DE\u7684\u6587\u732E\u4FE1\u606F\u65E0\u6CD5\u89E3\u6790");
        if (!metadata.title) throw new Error("\u6CA1\u6709\u4ECE PDF \u4E2D\u8BC6\u522B\u51FA\u53EF\u9760\u6807\u9898");
        return {
          title: String(metadata.title || "").trim(),
          authors: Array.isArray(metadata.authors) ? metadata.authors.map(String).filter(Boolean) : String(metadata.authors || "").split(/[,，;；]/).map((value) => value.trim()).filter(Boolean),
          year: String(metadata.year || "").trim(),
          journal: String(metadata.journal || "").trim(),
          abstract: String(metadata.abstract || "").trim()
        };
      }
      async organizeLibraryTaxonomy() {
        if (!this.isConfigured()) throw new Error("\u8BF7\u5148\u914D\u7F6E DeepSeek API Key");
        await this.plugin.store.load();
        const papers = this.plugin.store.byType("literature");
        if (!papers.length) return [];
        const materials = papers.map((paper) => {
          const insight = this.plugin.store.getPaperInsight(paper.path);
          return {
            path: paper.path,
            title: paper.title,
            abstract: String(paper.raw.abstract || "").slice(0, 1600),
            currentTopic: paper.primaryTopic || paper.category,
            subtopics: paper.subtopics,
            methods: paper.methods,
            q1: insight?.insightAnswers?.q1 || "",
            q5: insight?.insightAnswers?.q5 || "",
            q9: insight?.insightAnswers?.q9 || ""
          };
        });
        const maxTopics = Math.max(2, Math.min(5, Math.ceil(papers.length / 2)));
        const response = await this.chat([
          {
            role: "system",
            content: `\u4F60\u8D1F\u8D23\u6574\u7406\u4E00\u4E2A\u5B8C\u6574\u8BBA\u6587\u5E93\uFF0C\u800C\u4E0D\u662F\u9010\u7BC7\u547D\u540D\u3002\u5148\u6BD4\u8F83\u6240\u6709\u8BBA\u6587\u7684\u7814\u7A76\u5BF9\u8C61\u3001\u4EFB\u52A1\u548C\u65B9\u6CD5\uFF0C\u518D\u5EFA\u7ACB\u7A33\u5B9A\u7684\u4E24\u7EA7\u76EE\u5F55\u3002\u5F53\u524D\u6709 ${papers.length} \u7BC7\u8BBA\u6587\uFF0C\u4E00\u7EA7\u4E3B\u9898\u6700\u591A ${maxTopics} \u4E2A\u3002\u4E00\u7EA7\u4E3B\u9898\u5FC5\u987B\u662F\u5BBD\u6CDB\u4E14\u53EF\u590D\u7528\u7684\u7814\u7A76\u9886\u57DF\uFF0C\u4F8B\u5982\u201C\u667A\u80FD\u4F53\u5B89\u5168\u201D\u201C\u591A\u667A\u80FD\u4F53\u7CFB\u7EDF\u201D\u201C\u6A21\u578B\u53EF\u89E3\u91CA\u6027\u201D\u201C\u68C0\u7D22\u589E\u5F3A\u751F\u6210\u201D\uFF0C\u7EDD\u4E0D\u80FD\u662F\u8BBA\u6587\u6807\u9898\u3001\u5177\u4F53\u65B9\u6CD5\u540D\u6216\u4E00\u53E5\u7814\u7A76\u95EE\u9898\u3002\u76F8\u8FD1\u4E2D\u82F1\u6587\u6982\u5FF5\u5FC5\u987B\u5408\u5E76\u3002\u4FE1\u606F\u4E0D\u8DB3\u65F6\u7EDF\u4E00\u5F52\u5165\u201C\u5F85\u8BC6\u522B\u201D\u3002

\u4F60\u5FC5\u987B\u5148\u521B\u5EFA clusters\uFF0C\u518D\u628A\u8BBA\u6587\u8DEF\u5F84\u653E\u8FDB cluster.paperPaths\uFF1B\u6BCF\u7BC7\u8BBA\u6587\u53EA\u80FD\u51FA\u73B0\u4E00\u6B21\u3002\u4E00\u7EA7\u4E3B\u9898\u540D\u79F0\u7EDF\u4E00\u4F7F\u7528\u4E2D\u6587 4\u20138 \u4E2A\u5B57\u3002\u53EA\u8FD4\u56DE JSON\uFF1A{"clusters":[{"id":"T1","name":string,"description":string,"paperPaths":string[]}],"paperDetails":[{"path":string,"subtopics":string[],"methods":string[],"confidence":0-100}]}\u3002\u4E0D\u8981\u8BA9 paperDetails \u81EA\u5DF1\u586B\u5199\u4E00\u7EA7\u4E3B\u9898\u3002`
          },
          { role: "user", content: JSON.stringify(materials) }
        ], { json: true, thinking: true, maxTokens: 3600 });
        const parsed = this.parseJsonResponse(response, "AI \u8FD4\u56DE\u7684\u6587\u732E\u805A\u7C7B\u65E0\u6CD5\u89E3\u6790");
        const validPaths = new Set(papers.map((paper) => paper.path));
        const details = new Map((parsed.paperDetails || []).filter((item) => validPaths.has(item.path)).map((item) => [item.path, item]));
        const topicByPath = /* @__PURE__ */ new Map();
        (parsed.clusters || []).slice(0, maxTopics).forEach((cluster) => {
          const name = this.normalizeLibraryTopic(cluster.name);
          (cluster.paperPaths || []).filter((path) => validPaths.has(path)).forEach((path) => {
            if (!topicByPath.has(path)) topicByPath.set(path, name);
          });
        });
        const assignments = papers.map((paper) => {
          const detail = details.get(paper.path) || {};
          return {
            path: paper.path,
            primaryTopic: topicByPath.get(paper.path) || this.fallbackLibraryTopic(paper),
            subtopics: Array.isArray(detail.subtopics) ? detail.subtopics : paper.subtopics,
            methods: Array.isArray(detail.methods) ? detail.methods : paper.methods,
            confidence: Number(detail.confidence || (topicByPath.has(paper.path) ? 75 : 45))
          };
        });
        await this.plugin.store.applyLibraryTaxonomy(assignments);
        return assignments;
      }
      normalizeLibraryTopic(value) {
        const topic = String(value || "").trim();
        const lower = topic.toLowerCase();
        if (/agent.*safety|agent.*安全|agentic.*safety|智能体.*安全|safety.*alignment|安全.*对齐|模型.*安全/.test(lower)) return "AI\u5B89\u5168\u4E0E\u5BF9\u9F50";
        if (/multi.?agent|多智能体|agent.*协作|智能体.*协作/.test(lower)) return "\u591A\u667A\u80FD\u4F53\u7CFB\u7EDF";
        if (/sparse autoencoder|interpret|可解释|机理解释|特征解释/.test(lower)) return "\u6A21\u578B\u53EF\u89E3\u91CA\u6027";
        if (/retrieval|\brag\b|检索增强/.test(lower)) return "\u68C0\u7D22\u589E\u5F3A\u751F\u6210";
        if (/alignment|模型对齐|语言模型安全/.test(lower)) return "AI\u5B89\u5168\u4E0E\u5BF9\u9F50";
        if (!topic || /未知|未明确|未分类|论文编号|未提供/.test(topic) || topic.length > 12 || /[:：]/.test(topic)) return "\u5F85\u8BC6\u522B";
        return topic;
      }
      fallbackLibraryTopic(paper) {
        const text = [paper.title, paper.raw.abstract, ...paper.subtopics, ...paper.methods].join(" ").toLowerCase();
        if (/agentharm|jailbreak|agentic safety|agent safety|agentalign|policy.?align|safety alignment|model alignment|智能体安全|模型安全/.test(text)) return "AI\u5B89\u5168\u4E0E\u5BF9\u9F50";
        if (/multi.?agent|autogen|collaboration|competition|coordination|多智能体/.test(text)) return "\u591A\u667A\u80FD\u4F53\u7CFB\u7EDF";
        if (/sparse autoencoder|saeverbalizer|interpretability|可解释/.test(text)) return "\u6A21\u578B\u53EF\u89E3\u91CA\u6027";
        if (/retrieval.augmented|\brag\b|parliamentrag|检索增强/.test(text)) return "\u68C0\u7D22\u589E\u5F3A\u751F\u6210";
        return "\u5F85\u8BC6\u522B";
      }
      async saveChatToNote(item, question, answer) {
        const text = `

### ${(/* @__PURE__ */ new Date()).toLocaleString()}

**\u95EE\uFF1A** ${question}

**AI\uFF1A** ${answer}
`;
        const target = this.resolveReadingNote(item) || item.file;
        const current = await this.app.vault.read(target);
        if (current.includes("## AI \u5BF9\u8BDD\u6C89\u6DC0")) await this.app.vault.modify(target, current + text);
        else await this.app.vault.modify(target, current.trimEnd() + "\n\n## AI \u5BF9\u8BDD\u6C89\u6DC0\n" + text);
      }
      resolveReadingNote(item) {
        if (!item.readingNote) return item.file;
        const clean = String(item.readingNote).replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
        const file = this.app.metadataCache.getFirstLinkpathDest(clean, item.file.path) || this.app.vault.getAbstractFileByPath(clean);
        return file instanceof TFile ? file : item.file;
      }
      resolveReadingNotes(item) {
        const values = item.readingNotes?.length ? item.readingNotes : item.readingNote ? [item.readingNote] : [];
        return values.map((value) => {
          const clean = String(value).replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
          return this.app.metadataCache.getFirstLinkpathDest(clean, item.file.path) || this.app.vault.getAbstractFileByPath(clean);
        }).filter((file) => file instanceof TFile);
      }
      async readingNotesContext(item, maxChars = 3e4) {
        const files = this.resolveReadingNotes(item);
        const chunks = [];
        let used = 0;
        for (const file of files) {
          const text = await this.app.vault.read(file);
          const allowance = Math.max(0, maxChars - used);
          if (!allowance) break;
          const excerpt = text.slice(0, allowance);
          chunks.push(`
[${file.basename}]
${excerpt}`);
          used += excerpt.length;
        }
        return chunks.join("\n");
      }
    };
    var ResearchAISettingTab2 = class extends PluginSettingTab {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h1", { text: "Research OS \u8BBE\u7F6E" });
        renderThemeSettings(containerEl, this.plugin, () => this.display());
        containerEl.createEl("h2", { text: "OpenAI \u517C\u5BB9 AI" });
        containerEl.createEl("p", { text: "API Key \u4EC5\u4FDD\u5B58\u5728\u672C\u673A\u63D2\u4EF6 data.json\uFF0C\u4E0D\u5199\u5165\u6587\u732E\u7B14\u8BB0\u3002" });
        new Setting(containerEl).setName("API Key").setDesc("\u652F\u6301\u4EFB\u610F OpenAI \u517C\u5BB9\u670D\u52A1").addText((text) => {
          text.inputEl.type = "password";
          text.setPlaceholder("sk-...").setValue(this.plugin.ai.settings.apiKey).onChange(async (value) => {
            this.plugin.ai.settings.apiKey = value.trim();
            this.plugin.ai.settings.deepseekApiKey = value.trim();
            await this.plugin.ai.save();
          });
        });
        new Setting(containerEl).setName("API Base URL").setDesc("\u4F8B\u5982 https://api.openai.com/v1").addText((text) => {
          text.setPlaceholder("https://api.deepseek.com").setValue(this.plugin.ai.settings.apiBaseUrl).onChange(async (value) => {
            this.plugin.ai.settings.apiBaseUrl = value.trim();
            this.plugin.ai.settings.deepseekBaseUrl = value.trim();
            await this.plugin.ai.save();
          });
        });
        new Setting(containerEl).setName("\u6A21\u578B").setDesc("\u586B\u5199\u670D\u52A1\u5546\u63D0\u4F9B\u7684\u6A21\u578B\u540D").addText((text) => {
          text.setPlaceholder("deepseek-v4-flash").setValue(this.plugin.ai.settings.apiModel).onChange(async (value) => {
            this.plugin.ai.settings.apiModel = value.trim();
            this.plugin.ai.settings.deepseekModel = value.trim();
            await this.plugin.ai.save();
          });
        });
        new Setting(containerEl).setName("\u6D4B\u8BD5\u8FDE\u63A5").addButton((button) => button.setButtonText("\u6D4B\u8BD5").onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.ai.testConnection();
            new Notice2("AI \u8FDE\u63A5\u6210\u529F");
          } catch (e) {
            new Notice2(e.message, 8e3);
          } finally {
            button.setDisabled(false);
          }
        }));
        new Setting(containerEl).setName("\u6BCF\u5468\u81EA\u52A8\u53D1\u73B0").addToggle((toggle) => toggle.setValue(this.plugin.ai.settings.weeklyEnabled).onChange(async (value) => {
          this.plugin.ai.settings.weeklyEnabled = value;
          await this.plugin.ai.save();
        }));
        new Setting(containerEl).setName("\u81EA\u52A8\u751F\u6210\u8BBA\u6587\u5341\u95EE\u63D0\u70BC").setDesc("\u5BFC\u5165\u8BBA\u6587\u540E\u81EA\u52A8\u751F\u6210\uFF1B\u5DF2\u6709\u8BBA\u6587\u4F1A\u5728\u540E\u53F0\u8865\u9F50\u7F3A\u5931\u63D0\u70BC\u3002").addToggle((toggle) => toggle.setValue(this.plugin.ai.settings.autoInsightEnabled).onChange(async (value) => {
          this.plugin.ai.settings.autoInsightEnabled = value;
          await this.plugin.ai.save();
        }));
        new Setting(containerEl).setName("\u6BCF\u5468\u63A8\u8350\u4E0A\u9650").addSlider((slider) => slider.setLimits(3, 20, 1).setValue(this.plugin.ai.settings.weeklyLimit).setDynamicTooltip().onChange(async (value) => {
          this.plugin.ai.settings.weeklyLimit = value;
          await this.plugin.ai.save();
        }));
        new Setting(containerEl).setName("\u5173\u6CE8\u4E3B\u9898").setDesc("\u4F7F\u7528\u82F1\u6587\u9017\u53F7\u5206\u9694").addTextArea((area) => area.setValue(this.plugin.ai.settings.interests).onChange(async (value) => {
          this.plugin.ai.settings.interests = value;
          await this.plugin.ai.save();
        }));
      }
    };
    module2.exports = { AIService: AIService2, ResearchAISettingTab: ResearchAISettingTab2, DEFAULT_AI_SETTINGS };
  }
});

// .obsidian/plugins/research-os/main.source.js
var { Plugin, ItemView, Notice } = require("obsidian");
var { ResearchStore } = require_research_store();
var { ResearchView } = require_research_view();
var { AIService, ResearchAISettingTab } = require_ai_service();
var { ThemeService } = require_theme_service();
var VIEW_TYPE = "research-os-view";
module.exports = class ResearchOSPlugin extends Plugin {
  async onload() {
    this.store = new ResearchStore(this.app);
    this.ai = new AIService(this);
    await this.ai.load();
    this.theme = new ThemeService(this);
    await this.theme.initialize();
    this.addSettingTab(new ResearchAISettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new ResearchView(leaf, this));
    this.addRibbonIcon("library-big", "\u6253\u5F00 Research OS", () => this.openResearchOS());
    this.addCommand({
      id: "open-research-os",
      name: "\u6253\u5F00\u7814\u7A76\u9A7E\u9A76\u8231",
      callback: () => this.openResearchOS()
    });
    this.addCommand({
      id: "run-ai-paper-discovery",
      name: "AI\uFF1A\u7ACB\u5373\u53D1\u73B0\u672C\u5468\u8BBA\u6587",
      callback: async () => {
        const notice = new Notice("\u6B63\u5728\u6293\u53D6\u5E76\u5206\u6790\u672C\u5468\u8BBA\u6587\u2026", 0);
        try {
          await this.ai.runWeeklyDiscovery(true);
          this.refreshViews();
          notice.hide();
          new Notice("\u672C\u5468\u8BBA\u6587\u53D1\u73B0\u5B8C\u6210");
        } catch (error) {
          notice.hide();
          new Notice(error.message, 8e3);
        }
      }
    });
    this.addCommand({
      id: "refresh-research-os",
      name: "\u5237\u65B0\u7814\u7A76\u6570\u636E",
      callback: async () => {
        await this.store.load();
        this.refreshViews();
        new Notice("Research OS \u6570\u636E\u5DF2\u5237\u65B0");
      }
    });
    this.addCommand({
      id: "generate-missing-paper-insights",
      name: "AI\uFF1A\u8865\u9F50\u6240\u6709\u8BBA\u6587\u5341\u95EE\u63D0\u70BC",
      callback: async () => {
        const notice = new Notice("\u6B63\u5728\u4E3A\u7F3A\u5931\u8BBA\u6587\u751F\u6210\u5341\u95EE\u63D0\u70BC\u2026", 0);
        try {
          const generated = await this.ai.ensureMissingPaperInsights();
          notice.hide();
          this.refreshViews();
          new Notice(`\u5DF2\u751F\u6210 ${generated.length} \u7BC7\u8BBA\u6587\u63D0\u70BC`);
        } catch (error) {
          notice.hide();
          new Notice(error.message, 8e3);
        }
      }
    });
    const refresh = this.debounce(() => this.refreshViews(), 350);
    this.registerEvent(this.app.vault.on("create", refresh));
    this.registerEvent(this.app.vault.on("delete", refresh));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file.path === this.ai.settings.customTheme?.backgroundPath) this.theme.useForest();
    }));
    this.registerEvent(this.app.vault.on("modify", refresh));
    this.registerEvent(this.app.metadataCache.on("changed", refresh));
    this.app.workspace.onLayoutReady(async () => {
      await this.store.load();
      this.ai.ensureMissingPaperInsights().then((results) => {
        if (results.length) this.refreshViews();
      }).catch((error) => console.error("Research OS automatic paper insights failed", error));
      if (this.ai.shouldRunWeekly()) this.ai.runWeeklyDiscovery().then(() => this.refreshViews()).catch((error) => console.error("Research OS weekly discovery failed", error));
      if (!this.app.workspace.getLeavesOfType(VIEW_TYPE).length) {
        await this.openResearchOS(false);
      }
    });
  }
  debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }
  async refreshViews() {
    await this.store.load();
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => leaf.view.render());
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
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
};
