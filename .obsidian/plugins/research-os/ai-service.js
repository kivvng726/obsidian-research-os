const { PluginSettingTab, Setting, Notice, requestUrl, TFile } = require("obsidian");
const { renderThemeSettings } = require("./theme-settings");

const DEFAULT_AI_SETTINGS = {
  activeThemeId: "forest-original",
  customTheme: null,
  aiProvider: "deepseek",
  aiApiKey: "",
  aiBaseUrl: "",
  aiModel: "",
  deepseekApiKey: "",
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekModel: "deepseek-v4-flash",
  weeklyEnabled: true,
  autoInsightEnabled: true,
  weeklyLimit: 8,
  weeklyDay: 1,
  lastDiscoveryAt: "",
  interests: "large language model, LLM agent, multi-agent, agent memory, tool use, planning, RAG, model alignment, agent evaluation",
  discoveries: [],
  chats: {}
};

const AI_PROVIDERS = {
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    models: {
      "deepseek-v4-flash": "DeepSeek V4 Flash（推荐）",
      "deepseek-v4-pro": "DeepSeek V4 Pro（深度研究）",
      "deepseek-chat": "deepseek-chat",
      "deepseek-reasoner": "deepseek-reasoner"
    },
    supportsThinking: true,
    supportsJsonMode: true
  },
  openai: {
    name: "OpenAI / GPT",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.2",
    models: {
      "gpt-5.2": "GPT-5.2（推荐）",
      "gpt-4o-mini": "GPT-4o mini",
      "gpt-4o": "GPT-4o",
      "gpt-4.1-mini": "GPT-4.1 mini",
      "gpt-4.1": "GPT-4.1"
    },
    supportsJsonMode: true
  },
  kimi: {
    name: "Kimi / Moonshot",
    baseUrl: "https://api.moonshot.ai/v1",
    model: "kimi-k2.6",
    models: {
      "kimi-k2.6": "kimi-k2.6（推荐）",
      "kimi-k3": "kimi-k3",
      "moonshot-v1-8k": "moonshot-v1-8k",
      "moonshot-v1-32k": "moonshot-v1-32k",
      "moonshot-v1-128k": "moonshot-v1-128k"
    },
    supportsJsonMode: true
  },
  openrouter: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "~openai/gpt-latest",
    models: {
      "~openai/gpt-latest": "~openai/gpt-latest（推荐）",
      "openai/gpt-4o-mini": "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
      "google/gemini-flash-1.5": "google/gemini-flash-1.5",
      "deepseek/deepseek-chat": "deepseek/deepseek-chat"
    },
    supportsJsonMode: true
  },
  siliconflow: {
    name: "硅基流动 SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "deepseek-ai/DeepSeek-V3.2",
    models: {
      "deepseek-ai/DeepSeek-V3.2": "DeepSeek-V3.2（推荐）",
      "deepseek-ai/DeepSeek-R1": "DeepSeek-R1",
      "Qwen/Qwen3.6-27B": "Qwen3.6-27B",
      "Qwen/Qwen2.5-72B-Instruct": "Qwen2.5-72B-Instruct"
    },
    supportsJsonMode: true
  },
  zhipu: {
    name: "智谱 AI / GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.2",
    models: {
      "glm-5.2": "GLM-5.2（推荐）",
      "glm-5.1": "GLM-5.1",
      "glm-4.7": "GLM-4.7",
      "glm-4.5": "GLM-4.5"
    },
    supportsJsonMode: true,
    supportsThinking: true
  },
  anthropic: {
    name: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-5",
    models: {
      "claude-sonnet-5": "Claude Sonnet 5（推荐）",
      "claude-opus-5": "Claude Opus 5",
      "claude-opus-4-8": "Claude Opus 4.8",
      "claude-sonnet-4-6": "Claude Sonnet 4.6",
      "claude-haiku-4-5-20251001": "Claude Haiku 4.5"
    },
    apiType: "anthropic",
    supportsJsonMode: false
  },
  custom: {
    name: "自定义 OpenAI 兼容接口",
    baseUrl: "",
    model: "",
    models: {},
    supportsJsonMode: true
  }
};

class AIService {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.settings = { ...DEFAULT_AI_SETTINGS };
    this.insightJobs = new Map();
  }

  async load() {
    this.settings = { ...DEFAULT_AI_SETTINGS, ...(await this.plugin.loadData() || {}) };
    if (!this.settings.aiApiKey && this.settings.deepseekApiKey) this.settings.aiApiKey = this.settings.deepseekApiKey;
    if (!this.settings.aiBaseUrl && this.settings.deepseekBaseUrl) this.settings.aiBaseUrl = this.settings.deepseekBaseUrl;
    if (!this.settings.aiModel && this.settings.deepseekModel) this.settings.aiModel = this.settings.deepseekModel;
  }

  async save() { await this.plugin.saveData(this.settings); }
  provider() { return AI_PROVIDERS[this.settings.aiProvider] || AI_PROVIDERS.deepseek; }
  providerName() { return this.provider().name; }
  baseUrl() { return (this.settings.aiBaseUrl || this.provider().baseUrl || "").replace(/\/$/, ""); }
  model() { return this.settings.aiModel || this.provider().model; }
  isConfigured() { return Boolean(this.settings.aiApiKey.trim() && this.baseUrl() && this.model()); }
  async setProvider(providerId) {
    const provider = AI_PROVIDERS[providerId] || AI_PROVIDERS.deepseek;
    this.settings.aiProvider = providerId in AI_PROVIDERS ? providerId : "deepseek";
    this.settings.aiBaseUrl = provider.baseUrl;
    this.settings.aiModel = provider.model;
    await this.save();
  }

  async chat(messages, options = {}) {
    if (!this.isConfigured()) throw new Error("请先在设置 → Research OS AI 中填写模型服务、API Key、Base URL 和模型名");
    const provider = this.provider();
    if (provider.apiType === "anthropic") return this.chatAnthropic(messages, options);
    const body = {
      model: this.model(),
      messages,
      stream: false,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2600
    };
    if (provider.supportsThinking) body.thinking = { type: options.thinking ? "enabled" : "disabled" };
    if (options.json && provider.supportsJsonMode !== false) body.response_format = { type: "json_object" };
    const response = await requestUrl({
      url: `${this.baseUrl()}/chat/completions`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.aiApiKey.trim()}`
      },
      body: JSON.stringify(body),
      throw: false
    });
    if (response.status < 200 || response.status >= 300) {
      const message = response.json?.error?.message || response.text || `HTTP ${response.status}`;
      throw new Error(`${this.providerName()} 请求失败：${message}`);
    }
    return response.json?.choices?.[0]?.message?.content || "";
  }

  async chatAnthropic(messages, options = {}) {
    const system = messages.filter(message => message.role === "system").map(message => message.content).join("\n\n");
    const conversation = messages.filter(message => message.role !== "system").map(message => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || "")
    }));
    const body = {
      model: this.model(),
      max_tokens: options.maxTokens ?? 2600,
      messages: conversation.length ? conversation : [{ role: "user", content: "连接测试" }],
      ...(system ? { system } : {})
    };
    const response = await requestUrl({
      url: `${this.baseUrl()}/v1/messages`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.settings.aiApiKey.trim(),
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body),
      throw: false
    });
    if (response.status < 200 || response.status >= 300) {
      const message = response.json?.error?.message || response.text || `HTTP ${response.status}`;
      throw new Error(`${this.providerName()} 请求失败：${message}`);
    }
    return (response.json?.content || []).map(part => part?.text || "").join("").trim();
  }

  async testConnection() {
    const text = await this.chat([
      { role: "system", content: "只回答 OK。" },
      { role: "user", content: "连接测试" }
    ], { maxTokens: 16 });
    return text.trim();
  }

  async fetchArxiv() {
    const terms = this.settings.interests.split(",").map(x => x.trim()).filter(Boolean).slice(0, 12);
    const search = terms.map(term => `all:\"${term}\"`).join(" OR ");
    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(search)}&start=0&max_results=30&sortBy=submittedDate&sortOrder=descending`;
    const response = await requestUrl({ url, method: "GET", headers: { "User-Agent": "ResearchOS/0.2" } });
    const xml = new DOMParser().parseFromString(response.text, "application/xml");
    return Array.from(xml.querySelectorAll("entry")).map(entry => {
      const value = tag => entry.querySelector(tag)?.textContent?.replace(/\s+/g, " ").trim() || "";
      const id = value("id").split("/").pop();
      const links = Array.from(entry.querySelectorAll("link"));
      const pdf = links.find(link => link.getAttribute("type") === "application/pdf")?.getAttribute("href") || `https://arxiv.org/pdf/${id}`;
      return {
        id: `arxiv:${id}`,
        arxivId: id,
        title: value("title"),
        abstract: value("summary"),
        authors: Array.from(entry.querySelectorAll("author > name")).map(x => x.textContent.trim()),
        published: value("published").slice(0,10),
        updated: value("updated").slice(0,10),
        url: value("id"),
        pdf,
        source: "arXiv",
        venue: "预印本",
        score: 0,
        reason: "等待 AI 分析",
        readingMode: "速读",
        state: "new"
      };
    });
  }

  async runWeeklyDiscovery(force = false) {
    if (!force && !this.shouldRunWeekly()) return this.settings.discoveries;
    const papers = await this.fetchArxiv();
    const libraryTitles = new Set(this.plugin.store.byType("literature").map(x => x.title.toLowerCase()));
    const candidates = papers.filter(p => !libraryTitles.has(p.title.toLowerCase()));
    let ranked = candidates;
    if (this.isConfigured() && candidates.length) ranked = await this.rankPapers(candidates);
    ranked = ranked.sort((a,b) => b.score - a.score).slice(0, Number(this.settings.weeklyLimit) || 8);
    const oldStates = new Map(this.settings.discoveries.map(x => [x.id, x.state]));
    this.settings.discoveries = ranked.map(x => ({ ...x, state: oldStates.get(x.id) || "new" }));
    this.settings.lastDiscoveryAt = new Date().toISOString();
    await this.save();
    return this.settings.discoveries;
  }

  shouldRunWeekly() {
    if (!this.settings.weeklyEnabled) return false;
    if (!this.settings.lastDiscoveryAt) return true;
    return Date.now() - new Date(this.settings.lastDiscoveryAt).getTime() >= 6.5 * 24 * 60 * 60 * 1000;
  }

  async rankPapers(papers) {
    const compact = papers.slice(0, 20).map(({id,title,abstract,authors,published}) => ({ id,title,abstract:abstract.slice(0,1800),authors:authors.slice(0,4),published }));
    const content = await this.chat([
      { role: "system", content: "你是严谨的AI论文研究助理。根据用户兴趣评价论文。只返回JSON对象，格式为 {\"papers\":[{\"id\":string,\"score\":0-100,\"reason\":string,\"readingMode\":\"精读|速读|略过\"}]}。推荐理由必须具体说明论文解决什么问题、与兴趣的关系，禁止空泛。" },
      { role: "user", content: `用户兴趣：${this.settings.interests}\n候选论文：${JSON.stringify(compact)}` }
    ], { json: true, maxTokens: 3500 });
    let parsed;
    try { parsed = JSON.parse(content); } catch { throw new Error("AI 返回的推荐结果无法解析"); }
    const byId = new Map((parsed.papers || []).map(x => [x.id, x]));
    return papers.map(p => ({ ...p, ...(byId.get(p.id) || { score: 30, reason: "与关注关键词匹配", readingMode: "速读" }) }));
  }

  async importDiscovery(paper) {
    const response = await requestUrl({ url: paper.pdf, method: "GET" });
    const filename = `${paper.arxivId.replace(/[^a-zA-Z0-9._-]/g, "-")}.pdf`;
    const source = { name: filename, arrayBuffer: async () => response.arrayBuffer };
    const imported = await this.plugin.store.importPdf(source);
    await this.app.fileManager.processFrontMatter(imported.note, fm => {
      fm.title = paper.title;
      fm.authors = paper.authors;
      fm.year = Number(paper.published.slice(0,4));
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
    const abstract = paperData?.abstract || cache.abstract || "未提供摘要";
    const guide = await this.chat([
      { role: "system", content: "你是论文导读老师。输出中文Markdown。必须生动、具体、给现实例子，不堆术语。严格区分论文明确内容和你的推断。基于摘要时要声明证据范围，不得虚构实验数字或页码。包含：一句话说明、要解决的问题、生动例子、方法步骤、核心贡献、实验与结论、局限、精读路线、阅读时要问的问题。" },
      { role: "user", content: `论文标题：${title}\n论文摘要：${abstract}` }
    ], { maxTokens: 3200, thinking: true });
    const current = await this.app.vault.read(noteFile);
    const block = `\n\n## AI 导读\n\n> 生成依据：标题与摘要；模型：${this.model()}；时间：${new Date().toLocaleString()}\n\n${guide}\n`;
    if (/\n## AI 导读\n/.test(current)) {
      const next = current.replace(/\n## AI 导读\n[\s\S]*?(?=\n## (?!#)|$)/, block.trimEnd());
      await this.app.vault.modify(noteFile, next);
    } else await this.app.vault.modify(noteFile, current.trimEnd() + block);
    return guide;
  }

  async askPaper(item, question) {
    const note = await this.app.vault.read(item.file);
    const readingNotes = await this.readingNotesContext(item, 26000);
    const history = (this.settings.chats[item.path] || []).slice(-8);
    const context = `标题：${item.title}\n作者：${item.authors.join(", ")}\n摘要：${item.raw.abstract || "无"}\n文献记录：\n${note.slice(0,18000)}\n论文资料夹中的 Markdown：\n${readingNotes}`;
    const answer = await this.chat([
      { role: "system", content: "你是严谨的单篇论文研究助手。只依据提供的论文摘要和阅读笔记回答。没有全文证据时明确说不知道，不得伪造页码、实验结果或引用。解释要具体并尽量举例。" },
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
    try { return JSON.parse(clean); } catch { throw new Error(errorMessage); }
  }

  async paperInsightContext(paper) {
    const note = await this.app.vault.read(paper.file);
    const readingNote = await this.readingNotesContext(paper, 30000);
    const abstract = String(paper.raw.abstract || "").trim();
    let pdfEvidence = { text: "", pages: 0, annotations: [] };
    try { if (paper.pdf) pdfEvidence = await this.plugin.store.extractPdfEvidence(paper); } catch (error) { console.warn(`Research OS PDF extraction failed for ${paper.path}`, error); }
    const pdfText = this.selectPdfEvidence(pdfEvidence.text);
    const highlights = pdfEvidence.annotations.map(annotation => `第 ${annotation.page} 页：${annotation.text}`).join("\n");
    const hasNotes = Boolean(readingNote.trim() || this.meaningfulReadingNotes(note));
    const extractionLevel = pdfText ? (hasNotes || highlights ? "pdf+notes" : "pdf") : hasNotes ? "notes" : abstract ? "abstract" : "metadata";
    const extractionLabel = pdfText ? `PDF 正文${hasNotes ? "、Markdown 阅读笔记" : ""}${highlights ? "与 PDF 批注" : ""}` : hasNotes ? "标题、摘要与 Markdown 阅读笔记" : abstract ? "标题与摘要" : "论文元数据；证据有限";
    const material = `标题：${paper.title}\n作者：${paper.authors.join(", ") || "未知"}\n会议/期刊：${paper.journal || paper.raw.venue || "未知"}\n年份：${paper.year || "未知"}\n摘要：${abstract || "未提供"}\n\n用户 Markdown 笔记（最高优先级线索）：\n${readingNote.slice(0, 18000)}\n\n文献记录中的高亮与笔记：\n${note.slice(0, 18000)}\n\nPDF 内嵌批注：\n${highlights.slice(0, 10000)}\n\nPDF 正文证据：\n${pdfText}`;
    return { material, extractionLevel, extractionLabel, contentHash: this.hashText(material) };
  }

  meaningfulReadingNotes(note) {
    const body = String(note || "").replace(/^---[\s\S]*?---/, "").replace(/^# .*$/m, "").replace(/## (摘要|高亮与摘录|我的笔记|待办)/g, "").replace(/- \[ \]/g, "").trim();
    return body.length > 120;
  }

  selectPdfEvidence(text) {
    const source = String(text || "");
    if (!source || source.length <= 70000) return source;
    const windows = [source.slice(0, 26000), source.slice(-16000)];
    const keywords = /(?:method|methodology|approach|experiment|evaluation|result|discussion|limitation|conclusion|方法|实验|评估|结果|讨论|局限|结论)/ig;
    const seen = new Set();
    for (const match of source.matchAll(keywords)) {
      const start = Math.max(0, match.index - 2200);
      const key = Math.floor(start / 4000);
      if (seen.has(key)) continue;
      seen.add(key);
      windows.push(source.slice(start, start + 6500));
      if (windows.join("").length > 68000) break;
    }
    return windows.join("\n\n[…节选…]\n\n").slice(0, 72000);
  }

  async ensurePaperInsight(paper, force = false) {
    if (!this.isConfigured()) throw new Error("请先配置 AI 模型服务，再生成论文提炼");
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
          content: `你是严谨的论文研究提炼助手。只能依据用户提供的论文材料回答，不得虚构实验数字、数据集、开源地址、作者观点或相关研究。证据不足时必须明确写“材料中未说明”。回答要具体、清楚、适合研究者复核。只返回 JSON 对象，不要 Markdown 代码块。\n\n必须逐一回答十个问题：\nQ1 论文试图解决什么问题？\nQ2 这是否是一个新的问题？\nQ3 这篇文章要验证一个什么科学假设？\nQ4 有哪些相关研究？如何归类？谁是这一领域内值得关注的研究员？\nQ5 论文中提到的解决方案之关键是什么？\nQ6 论文中的实验是如何设计的？\nQ7 用于定量评估的数据集是什么？代码有没有开源？\nQ8 论文中的实验及结果有没有很好地支持需要验证的科学假设？\nQ9 这篇论文到底有什么贡献？\nQ10 下一步呢？有什么工作可以继续深入？\n\nJSON 格式：{"answers":{"q1":string,"q2":string,"q3":string,"q4":string,"q5":string,"q6":string,"q7":string,"q8":string,"q9":string,"q10":string},"taxonomy":{"primaryTopic":string,"subtopics":string[],"methods":string[],"tasks":string[],"datasets":string[],"confidence":0-100},"candidates":[{"id":string,"type":"finding|method|question|gap|conflict|hypothesis|decision","title":string,"summary":string,"nextAction":string}]}。primaryTopic 只能有一个；subtopics 2至4个；methods 最多3个；tasks 最多2个；candidates 最多3条。`
        },
        { role: "user", content: `生成依据等级：${context.extractionLabel}\n\n${context.material}` }
      ], { json: true, thinking: true, maxTokens: 5200 });
      const parsed = this.parseJsonResponse(response, "AI 返回的论文提炼无法解析");
      if (!parsed.answers || typeof parsed.answers !== "object") throw new Error("论文提炼缺少十问答案");
      return this.plugin.store.savePaperInsight(paper, {
        answers: parsed.answers,
        taxonomy: parsed.taxonomy || {},
        candidates: parsed.candidates || [],
        extractionLevel: context.extractionLevel,
        extractionLabel: context.extractionLabel,
        contentHash: context.contentHash,
        promptVersion: "paper-insight-v2",
        model: this.model()
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
    if (!papers.length) throw new Error("请先完成至少一篇论文的阅读");
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
        notes: note.slice(0, 5000),
        tenQuestionInsight: insight?.insightAnswers || null,
        taxonomy: insight ? { primaryTopic: insight.primaryTopic, subtopics: insight.subtopics, methods: insight.methods, tasks: insight.tasks } : null
      });
    }
    const content = await this.chat([
      {
        role: "system",
        content: "你是严谨的跨论文研究综合助手。基于用户已读论文的十问提炼和笔记，找出最多3条真正需要多篇论文共同支持的进展：共识、方法启发、研究问题、研究空白、证据冲突、研究假设或研究决策。不得虚构论文内容；材料不足时不要生成。每条必须说明跨论文关系和一个明确下一步。只返回JSON：{\"candidates\":[{\"title\":string,\"summary\":string,\"progressType\":\"finding|method|question|gap|conflict|hypothesis|decision\",\"nextAction\":string,\"papers\":[{\"path\":string,\"role\":\"support|oppose|inspiration|background|verify\"}]}]}"
      },
      { role: "user", content: JSON.stringify(materials) }
    ], { json: true, thinking: true, maxTokens: 2400 });
    let parsed;
    try { parsed = JSON.parse(content); } catch { throw new Error("AI 返回的研究进展建议无法解析"); }
    const validPaths = new Set(papers.map(paper => paper.path));
    return (parsed.candidates || []).slice(0, 3).map(candidate => ({
      title: String(candidate.title || "").trim(),
      summary: String(candidate.summary || "").trim(),
      progressType: ["finding", "method", "question", "gap", "conflict", "hypothesis", "decision"].includes(candidate.progressType) ? candidate.progressType : "finding",
      nextAction: String(candidate.nextAction || "").trim(),
      papers: (candidate.papers || []).filter(paper => validPaths.has(paper.path))
    })).filter(candidate => candidate.title && candidate.summary);
  }

  async synthesizeResearchProgress(papers, goal = "") {
    if (!this.isConfigured()) throw new Error("请先配置 AI 模型服务");
    if (!Array.isArray(papers) || papers.length < 2) throw new Error("请至少选择两篇论文");
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
        content: `你是严谨的跨论文研究综合助手。根据用户选定论文的十问提炼，围绕研究目标形成一份可以继续推进研究的阶段性结论。不得补造论文信息；材料不足必须明确说明。不要逐篇复述，要比较论文之间的共识、差异、冲突和证据缺口。每条关键判断使用 [P1]、[P2] 形式标注来源。只返回 JSON，不要 Markdown 代码块。\n\n返回结构：{"topic":string,"title":string,"sections":{"conclusion":string,"consensus":string,"conflicts":string,"methods":string,"gaps":string,"nextSteps":string},"evidence":[{"claim":string,"paperPaths":string[],"role":"support|oppose|background|method","confidence":0-100}],"classification":{"primaryTopic":string,"subtopics":string[]}}。六个 sections 必须全部填写；nextSteps 要从前述空白或冲突推导，不得泛泛而谈。`
      },
      {
        role: "user",
        content: `研究目标：${goal.trim() || "请识别这些论文共同研究的核心问题，并总结当前进展"}\n\n论文编号映射：\n${materials.map((paper, index) => `[P${index + 1}] ${paper.path} — ${paper.title}`).join("\n")}\n\n结构化材料：\n${JSON.stringify(materials)}`
      }
    ], { json: true, thinking: true, maxTokens: 5200 });
    const parsed = this.parseJsonResponse(response, "AI 返回的综合进展无法解析");
    if (!parsed.sections?.conclusion) throw new Error("AI 综合结果缺少当前结论");
    const validPaths = new Set(selected.map(paper => paper.path));
    parsed.evidence = (parsed.evidence || []).map(item => ({
      claim: String(item.claim || "").trim(),
      paperPaths: (item.paperPaths || []).filter(path => validPaths.has(path)),
      role: ["support", "oppose", "background", "method"].includes(item.role) ? item.role : "support",
      confidence: Math.max(0, Math.min(100, Number(item.confidence || 0)))
    })).filter(item => item.claim && item.paperPaths.length);
    return parsed;
  }

  async repairPaperMetadata(paper) {
    if (!this.isConfigured()) throw new Error("请先配置 AI 模型服务");
    let pdf;
    try { pdf = await this.plugin.store.extractPdfEvidence(paper, 8); } catch { pdf = { text: "" }; }
    const currentNote = await this.app.vault.read(paper.file);
    const response = await this.chat([
      { role: "system", content: "你是论文书目信息整理助手。只依据给定 PDF 首页正文和现有笔记识别书目信息，不确定则留空。标题必须是论文真实标题，不能返回文件编号。摘要应忠实概括原文，不得虚构。只返回 JSON：{\"title\":string,\"authors\":string[],\"year\":string,\"journal\":string,\"abstract\":string}。" },
      { role: "user", content: `当前文件名：${paper.file.basename}\n当前标题：${paper.title}\n\nPDF 前部正文：\n${String(pdf.text || "").slice(0, 26000)}\n\n现有文献笔记：\n${currentNote.slice(0, 8000)}` }
    ], { json: true, thinking: false, maxTokens: 1800 });
    const metadata = this.parseJsonResponse(response, "AI 返回的文献信息无法解析");
    if (!metadata.title) throw new Error("没有从 PDF 中识别出可靠标题");
    return {
      title: String(metadata.title || "").trim(),
      authors: Array.isArray(metadata.authors) ? metadata.authors.map(String).filter(Boolean) : String(metadata.authors || "").split(/[,，;；]/).map(value => value.trim()).filter(Boolean),
      year: String(metadata.year || "").trim(),
      journal: String(metadata.journal || "").trim(),
      abstract: String(metadata.abstract || "").trim()
    };
  }

  async organizeLibraryTaxonomy() {
    if (!this.isConfigured()) throw new Error("请先配置 AI 模型服务");
    await this.plugin.store.load();
    const papers = this.plugin.store.byType("literature");
    if (!papers.length) return [];
    const materials = papers.map(paper => {
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
        content: `你负责整理一个完整论文库，而不是逐篇命名。先比较所有论文的研究对象、任务和方法，再建立稳定的两级目录。当前有 ${papers.length} 篇论文，一级主题最多 ${maxTopics} 个。一级主题必须是宽泛且可复用的研究领域，例如“智能体安全”“多智能体系统”“模型可解释性”“检索增强生成”，绝不能是论文标题、具体方法名或一句研究问题。相近中英文概念必须合并。信息不足时统一归入“待识别”。\n\n你必须先创建 clusters，再把论文路径放进 cluster.paperPaths；每篇论文只能出现一次。一级主题名称统一使用中文 4–8 个字。只返回 JSON：{"clusters":[{"id":"T1","name":string,"description":string,"paperPaths":string[]}],"paperDetails":[{"path":string,"subtopics":string[],"methods":string[],"confidence":0-100}]}。不要让 paperDetails 自己填写一级主题。`
      },
      { role: "user", content: JSON.stringify(materials) }
    ], { json: true, thinking: true, maxTokens: 3600 });
    const parsed = this.parseJsonResponse(response, "AI 返回的文献聚类无法解析");
    const validPaths = new Set(papers.map(paper => paper.path));
    const details = new Map((parsed.paperDetails || []).filter(item => validPaths.has(item.path)).map(item => [item.path, item]));
    const topicByPath = new Map();
    (parsed.clusters || []).slice(0, maxTopics).forEach(cluster => {
      const name = this.normalizeLibraryTopic(cluster.name);
      (cluster.paperPaths || []).filter(path => validPaths.has(path)).forEach(path => {
        if (!topicByPath.has(path)) topicByPath.set(path, name);
      });
    });
    const assignments = papers.map(paper => {
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
    if (/agent.*safety|agent.*安全|agentic.*safety|智能体.*安全|safety.*alignment|安全.*对齐|模型.*安全/.test(lower)) return "AI安全与对齐";
    if (/multi.?agent|多智能体|agent.*协作|智能体.*协作/.test(lower)) return "多智能体系统";
    if (/sparse autoencoder|interpret|可解释|机理解释|特征解释/.test(lower)) return "模型可解释性";
    if (/retrieval|\brag\b|检索增强/.test(lower)) return "检索增强生成";
    if (/alignment|模型对齐|语言模型安全/.test(lower)) return "AI安全与对齐";
    if (!topic || /未知|未明确|未分类|论文编号|未提供/.test(topic) || topic.length > 12 || /[:：]/.test(topic)) return "待识别";
    return topic;
  }

  fallbackLibraryTopic(paper) {
    const text = [paper.title, paper.raw.abstract, ...paper.subtopics, ...paper.methods].join(" ").toLowerCase();
    if (/agentharm|jailbreak|agentic safety|agent safety|agentalign|policy.?align|safety alignment|model alignment|智能体安全|模型安全/.test(text)) return "AI安全与对齐";
    if (/multi.?agent|autogen|collaboration|competition|coordination|多智能体/.test(text)) return "多智能体系统";
    if (/sparse autoencoder|saeverbalizer|interpretability|可解释/.test(text)) return "模型可解释性";
    if (/retrieval.augmented|\brag\b|parliamentrag|检索增强/.test(text)) return "检索增强生成";
    return "待识别";
  }

  async saveChatToNote(item, question, answer) {
    const text = `\n\n### ${new Date().toLocaleString()}\n\n**问：** ${question}\n\n**AI：** ${answer}\n`;
    const target = this.resolveReadingNote(item) || item.file;
    const current = await this.app.vault.read(target);
    if (current.includes("## AI 对话沉淀")) await this.app.vault.modify(target, current + text);
    else await this.app.vault.modify(target, current.trimEnd() + "\n\n## AI 对话沉淀\n" + text);
  }

  resolveReadingNote(item) {
    if (!item.readingNote) return item.file;
    const clean = String(item.readingNote).replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
    const file = this.app.metadataCache.getFirstLinkpathDest(clean, item.file.path) || this.app.vault.getAbstractFileByPath(clean);
    return file instanceof TFile ? file : item.file;
  }

  resolveReadingNotes(item) {
    const values = item.readingNotes?.length ? item.readingNotes : item.readingNote ? [item.readingNote] : [];
    return values.map(value => {
      const clean = String(value).replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
      return this.app.metadataCache.getFirstLinkpathDest(clean, item.file.path) || this.app.vault.getAbstractFileByPath(clean);
    }).filter(file => file instanceof TFile);
  }

  async readingNotesContext(item, maxChars = 30000) {
    const files = this.resolveReadingNotes(item);
    const chunks = [];
    let used = 0;
    for (const file of files) {
      const text = await this.app.vault.read(file);
      const allowance = Math.max(0, maxChars - used);
      if (!allowance) break;
      const excerpt = text.slice(0, allowance);
      chunks.push(`\n[${file.basename}]\n${excerpt}`);
      used += excerpt.length;
    }
    return chunks.join("\n");
  }
}

class ResearchAISettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this; containerEl.empty();
    containerEl.createEl("h1", { text: "Research OS 设置" });
    renderThemeSettings(containerEl, this.plugin, () => this.display());
    containerEl.createEl("h2", { text: "AI 模型服务" });
    containerEl.createEl("p", { text: "支持 DeepSeek、OpenAI/GPT、Kimi/Moonshot、OpenRouter、硅基流动、智谱 GLM、Anthropic Claude，以及其他 OpenAI 兼容接口。API Key 仅保存在本机插件 data.json，不写入文献笔记。" });
    new Setting(containerEl).setName("模型服务").setDesc("切换后会自动填入该服务的默认 Base URL 和模型名").addDropdown(dropdown => dropdown
      .addOptions(Object.fromEntries(Object.entries(AI_PROVIDERS).map(([id, provider]) => [id, provider.name])))
      .setValue(this.plugin.ai.settings.aiProvider).onChange(async value => {
        await this.plugin.ai.setProvider(value);
        this.display();
      }));
    new Setting(containerEl).setName("API Key").setDesc(`填写 ${this.plugin.ai.providerName()} 的 API Key`).addText(text => {
      text.inputEl.type = "password"; text.setPlaceholder("sk-...").setValue(this.plugin.ai.settings.aiApiKey).onChange(async value => { this.plugin.ai.settings.aiApiKey = value.trim(); await this.plugin.ai.save(); });
    });
    new Setting(containerEl).setName("Base URL").setDesc("必须是 OpenAI-compatible 接口地址，不要包含 /chat/completions").addText(text => text
      .setPlaceholder("https://api.example.com/v1")
      .setValue(this.plugin.ai.baseUrl())
      .onChange(async value => { this.plugin.ai.settings.aiBaseUrl = value.trim(); await this.plugin.ai.save(); }));
    const providerModels = this.plugin.ai.provider().models || {};
    if (Object.keys(providerModels).length) {
      new Setting(containerEl).setName("模型").addDropdown(dropdown => dropdown
        .addOptions(providerModels)
        .setValue(this.plugin.ai.model()).onChange(async value => { this.plugin.ai.settings.aiModel = value; await this.plugin.ai.save(); }));
    }
    new Setting(containerEl).setName("自定义模型名").setDesc("如果下拉里没有你的模型，在这里填写会覆盖上面的选择").addText(text => text
      .setPlaceholder("model-name")
      .setValue(this.plugin.ai.settings.aiModel)
      .onChange(async value => { this.plugin.ai.settings.aiModel = value.trim(); await this.plugin.ai.save(); }));
    new Setting(containerEl).setName("测试连接").addButton(button => button.setButtonText("测试").onClick(async () => {
      button.setDisabled(true); try { await this.plugin.ai.testConnection(); new Notice(`${this.plugin.ai.providerName()} 连接成功`); } catch (e) { new Notice(e.message, 8000); } finally { button.setDisabled(false); }
    }));
    new Setting(containerEl).setName("每周自动发现").addToggle(toggle => toggle.setValue(this.plugin.ai.settings.weeklyEnabled).onChange(async value => { this.plugin.ai.settings.weeklyEnabled = value; await this.plugin.ai.save(); }));
    new Setting(containerEl).setName("自动生成论文十问提炼").setDesc("导入论文后自动生成；已有论文会在后台补齐缺失提炼。").addToggle(toggle => toggle.setValue(this.plugin.ai.settings.autoInsightEnabled).onChange(async value => { this.plugin.ai.settings.autoInsightEnabled = value; await this.plugin.ai.save(); }));
    new Setting(containerEl).setName("每周推荐上限").addSlider(slider => slider.setLimits(3,20,1).setValue(this.plugin.ai.settings.weeklyLimit).setDynamicTooltip().onChange(async value => { this.plugin.ai.settings.weeklyLimit = value; await this.plugin.ai.save(); }));
    new Setting(containerEl).setName("关注主题").setDesc("使用英文逗号分隔").addTextArea(area => area.setValue(this.plugin.ai.settings.interests).onChange(async value => { this.plugin.ai.settings.interests = value; await this.plugin.ai.save(); }));
  }
}

module.exports = { AIService, ResearchAISettingTab, DEFAULT_AI_SETTINGS };
