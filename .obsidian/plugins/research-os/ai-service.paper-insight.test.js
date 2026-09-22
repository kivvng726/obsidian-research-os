const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") {
    return { PluginSettingTab: class {}, Setting: class {}, Notice: class {}, requestUrl: async () => ({}), TFile: class {} };
  }
  if (request === "./theme-settings") return { renderThemeSettings: () => {} };
  return originalLoad.call(this, request, parent, isMain);
};

const { AIService } = require("./ai-service");
Module._load = originalLoad;
const service = Object.create(AIService.prototype);

const full = JSON.stringify({
  answers: { q1: "A complete answer", q2: "Another answer" },
  taxonomy: { primaryTopic: "Testing", subtopics: ["Parser"], confidence: 81 },
  candidates: [{ id: "c1" }]
});

assert.equal(service.parsePaperInsightResponse(full).answers.q1, "A complete answer");
assert.equal(service.parsePaperInsightResponse(`\`\`\`json\n${full}\n\`\`\``).taxonomy.primaryTopic, "Testing");
assert.equal(service.parsePaperInsightResponse(`Here is the result:\n${full}\nEnd.`).candidates[0].id, "c1");

const newline = '{"answers":{"q1":"first line\nsecond line"},"taxonomy":{}}';
assert.equal(service.parsePaperInsightResponse(newline).answers.q1, "first line\nsecond line");

const controlCharacter = '{"answers":{"q1":"contains ' + String.fromCharCode(1) + ' control"}}';
assert.equal(service.parsePaperInsightResponse(controlCharacter).answers.q1, "contains \u0001 control");

const truncated = '{"answers":{"q1":"one","q2":"two","q3":"unfinished';
const partial = service.parsePaperInsightResponse(truncated);
assert.equal(partial.answers.q1, "one");
assert.equal(partial.answers.q2, "two");
assert.equal(partial.answers.q4, "材料中未说明。");
assert.equal(partial.taxonomy.primaryTopic, "未分类");

const missingTaxonomy = service.parsePaperInsightResponse('{"answers":{"q1":"preserved"}}');
assert.equal(missingTaxonomy.answers.q1, "preserved");
assert.equal(missingTaxonomy.taxonomy.primaryTopic, "未分类");

const partialArray = '{"answers":[{"q1":"array one"},{"q2":"array two"}';
const arrayRecovery = service.parsePaperInsightResponse(partialArray);
assert.equal(arrayRecovery.answers.q1, "array one");
assert.equal(arrayRecovery.answers.q2, "array two");

assert.throws(() => service.parsePaperInsightResponse(""), /无法解析/);
assert.throws(() => service.parsePaperInsightResponse("This is ordinary prose without insight JSON."), /无法解析/);

const goldenLike = 'Model note before JSON\n```json\n{"answers":{"q1":"Evidence-backed finding","q2":"Partial result"},"taxonomy":{"primaryTopic":"AI safety","methods":["evaluation"],"confidence":70},\n```';
const goldenRecovery = service.parsePaperInsightResponse(goldenLike);
assert.equal(goldenRecovery.answers.q1, "Evidence-backed finding");
assert.equal(goldenRecovery.taxonomy.primaryTopic, "AI safety");

console.log("ai-service Paper Insight parsing tests passed");
