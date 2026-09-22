const assert = require("node:assert/strict");
const Module = require("node:module");

class TFile {
  constructor(path, content = "") {
    this.path = path;
    this.name = path.split("/").pop();
    this.extension = this.name.split(".").pop();
    this.content = content;
    this.stat = { size: content.length, mtime: 1 };
  }
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { TFile };
  return originalLoad.call(this, request, parent, isMain);
};
const { ThemeService, FOREST_THEME_ID, CUSTOM_THEME_ID } = require("./theme-service");
Module._load = originalLoad;

function customTheme(backgroundPath = "09 Attachments/Research OS Themes/custom-background.jpg") {
  return {
    id: CUSTOM_THEME_ID,
    backgroundPath,
    controls: {},
    tokens: {
      "--skin-sidebar": "#123456",
      "--skin-surface": "#234567",
      "--skin-surface-hover": "#345678",
      "--skin-border": "#456789",
      "--skin-border-strong": "#56789a",
      "--skin-text": "#ffffff",
      "--skin-text-secondary": "#eeeeee",
      "--skin-text-muted": "#cccccc",
      "--skin-accent": "#abcdef",
      "--skin-accent-soft": "#789abc"
    }
  };
}

function createVault(files = {}) {
  const entries = new Map();
  const folders = new Map();
  for (const [path, content] of Object.entries(files)) entries.set(path, new TFile(path, content));
  return {
    entries,
    getAbstractFileByPath(path) { return entries.get(path) || folders.get(path) || null; },
    async read(file) { return file.content; },
    async create(path, content) { const file = new TFile(path, content); entries.set(path, file); return file; },
    async modify(file, content) { file.content = content; file.stat.size = content.length; },
    async createFolder(path) { folders.set(path, { path, children: [] }); },
    getResourcePath(file) { return `resource://${file.path}`; },
    adapter: { getResourcePath: path => `resource://${path}` }
  };
}

function createPlugin(vault, settings = {}) {
  return {
    app: { vault },
    ai: { settings, saveCalls: 0, async save() { this.saveCalls++; } },
    refreshViews() {}
  };
}

function createRoot() {
  const classes = new Set();
  const tokens = new Map();
  return {
    classes,
    addClass(name) { classes.add(name); },
    removeClass(name) { classes.delete(name); },
    style: { setProperty: (name, value) => tokens.set(name, value), removeProperty: name => tokens.delete(name) }
  };
}

async function initialize(settings = {}, files = {}) {
  const vault = createVault(files);
  const plugin = createPlugin(vault, settings);
  const service = new ThemeService(plugin);
  await service.initialize();
  return { vault, plugin, service };
}

const priorDocument = global.document;
global.document = { body: { style: { setProperty() {} } } };

(async () => {
  const empty = await initialize();
  assert.equal(empty.service.activeThemeId, FOREST_THEME_ID);

  const pluginDataTheme = customTheme("missing-background.jpg");
  const fromPluginData = await initialize({ activeThemeId: CUSTOM_THEME_ID, customTheme: pluginDataTheme });
  assert.equal(fromPluginData.service.resolveTheme(), pluginDataTheme);

  const externalTheme = customTheme();
  const persistedPath = "09 Attachments/.research-os-theme.json";
  const fromExternal = await initialize({}, { [persistedPath]: JSON.stringify({ activeThemeId: CUSTOM_THEME_ID, customTheme: externalTheme }) });
  assert.equal(fromExternal.service.activeThemeId, CUSTOM_THEME_ID);
  assert.deepEqual(fromExternal.service.customTheme, externalTheme);

  const externalWins = await initialize({ activeThemeId: FOREST_THEME_ID, customTheme: customTheme("plugin.jpg") }, { [persistedPath]: JSON.stringify({ activeThemeId: CUSTOM_THEME_ID, customTheme: externalTheme }) });
  assert.equal(externalWins.service.activeThemeId, CUSTOM_THEME_ID);
  assert.deepEqual(externalWins.service.customTheme, externalTheme);

  const customRoot = createRoot();
  fromPluginData.service.applyTo(customRoot);
  assert.ok(customRoot.classes.has("ros-theme-custom"));
  assert.ok(!customRoot.classes.has("ros-skin-forest"));
  assert.ok(!customRoot.classes.has("ros-skin-crt"));
  fromPluginData.service.applyTo(customRoot);
  assert.equal(customRoot.classes.size, 1);

  const forestRoot = createRoot();
  empty.service.applyTo(forestRoot);
  assert.ok(forestRoot.classes.has("ros-skin-forest"));
  assert.ok(!forestRoot.classes.has("ros-theme-custom"));

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  const damaged = await initialize({}, { [persistedPath]: "{bad json" });
  console.warn = originalWarn;
  assert.equal(damaged.service.activeThemeId, FOREST_THEME_ID);
  assert.ok(warnings.length > 0);

  const roundTripVault = createVault();
  const first = new ThemeService(createPlugin(roundTripVault, { activeThemeId: CUSTOM_THEME_ID, customTheme: externalTheme }));
  await first.persist();
  const second = new ThemeService(createPlugin(roundTripVault, {}));
  await second.initialize();
  assert.equal(second.activeThemeId, CUSTOM_THEME_ID);
  assert.deepEqual(second.customTheme, externalTheme);

  global.document = priorDocument;
  console.log("theme-service persistence tests passed");
})().catch(error => {
  global.document = priorDocument;
  throw error;
});
