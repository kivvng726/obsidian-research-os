const { TFile } = require("obsidian");
const { DEFAULT_CONTROLS, analyzePixels, generateTheme } = require("./theme-engine");

const FOREST_THEME_ID = "forest-original";
const CUSTOM_THEME_ID = "custom-dynamic";
const FOREST_ORIGINAL_THEME = Object.freeze({
  id: FOREST_THEME_ID,
  name: "森林原版",
  backgroundPath: "forest.jpg",
  protected: true
});

class ThemeService {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.previewTheme = null;
    this.persistencePath = "09 Attachments/.research-os-theme.json";
  }

  async initialize() {
    const settings = this.plugin.ai.settings;
    let changed = false;
    let restoredFromPersistence = false;
    // Keep theme state outside plugin data so reinstalling/updating the plugin
    // cannot reset a user's selected background.
    try {
      const persistedFile = this.app.vault.getAbstractFileByPath(this.persistencePath);
      if (persistedFile instanceof TFile) {
        const persisted = JSON.parse(await this.app.vault.read(persistedFile));
        restoredFromPersistence = true;
        if (persisted?.activeThemeId) settings.activeThemeId = persisted.activeThemeId;
        if (persisted?.customTheme) settings.customTheme = persisted.customTheme;
      }
    } catch (error) { console.warn("Research OS theme restore failed", error); }
    if (settings.customTheme?.backgroundPath) {
      const restoredPath = this.resolveStoredBackgroundPath(settings.customTheme.backgroundPath);
      if (restoredPath && restoredPath !== settings.customTheme.backgroundPath) {
        settings.customTheme = { ...settings.customTheme, backgroundPath: restoredPath };
        changed = true;
      }
    }
    if (!restoredFromPersistence && !settings.customTheme) {
      const fallback = this.findCustomBackgroundFile();
      if (fallback instanceof TFile) {
        settings.customTheme = await this.analyzePath(fallback.path);
        settings.activeThemeId = CUSTOM_THEME_ID;
        changed = true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(settings, "backgroundImagePath")) {
      delete settings.backgroundImagePath;
      changed = true;
    }
    if (![FOREST_THEME_ID, CUSTOM_THEME_ID].includes(settings.activeThemeId)) {
      settings.activeThemeId = FOREST_THEME_ID;
      changed = true;
    }
    if (settings.activeThemeId === CUSTOM_THEME_ID && (!this.isValidCustom(settings.customTheme)
      || !(this.app.vault.getAbstractFileByPath(settings.customTheme.backgroundPath) instanceof TFile))) {
      settings.activeThemeId = FOREST_THEME_ID;
      changed = true;
    }
    if (this.isValidCustom(settings.customTheme) && settings.customTheme.analysis
      && !settings.customTheme.tokens["--skin-on-accent"]) {
      const generated = generateTheme(settings.customTheme.analysis, settings.customTheme.controls);
      settings.customTheme = { ...settings.customTheme, ...generated };
      changed = true;
    }
    if (changed) await this.plugin.ai.save();
    await this.persist();
  }

  async persist() {
    try {
      const folder = this.persistencePath.split("/").slice(0, -1).join("/");
      if (!this.app.vault.getAbstractFileByPath(folder)) await this.ensureFolder(folder);
      const content = JSON.stringify({
        activeThemeId: this.plugin.ai.settings.activeThemeId,
        customTheme: this.plugin.ai.settings.customTheme || null
      });
      const existing = this.app.vault.getAbstractFileByPath(this.persistencePath);
      if (existing instanceof TFile) await this.app.vault.modify(existing, content);
      else await this.app.vault.create(this.persistencePath, content);
    } catch (error) { console.warn("Research OS theme persistence failed", error); }
  }

  isValidCustom(theme) {
    return Boolean(theme && theme.backgroundPath && theme.tokens && theme.controls);
  }

  resolveStoredBackgroundPath(path) {
    const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized && this.app.vault.getAbstractFileByPath(normalized) instanceof TFile) return normalized;
    const marker = "09 Attachments/Research OS Themes/";
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0) {
      const vaultPath = normalized.slice(markerIndex);
      if (this.app.vault.getAbstractFileByPath(vaultPath) instanceof TFile) return vaultPath;
    }
    const fallback = this.findCustomBackgroundFile();
    return fallback?.path || normalized;
  }

  findCustomBackgroundFile() {
    const folder = this.app.vault.getAbstractFileByPath("09 Attachments/Research OS Themes");
    return folder?.children?.find(file => file instanceof TFile && /^custom-background\./i.test(file.name)) || null;
  }

  get activeThemeId() { return this.plugin.ai.settings.activeThemeId || FOREST_THEME_ID; }
  get customTheme() { return this.plugin.ai.settings.customTheme || null; }
  get editingTheme() { return this.previewTheme || this.customTheme; }

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
      this.previewTheme = await this.analyzePath(path, { ...(current?.controls || DEFAULT_CONTROLS), locked: false });
    }
    // Persist the selected background immediately so it survives an Obsidian restart.
    // Further control adjustments remain a preview until the user clicks Apply.
    this.plugin.ai.settings.customTheme = this.previewTheme;
    this.plugin.ai.settings.activeThemeId = CUSTOM_THEME_ID;
    await this.plugin.ai.save();
    await this.persist();
    this.plugin.refreshViews();
    return this.previewTheme;
  }

  async analyzePath(path, controls = this.editingTheme?.controls || DEFAULT_CONTROLS) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error("找不到自定义背景图片");
    const bytes = await this.app.vault.readBinary(file);
    const canvas = document.createElement("canvas");
    canvas.width = 160; canvas.height = 100;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("当前环境无法分析图片颜色");
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
          element.onerror = () => reject(new Error("图片解码失败"));
          element.src = url;
        });
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      } finally { URL.revokeObjectURL(url); }
    }
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const analysis = analyzePixels(imageData.data, canvas.width, canvas.height);
    const generated = generateTheme(analysis, controls);
    return {
      id: CUSTOM_THEME_ID,
      name: "自定义动态皮肤",
      backgroundPath: path,
      imageHash: `${file.stat.size}:${file.stat.mtime}`,
      analysis,
      ...generated
    };
  }

  mimeFor(extension) {
    return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" })[String(extension).toLowerCase()] || "image/jpeg";
  }

  async reanalyze() {
    const source = this.editingTheme || this.customTheme;
    if (!source?.backgroundPath) throw new Error("请先选择自定义背景图片");
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
    if (!this.isValidCustom(this.previewTheme || this.customTheme)) throw new Error("还没有可以应用的自定义皮肤");
    this.plugin.ai.settings.customTheme = this.previewTheme || this.customTheme;
    this.plugin.ai.settings.activeThemeId = CUSTOM_THEME_ID;
    this.previewTheme = null;
    await this.plugin.ai.save();
    await this.persist();
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
    await this.persist();
    this.plugin.refreshViews();
  }

  async deleteCustom() {
    this.previewTheme = null;
    this.plugin.ai.settings.customTheme = null;
    this.plugin.ai.settings.activeThemeId = FOREST_THEME_ID;
    await this.plugin.ai.save();
    await this.persist();
    this.plugin.refreshViews();
  }

  resolveTheme() {
    if (this.previewTheme) return this.previewTheme;
    if (this.activeThemeId === CUSTOM_THEME_ID && this.isValidCustom(this.customTheme)
      && this.app.vault.getAbstractFileByPath(this.customTheme.backgroundPath) instanceof TFile) return this.customTheme;
    return FOREST_ORIGINAL_THEME;
  }

  applyTo(root) {
    const theme = this.resolveTheme();
    root.removeClass("ros-theme-custom");
    this.clearTokens(root);
    const background = this.app.vault.getAbstractFileByPath(theme.backgroundPath) || this.app.vault.getAbstractFileByPath("forest.jpg");
    const backgroundUrl = background instanceof TFile
      ? this.app.vault.getResourcePath(background)
      : this.app.vault.adapter.getResourcePath(".obsidian/plugins/research-os/forest.jpg");
    root.style.setProperty("--ros-forest-image", `url("${backgroundUrl}")`);
    if (theme.id !== CUSTOM_THEME_ID) return;
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
    ["--skin-sidebar","--skin-topbar","--skin-surface","--skin-surface-hover","--skin-border","--skin-border-strong","--skin-text","--skin-text-secondary","--skin-text-muted","--skin-accent","--skin-on-accent","--skin-accent-soft","--skin-graph-node","--skin-graph-glow","--skin-graph-line","--skin-overlay","--skin-blur","--ros-bg","--ros-panel","--ros-panel-2","--ros-panel-3","--ros-border","--ros-border-strong","--ros-text","--ros-text-2","--ros-text-3","--ros-green","--ros-green-soft","--ros-accent","--ros-accent-hover"].forEach(name => root.style.removeProperty(name));
  }
}

module.exports = { ThemeService, FOREST_ORIGINAL_THEME, FOREST_THEME_ID, CUSTOM_THEME_ID };
