const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { PluginSettingTab: class {}, Setting: class {}, Notice: class {}, requestUrl: async () => ({}), TFile: class {} };
  if (request === "./theme-settings") return { renderThemeSettings: () => {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { AIService } = require("./ai-service");
Module._load = originalLoad;
const service = Object.create(AIService.prototype);

const standard = service.normalizeSynthesisResult({
  topic: "Reliable parsing",
  title: "Synthesis title",
  sections: { conclusion: "A supported conclusion", consensus: "Agreement", conflicts: "Conflict", methods: "Method", gaps: "Gap", nextSteps: "Next" },
  classification: { primaryTopic: "Testing" }
});
assert.equal(standard.sections.conclusion, "A supported conclusion");
assert.equal(standard.title, "Synthesis title");

assert.equal(service.normalizeSynthesisResult({ summary: "Summary fallback" }).sections.conclusion, "Summary fallback");
assert.equal(service.normalizeSynthesisResult({ currentConclusion: "Current conclusion" }).sections.conclusion, "Current conclusion");
assert.equal(service.normalizeSynthesisResult({ sections: { "当前结论": "中文结论", "共识": "中文共识", "冲突": "中文冲突", "方法": "中文方法", "研究空白": "中文空白", "下一步": "中文下一步" } }).sections.nextSteps, "中文下一步");
assert.equal(service.normalizeSynthesisResult({ sections: { agreement: "Old agreement", differences: "Old differences", methodInsights: "Old methods", openQuestions: "Old gaps", futureWork: "Old next" } }).sections.gaps, "Old gaps");

const fallback = service.normalizeSynthesisResult({ sections: { conclusion: "Fallback conclusion" } });
assert.equal(fallback.title, "Fallback conclusion");
assert.equal(fallback.topic, "Fallback conclusion");
assert.equal(service.normalizeSynthesisResult({}).topic, "阶段性研究进展");

const fenced = service.normalizeSynthesisResult(service.parseSynthesisResponse('```json\n{"summary":"Fenced result","classification":{"primaryTopic":"Parser"}}\n```'));
assert.equal(fenced.sections.conclusion, "Fenced result");
assert.equal(fenced.topic, "Parser");

const noisy = service.normalizeSynthesisResult(service.parseSynthesisResponse('Explanation before {"currentConclusion":"Extracted result"} trailing text'));
assert.equal(noisy.sections.conclusion, "Extracted result");

assert.throws(() => service.parseSynthesisResponse(""), /无法解析/);
assert.throws(() => service.parseSynthesisResponse("This is unrelated prose."), /无法解析/);

console.log("ai-service synthesis response tests passed");
