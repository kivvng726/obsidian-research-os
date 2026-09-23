const PAPER_SCHEMA_VERSION = 1;
const PLUGIN_DATA_SCHEMA_VERSION = 1;

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseSchemaVersion(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return 0;
}

function getPaperSchemaVersion(raw) {
  return parseSchemaVersion(asObject(raw).schema_version);
}

function getPluginDataSchemaVersion(raw) {
  return parseSchemaVersion(asObject(raw).schema_version);
}

function planMigration(version, targetVersion) {
  const fromVersion = Number(version) || 0;
  const steps = [];
  for (let current = fromVersion; current < targetVersion; current++) {
    if (current === 0) steps.push({ from: 0, to: 1 });
  }
  return { fromVersion, toVersion: targetVersion, steps, needsMigration: steps.length > 0 };
}

function planPaperMigration(raw, targetVersion = PAPER_SCHEMA_VERSION) {
  return planMigration(getPaperSchemaVersion(raw), targetVersion);
}

function planPluginDataMigration(raw, targetVersion = PLUGIN_DATA_SCHEMA_VERSION) {
  return planMigration(getPluginDataSchemaVersion(raw), targetVersion);
}

function applyMigration(raw, plan) {
  const migrated = { ...asObject(raw) };
  for (const step of plan.steps) {
    if (step.from === 0 && step.to === 1) migrated.schema_version = 1;
  }
  return migrated;
}

function migratePaperData(raw, targetVersion = PAPER_SCHEMA_VERSION) {
  return applyMigration(raw, planPaperMigration(raw, targetVersion));
}

function migratePluginData(raw, targetVersion = PLUGIN_DATA_SCHEMA_VERSION) {
  return applyMigration(raw, planPluginDataMigration(raw, targetVersion));
}

function normalizePluginData(raw) {
  const data = { ...asObject(raw) };
  return {
    data,
    schemaVersion: getPluginDataSchemaVersion(data),
    migrationPlan: planPluginDataMigration(data)
  };
}

module.exports = {
  PAPER_SCHEMA_VERSION,
  PLUGIN_DATA_SCHEMA_VERSION,
  getPaperSchemaVersion,
  getPluginDataSchemaVersion,
  planPaperMigration,
  planPluginDataMigration,
  migratePaperData,
  migratePluginData,
  normalizePluginData
};
