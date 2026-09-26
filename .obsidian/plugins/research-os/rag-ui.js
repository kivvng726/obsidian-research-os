const CITATION_PATTERN = /\[E([1-9]\d*)\]/g;

function citationMap(citations) {
  const map = new Map();
  (Array.isArray(citations) ? citations : []).forEach(citation => {
    const id = String(citation?.id || "");
    if (/^E[1-9]\d*$/.test(id)) map.set(id, citation);
  });
  return map;
}

function tokenizeRagAnswer(answer, citations) {
  const source = String(answer || "");
  const available = citationMap(citations);
  const tokens = [];
  let cursor = 0;
  let match;
  CITATION_PATTERN.lastIndex = 0;
  while ((match = CITATION_PATTERN.exec(source))) {
    if (match.index > cursor) tokens.push({ type: "text", text: source.slice(cursor, match.index) });
    const id = `E${match[1]}`;
    tokens.push({ type: "citation", id, text: match[0], citation: available.get(id) || null });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) tokens.push({ type: "text", text: source.slice(cursor) });
  return tokens;
}

function quotePreview(quote, maxLength = 350) {
  const source = String(quote || "").trim();
  if (source.length <= maxLength) return source;
  return `${source.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function prepareRagMarkdown(answer, citations) {
  const placeholders = new Map();
  const markdown = tokenizeRagAnswer(answer, citations).map((token, index) => {
    if (token.type !== "citation" || !token.citation) return token.text;
    const placeholder = `ROS_CITATION_${token.id}_${index}_TOKEN`;
    placeholders.set(placeholder, token.citation);
    return placeholder;
  }).join("");
  return { markdown, placeholders };
}

function splitCitationPlaceholders(text, placeholders) {
  const source = String(text || "");
  if (!placeholders?.size) return [{ type: "text", text: source }];
  const pattern = new RegExp(`(${[...placeholders.keys()].map(value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const parts = [];
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source))) {
    if (match.index > cursor) parts.push({ type: "text", text: source.slice(cursor, match.index) });
    parts.push({ type: "citation", placeholder: match[0], citation: placeholders.get(match[0]) });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) parts.push({ type: "text", text: source.slice(cursor) });
  return parts.length ? parts : [{ type: "text", text: source }];
}

module.exports = { tokenizeRagAnswer, quotePreview, citationMap, prepareRagMarkdown, splitCitationPlaceholders };
