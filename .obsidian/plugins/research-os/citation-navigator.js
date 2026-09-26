const { TFile } = require("obsidian");

function resolveCitationPaper(store, citation) {
  const paperId = String(citation?.paperId || "").trim();
  if (!paperId || !store) return null;
  if (typeof store.get === "function") return store.get(paperId);
  if (typeof store.getByPath === "function") return store.getByPath(paperId);
  return null;
}

async function openCitation({ app, store, citation }) {
  const paper = resolveCitationPaper(store, citation);
  if (!paper) return { opened: false, reason: "PAPER_NOT_FOUND" };

  const pdfPath = String(paper.pdfPath || "").trim();
  if (!pdfPath) return { opened: false, reason: "PDF_NOT_LINKED", paper };

  const pdfFile = app?.vault?.getAbstractFileByPath?.(pdfPath);
  if (!(pdfFile instanceof TFile)) return { opened: false, reason: "PDF_NOT_FOUND", paper, pdfPath };

  await app.workspace.getLeaf("tab").openFile(pdfFile);
  const pageNumber = Number(citation?.pageNumber);
  return {
    opened: true,
    pageNavigated: false,
    pageNumber: Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null,
    paper,
    pdfFile
  };
}

module.exports = { resolveCitationPaper, openCitation };
