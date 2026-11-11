import { cx } from "./ui";
import { LANGUAGES, normalizeLanguage } from "../lib/providers";

/** Choose the language you dictate in. Compact = a single row of chips. */
export function LanguagePicker({ value, onChange, compact }: { value: string; onChange: (code: string) => void; compact?: boolean }) {
  const current = normalizeLanguage(value);
  if (compact) {
    return (
      <div role="radiogroup" aria-label="Dictation language" className="flex flex-wrap gap-1.5">
        {LANGUAGES.map(([code, name, native]) => {
          const active = code === current;
          return (
            <button
              key={code}
              role="radio"
              aria-checked={active}
              title={code === "auto" ? "Detect which of the five languages you're speaking" : name}
              onClick={() => onChange(code)}
              className={cx(
                "h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
                active ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface text-fg-2 hover:border-fg-3 hover:text-fg"
              )}
            >
              {code === "auto" ? "Auto" : native}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label="Dictation language" className="grid grid-cols-3 gap-2.5">
      {LANGUAGES.map(([code, name, native]) => {
        const active = code === current;
        return (
          <button
            key={code}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(code)}
            className={cx(
              "rounded-xl border px-3.5 py-3 text-left transition-all",
              active ? "border-accent bg-accent-soft ring-4 ring-accent/10" : "border-line-strong bg-surface hover:border-fg-3/60"
            )}
          >
            <div className="text-[15px] leading-tight font-semibold">{code === "auto" ? "Auto" : native}</div>
            <div className="mt-1 text-[11.5px] text-fg-3">{code === "auto" ? "Detects which one you speak" : name}</div>
          </button>
        );
      })}
    </div>
  );
}
