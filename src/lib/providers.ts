import type { FormatMode, LlmProvider, Role, SttProvider, Tone } from "./bridge";

export const STT_PROVIDERS: Record<SttProvider, { name: string; blurb: string; models: string[]; defaultModel?: string; keyUrl?: string; keyPrefix?: string }> = {
  local: {
    name: "On this PC",
    blurb: "Private and offline. Free, no API key. Runs only while you dictate.",
    models: [],
  },
  openai: {
    name: "OpenAI",
    blurb: "Whisper & GPT-4o transcribe. Strong in English and Hindi.",
    models: ["whisper-1", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"],
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-…",
  },
  groq: {
    name: "Groq",
    blurb: "Whisper Large v3, very fast. The quickest accurate option for Telugu, Tamil and Kannada.",
    models: ["whisper-large-v3", "whisper-large-v3-turbo"],
    keyUrl: "https://console.groq.com/keys",
    keyPrefix: "gsk_…",
  },
  custom: {
    name: "Self-hosted",
    blurb: "Any OpenAI-compatible server — e.g. Speaches or faster-whisper-server — for fully offline use.",
    models: [],
    defaultModel: "Systran/faster-whisper-small",
  },
};

export const LLM_PROVIDERS: Record<LlmProvider, { name: string; models: string[]; defaultModel?: string; keyUrl?: string; keyPrefix?: string }> = {
  openai: { name: "OpenAI", models: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o"], keyUrl: "https://platform.openai.com/api-keys", keyPrefix: "sk-…" },
  anthropic: {
    name: "Anthropic",
    models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-…",
  },
  groq: { name: "Groq", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], keyUrl: "https://console.groq.com/keys", keyPrefix: "gsk_…" },
  custom: { name: "Self-hosted", models: [], defaultModel: "llama3.2:3b" },
};

/** One-click preset for a local Ollama install (cleanup only). */
export const OLLAMA_PRESET = { llmProvider: "custom" as const, llmBaseUrl: "http://localhost:11434/v1", llmModel: "llama3.2:3b" };



export const TONES: Array<{ value: Tone; label: string; sample: string }> = [
  { value: "natural", label: "Natural", sample: "Let's meet at 5 — I'll bring the slides." },
  { value: "professional", label: "Professional", sample: "Let's meet at 5:00 PM. I will bring the slides." },
  { value: "casual", label: "Casual", sample: "let's meet at 5, i'll bring the slides" },
  { value: "verbatim", label: "Verbatim", sample: "um so let's meet at 4, actually 5, and uh I'll bring the slides" },
];

/** The languages SayType is built for. Native names help people spot their own. */
export const LANGUAGES: Array<[code: string, name: string, native: string]> = [
  ["auto", "Detect automatically", "Any of the five below"],
  ["en", "English", "English"],
  ["hi", "Hindi", "हिन्दी"],
  ["te", "Telugu", "తెలుగు"],
  ["ta", "Tamil", "தமிழ்"],
  ["kn", "Kannada", "ಕನ್ನಡ"],
];
export const INDIC = ["hi", "te", "ta", "kn"];
export const languageName = (code: string) => LANGUAGES.find(([c]) => c === code)?.[1] ?? "your language";
/** Older versions offered more languages; anything else now means auto-detect. */
export const normalizeLanguage = (code: string) => (LANGUAGES.some(([c]) => c === code) ? code : "auto");

export const FORMAT_MODES: Array<{ value: FormatMode; label: string; hint: string }> = [
  { value: "auto", label: "Match the app", hint: "Email in Outlook or Gmail, short messages in WhatsApp or Slack, prompts in ChatGPT, code terms in your editor." },
  { value: "message", label: "Message", hint: "Short and conversational, no greeting or sign-off." },
  { value: "email", label: "Email", hint: "Greeting, short paragraphs and sign-off on their own lines." },
  { value: "notes", label: "Notes", hint: "Paragraphs and lists, ready for a document." },
  { value: "code", label: "Code", hint: "camelCase and snake_case, file names, tools like Supabase and Vercel." },
  { value: "prompt", label: "AI prompt", hint: "Rewrites what you said as a clear, structured prompt." },
  { value: "other", label: "Plain", hint: "Punctuation and cleanup only." },
];

export const ROLES: Array<{ value: Role; label: string; hint: string }> = [
  { value: "general", label: "General", hint: "No special vocabulary." },
  { value: "developer", label: "Developer", hint: "Frameworks, commands and identifiers." },
  { value: "student", label: "Student", hint: "Courses, subjects and notes." },
  { value: "writer", label: "Writer", hint: "Keeps your voice and rhythm." },
  { value: "business", label: "Business", hint: "Meetings, metrics and names." },
  { value: "support", label: "Support / Sales", hint: "Customers, tickets and orders." },
  { value: "healthcare", label: "Healthcare", hint: "Medical terms, drugs and doses." },
];
