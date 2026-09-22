/**
 * Canonical runtime shape for literature items. This module never writes
 * frontmatter: `raw` remains the original frontmatter object from Obsidian.
 */

function normalizeStringArray(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set();
  return values.flatMap(entry => String(entry ?? "").split(/[,，]/))
    .map(entry => entry.trim())
    .filter(Boolean)
    .filter(entry => {
      const key = entry.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isLikelyVaultPath(value) {
  const source = String(value || "").trim();
  return /^\[\[.+\]\]$/.test(source)
    || /^file:\/\//i.test(source)
    || /^[A-Za-z]:[\\/]/.test(source)
    || /[\\/]/.test(source)
    || /\.(?:md|pdf|ppt|pptx)$/i.test(source);
}

function normalizePath(value, normalizeVaultPath) {
  if (!isLikelyVaultPath(value)) return "";
  return typeof normalizeVaultPath === "function" ? normalizeVaultPath(value) : "";
}

function firstPath(values, normalizeVaultPath) {
  for (const value of values) {
    const path = normalizePath(value, normalizeVaultPath);
    if (path) return path;
  }
  return "";
}

function normalizePaper(item, context = {}) {
  const raw = item?.raw && typeof item.raw === "object" ? item.raw : {};
  const normalizeVaultPath = context.normalizeVaultPath;
  const primaryTopic = String(raw.primary_topic || item.primaryTopic || "").trim();
  const category = String(raw.category || raw.topic || item.category || "").trim();
  const explicitTopics = normalizeStringArray(raw.topics ?? raw.concepts ?? item.concepts);
  const rawReadingNotes = [raw.reading_note, ...normalizeStringArray(raw.reading_notes)];
  const readingNotePaths = [...new Set(rawReadingNotes.map(value => normalizePath(value, normalizeVaultPath)).filter(Boolean))];
  const notesValue = raw.notes;
  const notesPath = normalizePath(notesValue, normalizeVaultPath);
  if (!readingNotePaths.length && notesPath) readingNotePaths.push(notesPath);

  const explicitPdfPath = normalizePath(raw.pdf, normalizeVaultPath);
  const attachmentPath = normalizePath(raw.attachment, normalizeVaultPath);
  const pdfPath = /\.pdf$/i.test(explicitPdfPath) ? explicitPdfPath : /\.pdf$/i.test(attachmentPath) ? attachmentPath : "";
  const slidesPath = firstPath([raw.slides, raw.ppt, raw.presentation], normalizeVaultPath);
  const legacyPdf = raw.pdf || raw.attachment || item.pdf || "";
  const legacySlides = raw.slides || raw.ppt || raw.presentation || item.slides || "";
  const legacyReadingNote = raw.reading_note || raw.notes || item.readingNote || "";

  return {
    ...item,
    id: String(raw.id || item.id || item.path || ""),
    path: String(item.path || ""),
    title: String(raw.title || item.title || item.name || "").trim(),
    authors: normalizeStringArray(raw.authors ?? item.authors),
    year: raw.year ?? item.year ?? "",
    status: String(raw.status || item.status || ""),
    primaryTopic,
    topics: explicitTopics,
    category,
    methods: normalizeStringArray(raw.methods ?? item.methods),
    pdfPath,
    attachmentPath,
    slidesPath,
    readingNotePath: readingNotePaths[0] || "",
    readingNotePaths,
    notesText: notesValue && !notesPath ? String(notesValue) : "",
    createdAt: String(raw.created || raw.created_at || raw.date_added || item.created || ""),
    updatedAt: String(raw.updated || raw.updated_at || raw.last_reviewed || item.updated || ""),
    raw,

    // Legacy compatibility: UI and services may still read these until later steps.
    pdf: legacyPdf,
    attachment: raw.attachment || "",
    slides: legacySlides,
    ppt: raw.ppt || "",
    presentation: raw.presentation || "",
    readingNote: legacyReadingNote,
    readingNotes: [...new Set([legacyReadingNote, ...normalizeStringArray(raw.reading_notes), ...readingNotePaths].filter(Boolean))],
    created: String(raw.created || raw.date_added || item.created || ""),
    updated: String(raw.updated || raw.last_reviewed || item.updated || "")
  };
}

module.exports = { normalizePaper, normalizeStringArray };
