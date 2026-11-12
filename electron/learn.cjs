// Learn from corrections: compare what WisprFlow wrote with what the user fixed it to,
// and suggest dictionary entries for the words that changed. Nothing is saved until
// the user confirms.

const tokenize = (s) => String(s || "").split(/\s+/).filter(Boolean);
const stripEdges = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const norm = (w) => stripEdges(w).toLowerCase();

/** Longest-common-subsequence table over normalised tokens. */
function lcsTable(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i][j] = norm(a[i]) === norm(b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  return t;
}

/**
 * Suggest { word, to } pairs for contiguous word runs the user replaced.
 * Only small swaps (1-3 words on each side) are suggested: bigger rewrites are edits, not spelling fixes.
 */
function suggestReplacements(before, after, existing = []) {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length > 400 || b.length > 400) return [];
  const t = lcsTable(a, b);
  const known = new Set(existing.map((d) => String(d.word || "").toLowerCase()));
  const out = [];
  let i = 0;
  let j = 0;
  let del = [];
  let ins = [];
  const flush = () => {
    if (del.length && ins.length && del.length <= 3 && ins.length <= 3) {
      const word = del.map(stripEdges).join(" ").trim();
      const to = ins.map(stripEdges).join(" ").trim();
      if (word && to && word !== to && !known.has(word.toLowerCase()) && !out.some((s) => s.word.toLowerCase() === word.toLowerCase())) {
        out.push({ word, to });
      }
    }
    del = [];
    ins = [];
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && norm(a[i]) === norm(b[j])) {
      // Same word apart from case/punctuation. A pure capitalisation fix is still worth learning.
      if (stripEdges(a[i]) !== stripEdges(b[j]) && stripEdges(a[i]) && stripEdges(b[j])) {
        flush();
        del = [a[i]];
        ins = [b[j]];
      }
      flush();
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && t[i + 1][j] >= t[i][j + 1])) {
      del.push(a[i++]);
    } else {
      ins.push(b[j++]);
    }
  }
  flush();
  return out.slice(0, 5);
}

module.exports = { suggestReplacements };
