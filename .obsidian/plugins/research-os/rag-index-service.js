function isBackendUnavailable(error) {
  return ["BACKEND_UNAVAILABLE", "BACKEND_TIMEOUT"].includes(String(error?.code || ""));
}

class RagIndexService {
  constructor(plugin) {
    this.plugin = plugin;
    this.paperStates = new Map();
    this.backfill = null;
  }

  notify() { this.plugin.renderViews?.(); }

  vaultRoot() {
    return String(this.plugin.app?.vault?.adapter?.getBasePath?.() || "").trim();
  }

  eligible(paper) {
    return Boolean(paper?.id && paper?.pdfPath);
  }

  getLibraryStatus(papers = []) {
    const eligible = papers.filter(paper => this.eligible(paper));
    const states = eligible.map(paper => this.paperStates.get(paper.id)).filter(Boolean);
    return {
      total: eligible.length,
      processed: states.filter(state => ["indexed", "unchanged", "failed"].includes(state.status)).length,
      succeeded: states.filter(state => state.status === "indexed").length,
      unchanged: states.filter(state => state.status === "unchanged").length,
      failed: states.filter(state => state.status === "failed").length,
      running: states.filter(state => state.status === "running").length,
      backfill: this.backfill ? { ...this.backfill } : null
    };
  }

  setState(paper, state) {
    this.paperStates.set(paper.id, { paperId: paper.id, ...state });
    this.notify();
  }

  async indexPaper(paper) {
    if (!this.eligible(paper)) return { status: "skipped", reason: "NO_PDF" };
    const existing = this.paperStates.get(paper.id);
    if (existing?.status === "running") return existing;
    const vaultRoot = this.vaultRoot();
    if (!vaultRoot) {
      const result = { status: "failed", reason: "VAULT_ROOT_UNAVAILABLE" };
      this.setState(paper, result);
      return result;
    }
    if (!this.plugin.backendClient?.indexDocument || !this.plugin.backendClient?.indexEmbeddings) {
      const result = { status: "failed", reason: "BACKEND_UNAVAILABLE" };
      this.setState(paper, result);
      return result;
    }
    this.setState(paper, { status: "running" });
    try {
      const document = await this.plugin.backendClient.indexDocument({
        vaultRoot,
        paperId: paper.id,
        sourcePath: paper.pdfPath
      });
      const embeddings = await this.plugin.backendClient.indexEmbeddings({ paperIds: [paper.id], force: false });
      const result = { status: document.status === "unchanged" ? "unchanged" : "indexed", document, embeddings };
      this.setState(paper, result);
      return result;
    } catch (error) {
      const result = { status: "failed", reason: isBackendUnavailable(error) ? "BACKEND_UNAVAILABLE" : "INDEX_FAILED", error: { code: error?.code || "INDEX_FAILED", message: error?.message || "Indexing failed" } };
      this.setState(paper, result);
      return result;
    }
  }

  indexPaperInBackground(paper) {
    return this.indexPaper(paper).catch(error => ({ status: "failed", reason: "INDEX_FAILED", error }));
  }

  async indexExistingLibrary(papers = []) {
    if (this.backfill?.running) return { ...this.backfill };
    const candidates = papers.filter(paper => paper?.type === "literature");
    this.backfill = { running: true, total: candidates.length, processed: 0, succeeded: 0, unchanged: 0, skipped: 0, failed: 0, unavailable: false };
    this.notify();
    for (const paper of candidates) {
      if (!this.eligible(paper)) {
        this.backfill.processed++; this.backfill.skipped++; this.notify();
        continue;
      }
      const result = await this.indexPaper(paper);
      this.backfill.processed++;
      if (result.status === "indexed") this.backfill.succeeded++;
      else if (result.status === "unchanged") this.backfill.unchanged++;
      else if (result.status === "skipped") this.backfill.skipped++;
      else this.backfill.failed++;
      if (result.reason === "BACKEND_UNAVAILABLE") { this.backfill.unavailable = true; break; }
      this.notify();
    }
    this.backfill.running = false;
    this.notify();
    return { ...this.backfill };
  }
}

module.exports = { RagIndexService, isBackendUnavailable };
