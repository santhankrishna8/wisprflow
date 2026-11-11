// Languages, app-aware context and formatting rules.
//
// Two layers shape the text you dictate:
//  1. formatOffline(): fast, deterministic fixes that work with no AI key at all
//     (spoken commands, filler words, developer terms, file names).
//  2. contextRules()/roleRule(): extra instructions for the AI polish step, chosen
//     from the app you're dictating into and the role you picked in Settings.

/** The languages Vaakya targets. `prime` nudges Whisper to answer in the right script. */
const LANGUAGES = {
  en: { name: "English", whisper: "english", prime: "" },
  hi: { name: "Hindi", whisper: "hindi", prime: "यह हिंदी में बोला गया है।" },
  te: { name: "Telugu", whisper: "telugu", prime: "ఇది తెలుగులో చెప్పిన మాట." },
  ta: { name: "Tamil", whisper: "tamil", prime: "இது தமிழில் பேசப்பட்டது." },
  kn: { name: "Kannada", whisper: "kannada", prime: "ಇದು ಕನ್ನಡದಲ್ಲಿ ಹೇಳಿದ ಮಾತು." },
};
const LANGUAGE_CODES = Object.keys(LANGUAGES);

/** Settings saved by older versions may hold a language we no longer offer. */
function normalizeLanguage(code) {
  return LANGUAGE_CODES.includes(code) ? code : "auto";
}

/**
 * The initial prompt handed to Whisper: a short sentence in the target script
 * (so Telugu comes back as Telugu, not as another language) plus known terms.
 */
function sttPrompt({ language, terms = [] }) {
  const lang = LANGUAGES[language];
  const words = [...new Set(terms.filter(Boolean))].slice(0, 70);
  const parts = [];
  if (lang?.prime) parts.push(lang.prime);
  // An English lead-in would pull Indian-language speech towards English, so only
  // label the list when English is (or may be) spoken.
  if (words.length) parts.push(language === "en" ? `Vocabulary: ${words.join(", ")}.` : words.join(", ") + ".");
  return parts.join(" ").slice(0, 600);
}

// ---------- Which kind of app is the text going into? ----------

const APP_KINDS = ["message", "email", "notes", "code", "prompt", "other"];

const APP_RULES = [
  { kind: "code", editor: "cursor", app: /^cursor$/i },
  { kind: "code", editor: "windsurf", app: /^windsurf$/i },
  {
    kind: "code",
    app: /^(code|code - insiders|vscodium|devenv|idea64|idea|pycharm64|pycharm|webstorm64|webstorm|rider64|clion64|goland64|phpstorm64|rubymine64|studio64|android studio|sublime_text|sublime text|notepad\+\+|zed|nvim|neovide|xcode|windowsterminal|powershell|pwsh|cmd|conhost|wezterm-gui|wezterm|alacritty|iterm2|terminal|warp|kitty|gnome-terminal-server|konsole|ghostty|hyper)$/i,
  },
  { kind: "prompt", app: /^(chatgpt|claude|perplexity|copilot|gemini)$/i },
  { kind: "email", app: /^(outlook|olk|thunderbird|mail|hxoutlook|spark|mailspring|superhuman)$/i },
  { kind: "message", app: /^(slack|discord|teams|ms-teams|whatsapp|whatsapp\.root|telegram|signal|messages|zoom|skype|element|wechat|line)$/i },
  { kind: "notes", app: /^(winword|word|notion|obsidian|onenote|pages|notes|evernote|logseq|bear|typora|wordpad|notepad|textedit|libreoffice|soffice\.bin)$/i },
];

// Browsers and web apps are recognised by window title.
const TITLE_RULES = [
  { kind: "prompt", title: /\b(chatgpt|claude|gemini|perplexity|copilot|deepseek|grok|le chat|poe)\b/i },
  { kind: "email", title: /\b(gmail|outlook|proton mail|yahoo mail|zoho mail|fastmail|inbox \(\d+\))/i },
  { kind: "message", title: /\b(whatsapp|slack|discord|messenger|telegram|microsoft teams|google chat|linkedin messaging)\b/i },
  { kind: "code", title: /\b(github|gitlab|stack overflow|codesandbox|replit)\b/i },
  { kind: "notes", title: /\b(google docs|notion|confluence|dropbox paper)\b/i },
];

/** @param {{app?: string, title?: string} | null} win */
function classifyApp(win) {
  const app = String(win?.app || "").replace(/\.exe$/i, "").trim();
  const title = String(win?.title || "");
  for (const r of APP_RULES) if (r.app.test(app)) return { kind: r.kind, editor: r.editor || null, app, title };
  for (const r of TITLE_RULES) if (r.title.test(title)) return { kind: r.kind, editor: null, app, title };
  return { kind: "other", editor: null, app, title };
}

/** Combine the detected app with the user's "Format for" choice. */
function resolveContext(settings, win) {
  const detected = settings.useAppContext === false ? { kind: "other", editor: null, app: "", title: "" } : classifyApp(win);
  const mode = settings.formatMode;
  if (mode && mode !== "auto" && APP_KINDS.includes(mode)) return { ...detected, kind: mode };
  return detected;
}

// ---------- Deterministic formatting (no AI needed) ----------

const DEV_TERMS = [
  ["git hub", "GitHub"], ["github", "GitHub"], ["gitlab", "GitLab"], ["super base", "Supabase"], ["supabase", "Supabase"],
  ["versel", "Vercel"], ["vercel", "Vercel"], ["netlify", "Netlify"], ["type script", "TypeScript"], ["typescript", "TypeScript"],
  ["java script", "JavaScript"], ["javascript", "JavaScript"], ["next js", "Next.js"], ["next.js", "Next.js"], ["nextjs", "Next.js"],
  ["node js", "Node.js"], ["node.js", "Node.js"], ["nodejs", "Node.js"], ["react js", "React"], ["postgresql", "PostgreSQL"],
  ["postgres", "Postgres"], ["my sql", "MySQL"], ["mysql", "MySQL"], ["mongo db", "MongoDB"], ["mongodb", "MongoDB"],
  ["graph ql", "GraphQL"], ["graphql", "GraphQL"], ["kubernetes", "Kubernetes"], ["docker", "Docker"], ["redis", "Redis"],
  ["open ai", "OpenAI"], ["openai", "OpenAI"], ["tailwind", "Tailwind"], ["fire base", "Firebase"], ["firebase", "Firebase"],
  ["vs code", "VS Code"], ["o auth", "OAuth"], ["oauth", "OAuth"], ["ci cd", "CI/CD"], ["web socket", "WebSocket"],
  ["websocket", "WebSocket"], ["local host", "localhost"], ["api", "API"], ["apis", "APIs"], ["json", "JSON"], ["sql", "SQL"],
  ["html", "HTML"], ["css", "CSS"], ["url", "URL"], ["jwt", "JWT"], ["aws", "AWS"], ["cli", "CLI"], ["sdk", "SDK"],
  ["http", "HTTP"], ["https", "HTTPS"], ["yaml", "YAML"],
];
const DEV_VOCAB = [
  "Supabase", "Vercel", "GitHub", "TypeScript", "Next.js", "Node.js", "PostgreSQL", "Kubernetes", "Docker", "Redis", "GraphQL",
  "Tailwind", "OAuth", "JWT", "API", "JSON", "git diff", "git rebase", "npm", "pnpm", "localhost", "camelCase", "snake_case",
];
const FILE_EXT =
  "ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|html|css|scss|json|yaml|yml|toml|md|sql|sh|env|txt|xml|vue|svelte|lock|ini|csv|ipynb";

// Whole words only, and never inside a file name or path (api.ts, @api, src/api).
const wordEdge = (inner) => new RegExp(`(?<![\\p{L}\\p{N}_@./-])${inner}(?![\\p{L}\\p{N}_]|\\.[\\p{L}])`, "giu");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function fixDevTerms(text) {
  let out = text;
  for (const [from, to] of DEV_TERMS) out = out.replace(wordEdge(escapeRe(from).replace(/ /g, "[ -]?")), to);
  return out;
}

/** "utils dot ts" → "utils.ts", "user underscore id" → "user_id", "@file" tagging in Cursor and Windsurf. */
function fixCodeSpeech(text, editor) {
  let out = text
    .replace(new RegExp(`([\\p{L}\\p{N}_-]+)\\s+dot\\s+(${FILE_EXT})(?![\\p{L}\\p{N}])`, "giu"), (_m, a, ext) => `${a}.${ext.toLowerCase()}`)
    .replace(/([\p{L}\p{N}]+)\s+underscore\s+(?=[\p{L}\p{N}])/giu, "$1_")
    .replace(/\bdot\s+env\b/gi, ".env")
    .replace(/\b(camel|snake|pascal|kebab)[ -]case\b/gi, (m) => m.toLowerCase());
  if (editor) {
    // "at file utils.ts", "tag file utils.ts", "at utils.ts" → "@utils.ts"
    out = out.replace(new RegExp(`\\b(?:at|tag|tagged)\\s+(?:the\\s+)?(?:file\\s+)?([\\p{L}\\p{N}_./-]+\\.(?:${FILE_EXT}))(?![\\p{L}\\p{N}])`, "giu"), "@$1");
  }
  return out;
}

const mostlyLatin = (text) => {
  const letters = text.match(/\p{L}/gu) || [];
  if (!letters.length) return false;
  return letters.filter((c) => c.charCodeAt(0) < 0x250).length / letters.length > 0.8;
};

function capitalizeLineStarts(text) {
  return text.replace(/(^|\n)([-•*]\s+|\d+[.)]\s+)?(\p{Ll})/gu, (_m, a, b = "", c) => a + b + c.toUpperCase());
}

/** Spoken commands and filler words. English only: other scripts pass through untouched. */
function fixSpeech(text) {
  let out = text
    // A filler that opened a sentence: the next word now starts it.
    .replace(/(^|[.!?]\s+)(?:u+m+|u+h+|e+r+m+|h+m+m+)[,.…]*\s+(\p{Ll})/giu, (_m, lead, c) => lead + c.toUpperCase())
    // Filler sounds, with the comma that usually trails them.
    .replace(/(^|[\s(])(?:u+m+|u+h+|e+r+m+|h+m+m+|uh[- ]huh)[,.…]*(?=\s|$)/gi, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(^|[.!?]\s+),\s*/g, "$1")
    // Spoken layout commands.
    .replace(/,?\s*\b(?:new|next) paragraph\b[,.;:]?\s*/gi, "\n\n")
    .replace(/,?\s*\b(?:new|next) line\b[,.;:]?\s*/gi, "\n")
    .replace(/,?[ \t]*\bbullet point\b[,.;:]?\s*/gi, "\n- ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  out = capitalizeLineStarts(out);
  return out.replace(/^(\p{Ll})/u, (c) => c.toUpperCase());
}

/**
 * @param {string} text  raw transcript
 * @param {{kind?: string, editor?: string|null, role?: string, language?: string}} ctx
 */
function formatOffline(text, ctx = {}) {
  if (!text) return text;
  let out = text;
  if (mostlyLatin(out)) out = fixSpeech(out);
  if (ctx.kind === "code") out = fixCodeSpeech(out, ctx.editor);
  if (ctx.kind === "code" || ctx.role === "developer") out = fixDevTerms(out);
  return out.trim();
}

// ---------- Instructions for the AI polish step ----------

const CONTEXT_RULES = {
  message:
    "The text is a chat message. Keep it short and conversational, as one message. Do not add a greeting or sign-off. Use a list only if the speaker clearly dictated one.",
  email:
    "The text is an email. Lay it out as an email body: the greeting on its own line if the speaker said one, short paragraphs with a blank line between them, and the sign-off on its own line if the speaker said one. Never invent a greeting, a name, a subject or a sign-off that was not spoken.",
  notes:
    "The text is going into a document or notes. Use clear paragraphs. Turn spoken sequences and enumerations into numbered or bulleted lists. Add a heading only if the speaker dictated one.",
  code:
    "The speaker is a developer working in a code editor or terminal. Keep technical terms, commands, flags and identifiers exact. Write identifiers the way code does when the speaker names a case or is clearly naming a variable, function or file: camelCase (userProfileId), snake_case (user_profile_id), PascalCase, kebab-case. Join spoken file names (“index dot ts” is index.ts). Spell tools and libraries correctly (Supabase, Vercel, GitHub, PostgreSQL, Next.js, git diff). Do not wrap anything in backticks or code fences, and never write code the speaker did not dictate.",
  prompt:
    "The text is a prompt the speaker is dictating to an AI assistant. Rewrite it as a clear, well-organised prompt: the goal first, then the relevant context, then constraints and the expected output, using short paragraphs or bullets where that helps. Keep every requirement the speaker gave and add none of your own. Do NOT answer the prompt or carry it out: output only the improved prompt.",
  other: "",
};

const ROLES = {
  general: "",
  developer:
    "The speaker is a software developer. Expect programming languages, frameworks, cloud services, CLI commands and code identifiers, and spell them the way developers write them.",
  student: "The speaker is a student. Expect course names, subject terminology, assignments and notes; keep explanations in the speaker's own words.",
  writer: "The speaker is a writer or content creator. Preserve their voice, rhythm and deliberate word choices; fix only real slips.",
  business:
    "The speaker works in business or management. Expect meetings, deadlines, company and product names, metrics and currency amounts; write dates, times and numbers the way business writing does.",
  support:
    "The speaker works in customer support or sales. Expect customer names, ticket and order numbers and product names; keep the text courteous and clear.",
  healthcare:
    "The speaker works in healthcare. Expect medical terminology, drug names, dosages and eponyms (for example Guillain–Barré syndrome); spell them correctly and never change a number, unit or dose.",
};

/** Rule lines for the cleanup prompt. `ctx` comes from resolveContext(). */
function contextRules(ctx = {}) {
  const rules = [];
  if (CONTEXT_RULES[ctx.kind]) rules.push(CONTEXT_RULES[ctx.kind]);
  if (ctx.kind === "code" && ctx.editor) {
    rules.push(
      `The speaker is in ${ctx.editor === "cursor" ? "Cursor" : "Windsurf"}: when they refer to a file to attach or tag (“at file”, “tag”), write it as @filename, for example @utils.ts.`
    );
  }
  if (ROLES[ctx.role]) rules.push(ROLES[ctx.role]);
  if (ctx.about) rules.push(`About the speaker, to help with names and terms only: ${String(ctx.about).slice(0, 400)}`);
  if (ctx.title) {
    rules.push(
      `The window they are typing in is titled “${String(ctx.title).slice(0, 120)}”. Names and terms in that title are likely spellings for similar-sounding words. Use it for spelling only.`
    );
  }
  return rules;
}

/** Keep the speaker's language: the polish step must never translate. */
function languageRule(language) {
  const lang = LANGUAGES[language];
  const list = "English, Hindi, Telugu, Tamil or Kannada";
  if (lang && language !== "en") {
    return `The speaker dictates in ${lang.name}. Reply in ${lang.name}, in its own script. Never translate. Keep English words the speaker mixed in (names, technical terms, everyday English) in English, exactly as people write when they mix languages. Apply the rules below to ${lang.name} text too: fix punctuation, drop fillers and repeated words.`;
  }
  if (language === "en") return "The speaker dictates in English. Never translate.";
  return `The transcript may be in ${list}, or a mix. Reply in the same language and script as the transcript. Never translate, and keep mixed-in English words in English.`;
}

module.exports = {
  LANGUAGES,
  LANGUAGE_CODES,
  APP_KINDS,
  ROLES,
  DEV_VOCAB,
  normalizeLanguage,
  sttPrompt,
  classifyApp,
  resolveContext,
  formatOffline,
  contextRules,
  languageRule,
};
