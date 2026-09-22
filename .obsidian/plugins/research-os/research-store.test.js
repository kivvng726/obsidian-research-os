const assert = require("node:assert/strict");
const Module = require("node:module");

class TFile {
  constructor(path) {
    this.path = path;
  }
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { TFile, loadPdfJs: async () => null };
  return originalLoad.call(this, request, parent, isMain);
};
const { ResearchStore } = require("./research-store");
Module._load = originalLoad;

function createStore(files = {}) {
  const byPath = new Map(Object.entries(files).map(([path, file]) => [path, file]));
  return new ResearchStore({
    vault: {
      adapter: { getBasePath: () => "C:/Users/test/Vault" },
      getAbstractFileByPath: path => byPath.get(path) || null
    },
    metadataCache: { getFirstLinkpathDest: () => null }
  });
}

const store = createStore({
  "03 Literature/Paper One.pdf": new TFile("03 Literature/Paper One.pdf")
});

assert.equal(store.normalizeVaultPath("03 Literature/Paper One.pdf"), "03 Literature/Paper One.pdf");
assert.equal(store.normalizeVaultPath("file:///C:/Users/test/Vault/03%20Literature/Paper%20One.pdf"), "03 Literature/Paper One.pdf");
assert.equal(store.normalizeVaultPath("C:\\Users\\test\\Vault\\03 Literature\\Paper One.pdf"), "03 Literature/Paper One.pdf");
assert.equal(store.normalizeVaultPath("03%20Literature/Paper%20One.pdf"), "03 Literature/Paper One.pdf");
assert.equal(store.normalizeVaultPath("[[03 Literature/Paper One.pdf|Paper]]"), "03 Literature/Paper One.pdf");
assert.equal(store.normalizeVaultPath(""), "");
assert.equal(store.normalizeVaultPath(null), "");
assert.equal(store.normalizeVaultPath("https://example.com/paper.pdf"), "");
assert.equal(store.normalizeVaultPath("C:\\outside\\Vault\\unknown.pdf"), "");
assert.equal(store.resolveLink("file:///C:/Users/test/Vault/03%20Literature/Paper%20One.pdf")?.path, "03 Literature/Paper One.pdf");

console.log("research-store path tests passed");
