const assert = require("node:assert/strict");
const { tokenizeRagAnswer, quotePreview, prepareRagMarkdown, splitCitationPlaceholders } = require("./rag-ui");

const citations = [{ id: "E1", paperId: "paper-1" }, { id: "E2", paperId: "paper-2" }];
assert.deepEqual(tokenizeRagAnswer("Plain text", citations), [{ type: "text", text: "Plain text" }]);
assert.deepEqual(tokenizeRagAnswer("A [E1][E2] B", citations).map(token => [token.type, token.id || token.text, Boolean(token.citation)]), [
  ["text", "A ", false], ["citation", "E1", true], ["citation", "E2", true], ["text", " B", false]
]);
assert.deepEqual(tokenizeRagAnswer("[E1] and [E1]", citations).filter(token => token.type === "citation").map(token => token.id), ["E1", "E1"]);
assert.equal(tokenizeRagAnswer("<img src=x onerror=alert(1)> [E999]", citations)[0].text, "<img src=x onerror=alert(1)> ");
assert.equal(tokenizeRagAnswer("<img src=x onerror=alert(1)> [E999]", citations)[1].citation, null);
assert.equal(tokenizeRagAnswer("broken [E] [E-1] [1]", citations).length, 1);
assert.equal(quotePreview("a".repeat(351), 350).length, 350);
assert.equal(quotePreview("short"), "short");
const prepared = prepareRagMarkdown("### Heading\n- **bold** *italic* `code` [E1][E2]\n[E999]", citations);
assert.ok(prepared.markdown.includes("### Heading\n- **bold** *italic* `code`"));
assert.ok(prepared.markdown.includes("[E999]"));
assert.equal(prepared.placeholders.size, 2);
const parts = splitCitationPlaceholders(prepared.markdown, prepared.placeholders);
assert.equal(parts.filter(part => part.type === "citation").length, 2);
assert.equal(parts.filter(part => part.type === "citation").every(part => part.citation?.id === "E1" || part.citation?.id === "E2"), true);

console.log("rag UI token tests passed");
