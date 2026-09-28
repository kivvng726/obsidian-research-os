const { TFile } = require("obsidian");

function resolveCitationPaper(store, citation) {
  const paperId = String(citation?.paperId || "").trim();
  if (!paperId || !store) return null;
  if (typeof store.get === "function") return store.get(paperId);
  if (typeof store.getByPath === "function") return store.getByPath(paperId);
  return null;
}

function pdfRootForLeaf(leaf) {
  return leaf?.view?.containerEl || leaf?.containerEl || null;
}

function findPageInput(root) {
  if (!root?.querySelectorAll) return null;
  return [...root.querySelectorAll("input")].find(input => {
    const label = `${input.getAttribute?.("aria-label") || ""} ${input.getAttribute?.("title") || ""} ${input.getAttribute?.("name") || ""}`.toLowerCase();
    const nearby = String(input.parentElement?.textContent || "");
    return label.includes("page") || /\d+\s*\/\s*\d+/.test(nearby);
  }) || null;
}

function targetPage(root, pageNumber) {
  return root?.querySelector?.(`.page[data-page-number="${pageNumber}"]`) || null;
}

function dispatchPageInput(input, pageNumber) {
  input.value = String(pageNumber);
  const makeEvent = type => typeof Event === "function" ? new Event(type, { bubbles: true }) : { type, bubbles: true };
  input.dispatchEvent?.(makeEvent("input"));
  input.dispatchEvent?.(makeEvent("change"));
  if (typeof KeyboardEvent === "function") input.dispatchEvent?.(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  else input.dispatchEvent?.({ type: "keydown", key: "Enter", bubbles: true });
}

function targetIsVisible(root, target) {
  if (!root?.getBoundingClientRect || !target?.getBoundingClientRect) return false;
  const container = root.getBoundingClientRect();
  const page = target.getBoundingClientRect();
  return page.bottom > container.top && page.top < container.bottom;
}

async function waitForPdfNavigation(root, pageNumber, options = {}) {
  const timeoutMs = options.timeoutMs ?? 4000;
  const pollMs = options.pollMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const input = findPageInput(root);
    const page = targetPage(root, pageNumber);
    if (input || page) return { input, page };
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  return { input: null, page: null };
}

async function navigatePdfLeaf(leaf, pageNumber, options = {}) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return false;
  const root = pdfRootForLeaf(leaf);
  if (!root) return false;
  const ready = await waitForPdfNavigation(root, pageNumber, options);
  if (ready.input) {
    dispatchPageInput(ready.input, pageNumber);
    const deadline = Date.now() + (options.verifyTimeoutMs ?? 800);
    while (Date.now() <= deadline) {
      const verifiedPage = targetPage(root, pageNumber);
      if (String(ready.input.value).trim() === String(pageNumber) && targetIsVisible(root, verifiedPage)) return true;
      await new Promise(resolve => setTimeout(resolve, options.pollMs ?? 50));
    }
  }
  const page = ready.page || targetPage(root, pageNumber);
  if (!page) return false;
  page.scrollIntoView?.({ block: "start" });
  return targetIsVisible(root, page);
}

async function openCitation({ app, store, citation, navigationOptions }) {
  const paper = resolveCitationPaper(store, citation);
  if (!paper) return { opened: false, reason: "PAPER_NOT_FOUND" };
  const pdfPath = String(paper.pdfPath || "").trim();
  if (!pdfPath) return { opened: false, reason: "PDF_NOT_LINKED", paper };
  const pdfFile = app?.vault?.getAbstractFileByPath?.(pdfPath);
  if (!(pdfFile instanceof TFile)) return { opened: false, reason: "PDF_NOT_FOUND", paper, pdfPath };
  const leaf = app.workspace.getLeaf("tab");
  await leaf.openFile(pdfFile);
  const pageNumber = Number(citation?.pageNumber);
  const safePageNumber = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null;
  const pageNavigated = safePageNumber ? await navigatePdfLeaf(leaf, safePageNumber, navigationOptions) : false;
  return { opened: true, pageNavigated, pageNumber: safePageNumber, paper, pdfFile, leaf };
}

module.exports = { resolveCitationPaper, findPageInput, waitForPdfNavigation, navigatePdfLeaf, openCitation };
