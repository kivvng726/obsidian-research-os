const DEFAULT_CONTROLS = Object.freeze({
  overlayStrength: 0.32,
  glassOpacity: 0.48,
  glassBlur: 22,
  contrastBoost: 0.12,
  accentStrength: 0.55,
  locked: false
});

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value)));
const channel = value => {
  value /= 255;
  return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
};
const luminance = rgb => .2126 * channel(rgb[0]) + .7152 * channel(rgb[1]) + .0722 * channel(rgb[2]);
const contrastRatio = (a, b) => {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
};
const hex = rgb => `#${rgb.map(value => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
const rgba = (rgb, alpha) => `rgba(${rgb.map(Math.round).join(", ")}, ${clamp(alpha).toFixed(3)})`;
const mix = (a, b, amount) => a.map((value, index) => value + (b[index] - value) * clamp(amount));

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  const l = (max + min) / 2;
  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
  return [h, s, l];
}

function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let base = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x];
  return base.map(value => (value + m) * 255);
}

function clusterColors(samples, count = 6) {
  if (!samples.length) return [[103,127,72]];
  const sorted = [...samples].sort((a, b) => luminance(a) - luminance(b));
  let centers = Array.from({ length: Math.min(count, sorted.length) }, (_, index) => sorted[Math.floor(index * (sorted.length - 1) / Math.max(1, count - 1))].slice());
  for (let iteration = 0; iteration < 10; iteration++) {
    const groups = centers.map(() => []);
    samples.forEach(sample => {
      let best = 0, distance = Infinity;
      centers.forEach((center, index) => {
        const next = Math.pow(sample[0] - center[0], 2) + Math.pow(sample[1] - center[1], 2) + Math.pow(sample[2] - center[2], 2);
        if (next < distance) { distance = next; best = index; }
      });
      groups[best].push(sample);
    });
    centers = centers.map((center, index) => groups[index].length
      ? [0,1,2].map(channelIndex => groups[index].reduce((sum, value) => sum + value[channelIndex], 0) / groups[index].length)
      : center);
  }
  return centers.map(center => ({ rgb: center, population: samples.filter(sample => {
    let best = 0, distance = Infinity;
    centers.forEach((candidate, index) => {
      const next = Math.pow(sample[0] - candidate[0], 2) + Math.pow(sample[1] - candidate[1], 2) + Math.pow(sample[2] - candidate[2], 2);
      if (next < distance) { distance = next; best = index; }
    });
    return centers[best] === center;
  }).length })).sort((a, b) => b.population - a.population);
}

function regionMetrics(samples) {
  if (!samples.length) return { luminance: .35, spread: .2, complexity: .2 };
  const values = samples.map(luminance).sort((a,b) => a-b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const spread = values[Math.floor(values.length * .9)] - values[Math.floor(values.length * .1)];
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return { luminance: mean, spread, complexity: Math.sqrt(variance) };
}

function analyzePixels(data, width, height) {
  const regions = { global: [], sidebar: [], topbar: [], content: [] };
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 9000)));
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const index = (y * width + x) * 4;
    if (data[index + 3] < 200) continue;
    const rgb = [data[index], data[index + 1], data[index + 2]];
    const light = luminance(rgb);
    if (light < .008 || light > .985) continue;
    regions.global.push(rgb);
    if (x / width < .22) regions.sidebar.push(rgb);
    if (y / height < .18) regions.topbar.push(rgb);
    if (x / width >= .18 && y / height >= .12) regions.content.push(rgb);
  }
  const clusters = clusterColors(regions.global);
  return {
    clusters,
    metrics: Object.fromEntries(Object.entries(regions).map(([key, value]) => [key, regionMetrics(value)]))
  };
}

function ensureText(surface, preferred, minimum) {
  if (contrastRatio(surface, preferred) >= minimum) return preferred;
  const white = [248,252,249], black = [13,18,15];
  return contrastRatio(surface, white) >= contrastRatio(surface, black) ? white : black;
}

function ensureContrast(surface, candidate, target, anchor) {
  let result = candidate;
  for (let step = 0; step < 24 && contrastRatio(surface, result) < target; step++) {
    result = mix(result, anchor, .12);
  }
  return contrastRatio(surface, result) >= target ? result : anchor;
}

function generateTheme(analysis, inputControls = {}) {
  const controls = { ...DEFAULT_CONTROLS, ...inputControls };
  const clusters = analysis?.clusters?.length ? analysis.clusters : [{ rgb: [103,127,72], population: 1 }];
  const dominant = clusters[0].rgb;
  const accentCandidate = [...clusters].sort((a, b) => {
    const ah = rgbToHsl(a.rgb), bh = rgbToHsl(b.rgb);
    return (bh[1] * .75 + bh[2] * .25) - (ah[1] * .75 + ah[2] * .25);
  })[0].rgb;
  const [accentHue, accentSat, accentLight] = rgbToHsl(accentCandidate);
  const accent = hslToRgb([accentHue, clamp(accentSat * (.75 + controls.accentStrength * .55), .28, .72), clamp(accentLight, .44, .68)]);
  const onAccent = ensureText(accent, [250,253,251], 4.5);
  const base = mix(dominant, [10,18,13], .72);
  const surface = mix(base, [255,255,255], .06 + controls.contrastBoost * .08);
  const text = ensureText(surface, [246,252,248], 4.5);
  const lightText = luminance(text) > .5;
  const secondary = ensureContrast(surface, mix(text, surface, .12), 4.5, text);
  const muted = ensureContrast(surface, mix(text, surface, .18), 4.5, text);
  const metric = key => analysis?.metrics?.[key] || analysis?.metrics?.global || { luminance: .35, spread: .2, complexity: .2 };
  const regionAlpha = key => clamp(controls.glassOpacity + metric(key).luminance * .16 + metric(key).complexity * .28, .30, .78);
  const overlay = clamp(controls.overlayStrength + metric("global").spread * .18, .08, .72);
  return {
    controls,
    palette: { dominant: hex(dominant), accent: hex(accent), text: hex(text), surface: hex(surface) },
    tokens: {
      "--skin-sidebar": rgba(base, regionAlpha("sidebar")),
      "--skin-topbar": rgba(base, regionAlpha("topbar")),
      "--skin-surface": rgba(surface, regionAlpha("content")),
      "--skin-surface-hover": rgba(mix(surface, accent, .12), clamp(regionAlpha("content") + .08)),
      "--skin-border": rgba(mix(text, accent, .16), .18 + controls.contrastBoost * .24),
      "--skin-border-strong": rgba(mix(text, accent, .12), .32 + controls.contrastBoost * .28),
      "--skin-text": hex(text),
      "--skin-text-secondary": hex(secondary),
      "--skin-text-muted": hex(muted),
      "--skin-accent": hex(accent),
      "--skin-on-accent": hex(onAccent),
      "--skin-accent-soft": rgba(accent, .14 + controls.accentStrength * .18),
      "--skin-graph-node": hex(mix(accent, text, .48)),
      "--skin-graph-glow": rgba(accent, .34 + controls.accentStrength * .34),
      "--skin-graph-line": rgba(mix(accent, text, .35), .22),
      "--skin-overlay": rgba(base, overlay),
      "--skin-blur": `${Math.round(clamp(controls.glassBlur, 0, 40))}px`
    },
    contrast: { body: contrastRatio(surface, text), secondary: contrastRatio(surface, secondary) }
  };
}

module.exports = { DEFAULT_CONTROLS, analyzePixels, generateTheme, contrastRatio, luminance };
