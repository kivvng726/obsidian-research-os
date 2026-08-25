const assert = require("node:assert/strict");
const { analyzePixels, generateTheme } = require("./theme-engine");

function image(width, height, pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    const [r, g, b] = pixel(x, y);
    data.set([r, g, b, 255], index);
  }
  return data;
}

for (const data of [
  image(80, 50, (x, y) => [18 + x, 38 + y, 24 + Math.floor(x / 2)]),
  image(80, 50, (x, y) => [210 - y, 225 - x, 190 + Math.floor(y / 2)])
]) {
  const analysis = analyzePixels(data, 80, 50);
  const theme = generateTheme(analysis);
  assert.ok(theme.tokens["--skin-surface"]);
  assert.ok(theme.tokens["--skin-graph-node"]);
  assert.ok(theme.tokens["--skin-on-accent"]);
  assert.ok(theme.contrast.body >= 4.5, `body contrast ${theme.contrast.body}`);
  assert.ok(theme.contrast.secondary >= 4.5, `secondary contrast ${theme.contrast.secondary}`);
}

const analysis = analyzePixels(image(40, 30, () => [103, 127, 72]), 40, 30);
assert.notEqual(generateTheme(analysis, { glassBlur: 5 }).tokens["--skin-blur"], generateTheme(analysis, { glassBlur: 30 }).tokens["--skin-blur"]);
console.log("theme-engine tests passed");
