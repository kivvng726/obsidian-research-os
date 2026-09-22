const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { ItemView: class {}, Notice: class {}, TFile: class {}, setIcon: () => {} };
  if (request === "./capture-modal") return { CaptureModal: class {} };
  if (request === "./paper-graph") return { PaperGraph: class {} };
  if (request === "./progress-modal") return { ProgressModal: class {}, TYPES: {}, MATURITY: {}, ROLES: {} };
  if (request === "./synthesis-modal") return { SynthesisModal: class {} };
  if (request === "./literature-modal") return { LiteratureEditModal: class {}, LiteratureDeleteModal: class {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { restoreSearchInputFocus } = require("./research-view");
Module._load = originalLoad;

const calls = [];
const input = {
  value: "literature",
  focus: () => calls.push("focus"),
  setSelectionRange: (start, end) => calls.push([start, end])
};

restoreSearchInputFocus({ querySelector: selector => selector === ".ros-search input" ? input : null }, 4);
assert.deepEqual(calls, ["focus", [4, 4]]);

calls.length = 0;
restoreSearchInputFocus({ querySelector: () => input }, 999);
assert.deepEqual(calls, ["focus", [input.value.length, input.value.length]]);
assert.doesNotThrow(() => restoreSearchInputFocus({ querySelector: () => null }, 0));

console.log("research-view search focus tests passed");
