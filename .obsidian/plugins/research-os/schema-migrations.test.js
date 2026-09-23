const assert = require("node:assert/strict");
const {
  PAPER_SCHEMA_VERSION,
  PLUGIN_DATA_SCHEMA_VERSION,
  getPaperSchemaVersion,
  getPluginDataSchemaVersion,
  planPaperMigration,
  planPluginDataMigration,
  migratePaperData,
  migratePluginData,
  normalizePluginData
} = require("./schema-migrations");
const { normalizePaper } = require("./paper-model");

assert.equal(PAPER_SCHEMA_VERSION, 1);
assert.equal(PLUGIN_DATA_SCHEMA_VERSION, 1);
assert.equal(getPaperSchemaVersion({}), 0);
assert.equal(getPaperSchemaVersion({ schema_version: 1 }), 1);
assert.equal(getPaperSchemaVersion({ schema_version: "1" }), 1);
assert.equal(getPaperSchemaVersion({ schema_version: "unknown" }), 0);
assert.equal(getPaperSchemaVersion({ schema_version: -1 }), 0);

const legacyPaper = { title: "Legacy", category: "Topic", nested: { keep: true } };
const paperPlan = planPaperMigration(legacyPaper);
assert.deepEqual(paperPlan, { fromVersion: 0, toVersion: 1, steps: [{ from: 0, to: 1 }], needsMigration: true });
const migratedPaper = migratePaperData(legacyPaper);
assert.notEqual(migratedPaper, legacyPaper);
assert.equal(legacyPaper.schema_version, undefined);
assert.equal(migratedPaper.schema_version, 1);
assert.equal(migratedPaper.category, "Topic");
assert.equal(migratedPaper.nested, legacyPaper.nested);
assert.deepEqual(migratePaperData(migratedPaper), migratedPaper);

const paperItem = { path: "03 Literature/Legacy.md", name: "Legacy", type: "literature", raw: legacyPaper };
assert.equal(normalizePaper(paperItem).schemaVersion, 0);
assert.equal(normalizePaper({ ...paperItem, raw: migratedPaper }).schemaVersion, 1);

assert.equal(getPluginDataSchemaVersion({}), 0);
assert.equal(getPluginDataSchemaVersion({ schema_version: "1" }), 1);
assert.equal(getPluginDataSchemaVersion({ schema_version: {} }), 0);
const legacyPluginData = { aiApiKey: "keep-secret", activeThemeId: "forest-original", chats: { a: [] } };
assert.deepEqual(planPluginDataMigration(legacyPluginData).steps, [{ from: 0, to: 1 }]);
const migratedPluginData = migratePluginData(legacyPluginData);
assert.notEqual(migratedPluginData, legacyPluginData);
assert.equal(legacyPluginData.schema_version, undefined);
assert.equal(migratedPluginData.schema_version, 1);
assert.equal(migratedPluginData.aiApiKey, "keep-secret");
assert.equal(migratedPluginData.activeThemeId, "forest-original");
assert.equal(migratedPluginData.chats, legacyPluginData.chats);
assert.deepEqual(migratePluginData(migratedPluginData), migratedPluginData);

const normalizedPluginData = normalizePluginData(legacyPluginData);
assert.equal(normalizedPluginData.schemaVersion, 0);
assert.equal(normalizedPluginData.data.schema_version, undefined);
assert.notEqual(normalizedPluginData.data, legacyPluginData);
assert.equal(normalizedPluginData.data.aiApiKey, "keep-secret");

console.log("schema migration tests passed");
