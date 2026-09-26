const assert = require("node:assert/strict");
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { Setting: class {}, Notice: class {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { DEFAULT_RESEARCH_AI_SETTINGS, EMBEDDING_PRESETS, CHAT_PRESETS, normalizeResearchAISettings } = require("./research-ai-settings");
Module._load = originalLoad;

const defaults = normalizeResearchAISettings(null);
assert.equal(defaults.backendUrl, "http://127.0.0.1:8765");
assert.equal(defaults.embedding.model, "qwen3.7-text-embedding-flash");
assert.equal(defaults.embedding.dimensions, 1024);
assert.equal(defaults.chat.model, "deepseek-chat");
assert.deepEqual(EMBEDDING_PRESETS.qwen, { baseUrl: "https://maas.qianwenaiapi.com/compatible-mode/v1", model: "qwen3.7-text-embedding-flash", dimensions: 1024 });
assert.deepEqual(CHAT_PRESETS.deepseek, { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" });
const custom = normalizeResearchAISettings({ backendUrl: "http://127.0.0.1:9000", embedding: { provider: "custom", apiKey: "fake-key", baseUrl: "https://embed.example/v1", model: "e", dimensions: "3" }, chat: { provider: "custom", apiKey: "fake-key", baseUrl: "https://chat.example", model: "c" } });
assert.equal(custom.embedding.provider, "custom"); assert.equal(custom.embedding.dimensions, 3); assert.equal(custom.chat.model, "c");
assert.equal(DEFAULT_RESEARCH_AI_SETTINGS.embedding.apiKey, "");
console.log("research AI settings tests passed");
