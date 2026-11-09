import type { LlmProvider, SttProvider, Tone } from "./wispr";

export const STT_PROVIDERS: Record<SttProvider, { name: string; blurb: string; models: string[]; keyUrl?: string; keyPrefix?: string }> = {
  openai: {
    name: "OpenAI",
    blurb: "Whisper & GPT-4o transcribe. Accurate in 50+ languages.",
    models: ["whisper-1", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"],
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-…",
  },
  groq: {
    name: "Groq",
    blurb: "Whisper Large v3 on LPUs. Extremely fast and inexpensive.",
    models: ["whisper-large-v3-turbo", "whisper-large-v3", "distil-whisper-large-v3-en"],
    keyUrl: "https://console.groq.com/keys",
    keyPrefix: "gsk_…",
  },
  custom: {
    name: "Self-hosted",
    blurb: "Any OpenAI-compatible server — e.g. Speaches or faster-whisper-server — for fully offline use.",
    models: [],
  },
};

export const LLM_PROVIDERS: Record<LlmProvider, { name: string; models: string[]; keyUrl?: string; keyPrefix?: string }> = {
  openai: { name: "OpenAI", models: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o"], keyUrl: "https://platform.openai.com/api-keys", keyPrefix: "sk-…" },
  anthropic: {
    name: "Anthropic",
    models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-…",
  },
  groq: { name: "Groq", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], keyUrl: "https://console.groq.com/keys", keyPrefix: "gsk_…" },
  custom: { name: "Self-hosted", models: [] },
};

export const TONES: Array<{ value: Tone; label: string; sample: string }> = [
  { value: "natural", label: "Natural", sample: "Let's meet at 5 — I'll bring the slides." },
  { value: "professional", label: "Professional", sample: "Let's meet at 5:00 PM. I will bring the slides." },
  { value: "casual", label: "Casual", sample: "let's meet at 5, i'll bring the slides" },
  { value: "verbatim", label: "Verbatim", sample: "um so let's meet at 4, actually 5, and uh I'll bring the slides" },
];

export const LANGUAGES: Array<[string, string]> = [
  ["auto", "Detect automatically"],
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["nl", "Dutch"],
  ["sv", "Swedish"],
  ["pl", "Polish"],
  ["tr", "Turkish"],
  ["ru", "Russian"],
  ["uk", "Ukrainian"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["ta", "Tamil"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
];
