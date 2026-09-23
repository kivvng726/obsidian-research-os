const assert = require("node:assert/strict");
const Module = require("node:module");

class TFile {
  constructor(path) {
    this.path = path;
    this.extension = path.split(".").pop();
    this.basename = path.split("/").pop().replace(/\.md$/, "");
    this.stat = { mtime: 10, ctime: 5 };
  }
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { TFile, loadPdfJs: async () => null };
  return originalLoad.call(this, request, parent, isMain);
};
const { ResearchStore } = require("./research-store");
Module._load = originalLoad;

const files = new Map();
const frontmatter = new Map();
function add(path, fm) {
  const file = new TFile(path);
  files.set(path, file);
  frontmatter.set(path, fm);
  return file;
}

add("03 Literature/One.md", { title: "One", type: "literature", authors: "Ada", pdf: "03 Literature/One.pdf" });
add("04 Notes/Evidence/Claim.md", { title: "Claim", type: "evidence" });
add("01 Inbox/Ignore.md", {});

const app = {
  vault: {
    adapter: { getBasePath: () => "C:/TestVault" },
    getMarkdownFiles: () => [...files.values()].filter(file => file.extension === "md"),
    getAbstractFileByPath: path => files.get(path) || null
  },
  metadataCache: {
    getFileCache: file => ({ frontmatter: frontmatter.get(file.path) || {} }),
    getFirstLinkpathDest: () => null
  }
};

(async () => {
  const store = new ResearchStore(app);
  await store.loadAll();
  assert.equal(store.items.length, 2);
  assert.equal(store.itemsByPath.size, store.items.length);
  assert.equal(store.get("03 Literature/One.md").pdfPath, "03 Literature/One.pdf");
  assert.equal(store.get("04 Notes/Evidence/Claim.md").type, "evidence");

  store.resetDebugStats();
  frontmatter.set("03 Literature/One.md", { title: "One Updated", type: "literature", status: "reading", pdf: "03 Literature/One.pdf" });
  await store.updateFile("03 Literature/One.md");
  assert.equal(store.get("03 Literature/One.md").title, "One Updated");
  assert.equal(store.items.filter(item => item.path === "03 Literature/One.md").length, 1);
  assert.deepEqual(store.getDebugStats(), { loadAllCount: 0, singleFileParseCount: 1 });
  assert.equal(store.search("updated").length, 1);

  add("03 Literature/New.md", { title: "New", type: "literature", attachment: "03 Literature/New.pdf" });
  await store.loadFile("03 Literature/New.md");
  assert.equal(store.getByPath("03 Literature/New.md").pdfPath, "03 Literature/New.pdf");

  const oldPath = "03 Literature/New.md";
  const newPath = "03 Literature/Renamed.md";
  const renamed = files.get(oldPath);
  files.delete(oldPath); frontmatter.delete(oldPath);
  renamed.path = newPath; renamed.basename = "Renamed";
  files.set(newPath, renamed); frontmatter.set(newPath, { title: "Renamed", type: "literature" });
  await store.renameFile(oldPath, newPath);
  assert.equal(store.get(oldPath), null);
  assert.equal(store.get(newPath).title, "Renamed");

  assert.equal(store.removeFile("missing.md"), false);
  assert.equal(store.removeFile(newPath), true);
  assert.equal(store.get(newPath), null);
  assert.equal(await store.loadFile("01 Inbox/Ignore.md"), null);
  assert.equal(store.itemsByPath.size, store.items.length);

  await store.load();
  assert.equal(store.itemsByPath.size, store.items.length);
  assert.equal(store.getDebugStats().loadAllCount, 1);
  console.log("research-store incremental tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
