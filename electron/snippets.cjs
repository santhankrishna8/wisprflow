// Voice snippets: say a trigger phrase on its own and WisprFlow inserts saved text instead
// (an email signature, a template, a stock reply). Matching is exact on the whole
// dictation, ignoring case and punctuation, so ordinary sentences are never hijacked.

const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const PREFIX = /^(?:insert|paste|type|snippet)\s+/;

/** Return the snippet whose trigger the whole utterance equals, or null. */
function matchSnippet(utterance, snippets) {
  const said = normalize(utterance);
  if (!said) return null;
  const bare = said.replace(PREFIX, "");
  for (const s of snippets || []) {
    const trigger = normalize(s.trigger);
    if (trigger && s.text && (said === trigger || bare === trigger)) return s;
  }
  return null;
}

module.exports = { matchSnippet, normalize };
