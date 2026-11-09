import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Check, ChevronDown, CircleAlert, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { acceleratorKeys, eventToAccelerator } from "../lib/hotkey";
import { wispr } from "../lib/wispr";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Brand ---------- */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="wf-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6d4dff" />
          <stop offset="0.55" stopColor="#a24bff" />
          <stop offset="1" stopColor="#ff5c8a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#wf-g)" />
      <g fill="#fff">
        <rect x="7" y="13" width="2.6" height="6" rx="1.3" opacity="0.85" />
        <rect x="11.3" y="9.5" width="2.6" height="13" rx="1.3" />
        <rect x="15.6" y="6.5" width="2.6" height="19" rx="1.3" />
        <rect x="19.9" y="10.5" width="2.6" height="11" rx="1.3" />
        <rect x="24.2" y="13.5" width="2.6" height="5" rx="1.3" opacity="0.85" />
      </g>
    </svg>
  );
}

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand";
type Size = "sm" | "md" | "lg";
const variants: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:opacity-90 shadow-sm",
  brand: "brand-gradient text-white shadow-md hover:brightness-110",
  secondary: "bg-surface text-fg border border-line-strong hover:bg-surface-2 shadow-sm",
  ghost: "text-fg-2 hover:text-fg hover:bg-surface-3/70",
  danger: "text-danger hover:bg-danger/10",
};
const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12.5px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-[10px]",
  lg: "h-11 px-5 text-[14px] gap-2 rounded-xl",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-8 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-surface-3/70 hover:text-fg",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-line bg-surface shadow-sm", className)}>{children}</div>;
}

export function SectionTitle({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 px-1">
      <div>
        <h3 className="text-[13px] font-semibold tracking-tight text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-[12.5px] text-fg-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** A labelled settings row inside a Card. */
export function Row({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center justify-between gap-6 px-5 py-4 [&+&]:border-t [&+&]:border-line", className)}>
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium text-fg">{title}</div>
        {description && <div className="mt-0.5 text-[12.5px] leading-relaxed text-fg-3">{description}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/* ---------- Switch ---------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-accent" : "bg-surface-3 ring-1 ring-inset ring-line-strong"
      )}
    >
      <span
        className={cx(
          "absolute top-[3px] left-[3px] size-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200",
          checked && "translate-x-4"
        )}
      />
    </button>
  );
}

/* ---------- Inputs ---------- */
const fieldBase =
  "h-9 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] text-fg placeholder:text-fg-3 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={cx(fieldBase, className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx("relative", className)}>
      <select className={cx(fieldBase, "appearance-none pr-8")} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-3" />
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] text-fg-3">{hint}</span>}
    </label>
  );
}

/** API key input that never shows the stored key, only whether one exists. */
export function KeyInput({
  provider,
  hasKey,
  placeholder,
  onSaved,
}: {
  provider: string;
  hasKey: boolean;
  placeholder?: string;
  onSaved?: () => void;
}) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(!hasKey);
  const toast = useToast();
  useEffect(() => setEditing(!hasKey), [hasKey, provider]);

  if (!editing) {
    return (
      <div className="flex h-9 items-center justify-between rounded-[10px] border border-line-strong bg-surface-2 pr-1 pl-3 text-[13px]">
        <span className="flex items-center gap-2 text-fg-2">
          <span className="flex size-4 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span className="font-mono tracking-widest text-fg-3">••••••••••••••••</span>
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Replace
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={async () => {
              await wispr.setKey(provider, "");
              toast("API key removed");
              onSaved?.();
            }}
          >
            Remove
          </Button>
        </div>
      </div>
    );
  }
  const save = async () => {
    if (!value.trim()) return;
    await wispr.setKey(provider, value.trim());
    setValue("");
    toast("API key saved securely", "success");
    onSaved?.();
  };
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          type={show ? "text" : "password"}
          value={value}
          spellCheck={false}
          autoComplete="off"
          placeholder={placeholder || "Paste your API key"}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="pr-9 font-mono text-[12.5px]"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-fg-3 hover:text-fg"
          aria-label={show ? "Hide key" : "Show key"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <Button variant="primary" onClick={save} disabled={!value.trim()}>
        Save
      </Button>
      {hasKey && (
        <Button variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      )}
    </div>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode }>;
  className?: string;
}) {
  return (
    <div className={cx("inline-flex rounded-[11px] bg-surface-3/80 p-[3px] ring-1 ring-inset ring-line", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium transition-all",
            value === o.value ? "bg-surface text-fg shadow-sm ring-1 ring-line" : "text-fg-2 hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Kbd ---------- */
export function Kbd({ children, size = "md", tone = "default" }: { children: ReactNode; size?: "sm" | "md" | "lg"; tone?: "default" | "inverse" }) {
  return (
    <kbd
      className={cx(
        "inline-flex items-center justify-center rounded-md font-sans font-medium",
        tone === "default"
          ? "border border-line-strong border-b-2 bg-surface text-fg-2 shadow-sm"
          : "bg-white/15 text-white ring-1 ring-inset ring-white/20",
        size === "sm" && "h-5 min-w-5 px-1 text-[11px]",
        size === "md" && "h-6 min-w-6 px-1.5 text-[12px]",
        size === "lg" && "h-9 min-w-9 rounded-lg px-2.5 text-[15px]"
      )}
    >
      {children}
    </kbd>
  );
}

export function Hotkey({ accel, size = "md", tone }: { accel: string; size?: "sm" | "md" | "lg"; tone?: "default" | "inverse" }) {
  return (
    <span className="inline-flex items-center gap-1">
      {acceleratorKeys(accel).map((k, i) => (
        <Kbd key={i} size={size} tone={tone}>
          {k}
        </Kbd>
      ))}
    </span>
  );
}

/** Click to record a new global shortcut. */
export function HotkeyRecorder({ value, onSave }: { value: string; onSave: (accel: string) => Promise<string | null> }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;
    wispr.suspendHotkey(true);
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const accel = eventToAccelerator(e);
      if (!accel) return;
      setRecording(false);
      setError(await onSave(accel));
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      wispr.suspendHotkey(false);
    };
  }, [recording, onSave]);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        ref={ref}
        onClick={() => {
          setError(null);
          setRecording((r) => !r);
        }}
        onBlur={() => setRecording(false)}
        className={cx(
          "flex h-10 min-w-[180px] items-center justify-center gap-2 rounded-xl border px-3 transition-all",
          recording
            ? "border-accent bg-accent-soft ring-4 ring-accent/15"
            : "border-line-strong bg-surface-2 hover:border-fg-3/40"
        )}
      >
        {recording ? (
          <span className="flex items-center gap-2 text-[12.5px] font-medium text-accent-text">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            Press your shortcut…
          </span>
        ) : (
          <Hotkey accel={value} />
        )}
      </button>
      {error ? (
        <span className="max-w-[280px] text-right text-[12px] text-danger">{error}</span>
      ) : (
        <span className="text-[11.5px] text-fg-3">{recording ? "Esc to cancel" : "Click to change"}</span>
      )}
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "danger" }) {
  const tones = {
    neutral: "bg-surface-3 text-fg-2",
    accent: "bg-accent-soft text-accent-text",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/12 text-danger",
  };
  return (
    <span className={cx("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

/* ---------- Toasts ---------- */
type ToastTone = "neutral" | "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}
const ToastCtx = createContext<(message: string, tone?: ToastTone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: ToastTone = "neutral") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className="animate-fade-up flex items-center gap-2 rounded-xl bg-[#18181d] px-3.5 py-2.5 text-[13px] font-medium text-white shadow-lg ring-1 ring-white/10 dark:bg-[#2a2a33]"
          >
            {t.tone === "success" && <Check className="size-4 text-[#3dd68c]" strokeWidth={2.5} />}
            {t.tone === "error" && <CircleAlert className="size-4 text-[#ff6369]" />}
            {t.tone === "neutral" && <Info className="size-4 text-white/60" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="animate-float mb-5 flex size-14 items-center justify-center rounded-2xl border border-line bg-surface text-fg-3 shadow-md">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-fg-3">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
