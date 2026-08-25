const { Setting, Notice } = require("obsidian");
const { DEFAULT_CONTROLS } = require("./theme-engine");
const { FOREST_THEME_ID, CUSTOM_THEME_ID } = require("./theme-service");

const CONTROL_DEFS = [
  ["overlayStrength", "背景遮罩强度", "降低复杂背景对文字的干扰", .08, .72, .01, value => `${Math.round(value * 100)}%`],
  ["glassOpacity", "玻璃透明度", "控制前景玻璃的实度", .30, .78, .01, value => `${Math.round(value * 100)}%`],
  ["glassBlur", "玻璃模糊", "控制背景透过卡片时的模糊程度", 0, 40, 1, value => `${Math.round(value)}px`],
  ["contrastBoost", "文字对比度", "增强边框和文字的清晰度", 0, .30, .01, value => `${Math.round(value * 100)}%`],
  ["accentStrength", "强调色强度", "控制按钮、状态和图谱光晕", .15, 1, .01, value => `${Math.round(value * 100)}%`]
];

function renderThemeSettings(containerEl, plugin, refresh) {
  const service = plugin.theme;
  containerEl.createEl("h2", { text: "界面皮肤" });
  containerEl.createEl("p", {
    cls: "ros-theme-help",
    text: "森林原版是内置保护主题，不会被背景选择、自动取色或参数调整覆盖。自定义皮肤始终独立保存。"
  });

  const forest = new Setting(containerEl)
    .setName("森林原版（内置保护）")
    .setDesc("固定使用 forest.jpg 与当前完整视觉参数；不可编辑、删除或覆盖。");
  forest.addButton(button => button
    .setButtonText(service.activeThemeId === FOREST_THEME_ID && !service.previewTheme ? "正在使用" : "使用森林原版")
    .setDisabled(service.activeThemeId === FOREST_THEME_ID && !service.previewTheme)
    .onClick(async () => { await service.useForest(); refresh(); }));

  const editing = service.editingTheme;
  const custom = new Setting(containerEl)
    .setName("自定义动态皮肤")
    .setDesc(editing ? `背景：${editing.backgroundPath}${service.previewTheme ? " · 正在预览，尚未保存" : ""}` : "尚未创建；选择一张图片后自动生成预览。");
  custom.addButton(button => attachBackgroundPicker(plugin, button.setButtonText("选择背景"), refresh));
  custom.addButton(button => button
    .setButtonText("重新分析")
    .setDisabled(!editing)
    .onClick(async () => {
      button.setDisabled(true);
      try { await service.reanalyze(); refresh(); new Notice("自定义皮肤已重新分析并进入预览"); }
      catch (error) { new Notice(`图片分析失败：${error.message}`, 7000); }
      finally { button.setDisabled(false); }
    }));

  if (editing?.palette) {
    const palette = containerEl.createDiv("ros-theme-palette");
    [["主色", editing.palette.dominant], ["强调", editing.palette.accent], ["文字", editing.palette.text], ["表面", editing.palette.surface]].forEach(([label, color]) => {
      const item = palette.createDiv("ros-theme-swatch");
      item.createSpan({ attr: { style: `background:${color}` } });
      item.createEl("small", { text: `${label} ${color}` });
    });
  }

  const controls = { ...DEFAULT_CONTROLS, ...(editing?.controls || {}) };
  CONTROL_DEFS.forEach(([key, name, desc, min, max, step, format]) => {
    const setting = new Setting(containerEl).setName(name).setDesc(desc);
    setting.addSlider(slider => {
      slider.setLimits(min, max, step).setValue(controls[key]).setDynamicTooltip();
      slider.sliderEl.disabled = !editing;
      slider.onChange(value => { service.previewControls({ [key]: value }); updateValue(); });
      const valueEl = setting.controlEl.createSpan({ cls: "ros-theme-control-value" });
      const updateValue = () => valueEl.setText(format(Number(slider.getValue())));
      updateValue();
    });
  });
  new Setting(containerEl)
    .setName("锁定配色")
    .setDesc("锁定后更换背景只替换图片，不重新计算现有颜色。")
    .addToggle(toggle => toggle.setValue(Boolean(controls.locked)).setDisabled(!editing).onChange(value => service.previewControls({ locked: value })));

  const actions = containerEl.createDiv("ros-theme-actions");
  const apply = actions.createEl("button", { text: "应用自定义皮肤", cls: "mod-cta" });
  apply.disabled = !editing;
  apply.addEventListener("click", async () => {
    try { await service.applyCustom(); refresh(); new Notice("自定义动态皮肤已应用"); }
    catch (error) { new Notice(error.message, 7000); }
  });
  const cancel = actions.createEl("button", { text: "取消预览" });
  cancel.disabled = !service.previewTheme;
  cancel.addEventListener("click", () => { service.cancelPreview(); refresh(); });
  const restore = actions.createEl("button", { text: "一键恢复森林原版" });
  restore.addEventListener("click", async () => { await service.useForest(); refresh(); });
  const remove = actions.createEl("button", { text: "删除自定义皮肤", cls: "mod-warning" });
  remove.disabled = !service.customTheme && !service.previewTheme;
  remove.addEventListener("click", async () => { await service.deleteCustom(); refresh(); new Notice("自定义皮肤配置已删除，森林原版已恢复"); });
}

function attachBackgroundPicker(plugin, button, refresh) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/gif";
  input.tabIndex = -1;
  input.setAttribute("aria-label", "选择自定义皮肤背景图片");
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
  input.addEventListener("click", event => event.stopPropagation());
  button.onClick(() => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    button.setDisabled(true);
    input.disabled = true;
    try {
      await plugin.theme.importBackground(file);
      refresh();
      new Notice("背景已分析。当前仅为预览，点击“应用自定义皮肤”后保存。");
    } catch (error) {
      plugin.theme.cancelPreview();
      new Notice(`背景图片处理失败：${error.message}`, 7000);
    } finally {
      button.setDisabled(false);
      input.disabled = false;
      input.value = "";
    }
  });
}

module.exports = { renderThemeSettings };
