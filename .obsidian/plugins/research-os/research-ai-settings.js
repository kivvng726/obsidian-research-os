const { Setting, Notice } = require("obsidian");

const DEFAULT_RESEARCH_AI_SETTINGS = Object.freeze({
  backendUrl: "http://127.0.0.1:8765",
  embedding: Object.freeze({
    provider: "qwen",
    baseUrl: "https://maas.qianwenaiapi.com/compatible-mode/v1",
    apiKey: "",
    model: "qwen3.7-text-embedding-flash",
    dimensions: 1024
  }),
  chat: Object.freeze({
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    apiKey: "",
    model: "deepseek-chat"
  })
});

const EMBEDDING_PRESETS = {
  qwen: { baseUrl: "https://maas.qianwenaiapi.com/compatible-mode/v1", model: "qwen3.7-text-embedding-flash", dimensions: 1024 },
  custom: { baseUrl: "", model: "", dimensions: 1024 }
};

const CHAT_PRESETS = {
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  custom: { baseUrl: "", model: "" }
};

function text(value, fallback = "") { return typeof value === "string" ? value : fallback; }
function positiveInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }

function normalizeResearchAISettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const embedding = source.embedding && typeof source.embedding === "object" ? source.embedding : {};
  const chat = source.chat && typeof source.chat === "object" ? source.chat : {};
  return {
    backendUrl: text(source.backendUrl, DEFAULT_RESEARCH_AI_SETTINGS.backendUrl).trim() || DEFAULT_RESEARCH_AI_SETTINGS.backendUrl,
    embedding: {
      provider: text(embedding.provider, DEFAULT_RESEARCH_AI_SETTINGS.embedding.provider).trim() || "qwen",
      baseUrl: text(embedding.baseUrl, DEFAULT_RESEARCH_AI_SETTINGS.embedding.baseUrl).trim(),
      apiKey: text(embedding.apiKey).trim(),
      model: text(embedding.model, DEFAULT_RESEARCH_AI_SETTINGS.embedding.model).trim(),
      dimensions: positiveInteger(embedding.dimensions, DEFAULT_RESEARCH_AI_SETTINGS.embedding.dimensions)
    },
    chat: {
      provider: text(chat.provider, DEFAULT_RESEARCH_AI_SETTINGS.chat.provider).trim() || "deepseek",
      baseUrl: text(chat.baseUrl, DEFAULT_RESEARCH_AI_SETTINGS.chat.baseUrl).trim(),
      apiKey: text(chat.apiKey).trim(),
      model: text(chat.model, DEFAULT_RESEARCH_AI_SETTINGS.chat.model).trim()
    }
  };
}

async function updateResearchAISettings(plugin, patch) {
  const current = normalizeResearchAISettings(plugin.ai.settings.researchAI);
  plugin.ai.settings.researchAI = patch(current);
  await plugin.ai.save();
}

function configurePassword(textControl, value, onChange) {
  textControl.inputEl.type = "password";
  textControl.setPlaceholder("API key").setValue(value).onChange(onChange);
}

function renderResearchAISettings(containerEl, plugin, refresh) {
  const settings = normalizeResearchAISettings(plugin.ai.settings.researchAI);
  containerEl.createEl("h2", { text: "Research AI / Library AI" });
  containerEl.createEl("p", { text: "Vault files remain local, but text required for AI features is sent to the AI providers you configure. Embedding sends chunk text to the embedding provider; RAG sends your question and retrieved evidence to the chat provider." });
  containerEl.createEl("h3", { text: "Local Engine" });
  new Setting(containerEl).setName("Backend URL").setDesc("Local Research OS Engine address.").addText(control => control
    .setValue(settings.backendUrl).setPlaceholder(DEFAULT_RESEARCH_AI_SETTINGS.backendUrl)
    .onChange(async value => { await updateResearchAISettings(plugin, current => ({ ...current, backendUrl: value.trim() || DEFAULT_RESEARCH_AI_SETTINGS.backendUrl })); }));
  const engineStatus = new Setting(containerEl).setName("Engine Status").setDesc("Checking local Engine…");
  plugin.backendClient.healthCheck().then(async health => {
    if (!health.available) { engineStatus.setDesc("Not running"); return; }
    const compatibility = await plugin.backendClient.checkCompatibility();
    engineStatus.setDesc(compatibility.compatible ? "Connected and API compatible" : "Connected, but API is not compatible");
  }).catch(() => engineStatus.setDesc("Not running"));
  new Setting(containerEl).setName("Test Engine").setDesc("Checks the local Engine and API compatibility.").addButton(button => button.setButtonText("Test Engine").onClick(async () => {
    button.setDisabled(true);
    try {
      const health = await plugin.backendClient.healthCheck();
      const compatibility = await plugin.backendClient.checkCompatibility();
      if (!health.available || !compatibility.available) throw new Error("Research OS Engine is not running.");
      if (!compatibility.compatible) throw new Error("Research OS Engine API is not compatible.");
      new Notice(`Research OS Engine connected (${compatibility.backendVersion})`);
    } catch (error) { new Notice(error.message || "Research OS Engine is not running.", 7000); }
    finally { button.setDisabled(false); }
  }));

  containerEl.createEl("h3", { text: "Embedding" });
  new Setting(containerEl).setName("Provider").addDropdown(control => control.addOptions({ qwen: "Qwen", custom: "OpenAI Compatible / Custom" })
    .setValue(settings.embedding.provider).onChange(async provider => {
      await updateResearchAISettings(plugin, current => ({ ...current, embedding: { ...current.embedding, provider, ...(EMBEDDING_PRESETS[provider] || {}) } })); refresh();
    }));
  new Setting(containerEl).setName("API Key").setDesc("Stored locally in this plugin's Obsidian settings.").addText(control => configurePassword(control, settings.embedding.apiKey, async value => {
    await updateResearchAISettings(plugin, current => ({ ...current, embedding: { ...current.embedding, apiKey: value.trim() } }));
  }));
  new Setting(containerEl).setName("Base URL").addText(control => control.setValue(settings.embedding.baseUrl).onChange(async value => {
    await updateResearchAISettings(plugin, current => ({ ...current, embedding: { ...current.embedding, baseUrl: value.trim() } }));
  }));
  new Setting(containerEl).setName("Model").addText(control => control.setValue(settings.embedding.model).onChange(async value => {
    await updateResearchAISettings(plugin, current => ({ ...current, embedding: { ...current.embedding, model: value.trim() } }));
  }));
  new Setting(containerEl).setName("Dimensions").addText(control => control.setValue(String(settings.embedding.dimensions)).onChange(async value => {
    await updateResearchAISettings(plugin, current => ({ ...current, embedding: { ...current.embedding, dimensions: positiveInteger(value, current.embedding.dimensions) } }));
  }));
  new Setting(containerEl).setName("Test Embedding").setDesc("Sends one short test text and does not index or save a vector.").addButton(button => button.setButtonText("Test Embedding").onClick(async () => {
    button.setDisabled(true); try { const result = await plugin.backendClient.testEmbedding(); new Notice(`Embedding connected (${result.model}, ${result.dimensions} dimensions)`); }
    catch (error) { new Notice(error.message || "Embedding provider is unavailable.", 7000); } finally { button.setDisabled(false); }
  }));

  containerEl.createEl("h3", { text: "Chat" });
  new Setting(containerEl).setName("Provider").addDropdown(control => control.addOptions({ deepseek: "DeepSeek", custom: "OpenAI Compatible / Custom" })
    .setValue(settings.chat.provider).onChange(async provider => {
      await updateResearchAISettings(plugin, current => ({ ...current, chat: { ...current.chat, provider, ...(CHAT_PRESETS[provider] || {}) } })); refresh();
    }));
  new Setting(containerEl).setName("API Key").setDesc("Stored locally in this plugin's Obsidian settings.").addText(control => configurePassword(control, settings.chat.apiKey, async value => {
    await updateResearchAISettings(plugin, current => ({ ...current, chat: { ...current.chat, apiKey: value.trim() } }));
  }));
  new Setting(containerEl).setName("Base URL").addText(control => control.setValue(settings.chat.baseUrl).onChange(async value => {
    await updateResearchAISettings(plugin, current => ({ ...current, chat: { ...current.chat, baseUrl: value.trim() } }));
  }));
  new Setting(containerEl).setName("Model").addText(control => control.setValue(settings.chat.model).onChange(async value => {
    await updateResearchAISettings(plugin, current => ({ ...current, chat: { ...current.chat, model: value.trim() } }));
  }));
  new Setting(containerEl).setName("Test Chat").setDesc("Sends a minimal connection check and does not create RAG history.").addButton(button => button.setButtonText("Test Chat").onClick(async () => {
    button.setDisabled(true); try { const result = await plugin.backendClient.testChat(); new Notice(`Chat connected (${result.model})`); }
    catch (error) { new Notice(error.message || "Chat provider is unavailable.", 7000); } finally { button.setDisabled(false); }
  }));
}

module.exports = { DEFAULT_RESEARCH_AI_SETTINGS, EMBEDDING_PRESETS, CHAT_PRESETS, normalizeResearchAISettings, renderResearchAISettings };
