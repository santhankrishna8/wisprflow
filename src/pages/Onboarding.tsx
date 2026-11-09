import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Keyboard, Lock, Mic, MousePointerClick, PartyPopper, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Field, HotkeyRecorder, Input, KeyInput, Logo, Hotkey, cx } from "../components/ui";
import { STT_PROVIDERS } from "../lib/providers";
import { isMac, wispr } from "../lib/wispr";
import type { DictationState, Settings, SttProvider } from "../lib/wispr";
import { ProviderCards, KeyLink, TestButton } from "./Settings";

type Step = "welcome" | "permissions" | "provider" | "hotkey" | "try";
const STEPS: Step[] = ["welcome", "permissions", "provider", "hotkey", "try"];

interface Props {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  refresh: () => void;
  state: DictationState;
}

export default function Onboarding({ settings, update, refresh, state }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const i = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, i + 1)]);
  const back = () => setStep(STEPS[Math.max(0, i - 1)]);
  const finish = () => update({ onboarded: true });

  const keyReady = settings.sttProvider === "custom" ? Boolean(settings.sttBaseUrl) : Boolean(settings.hasKey?.[settings.sttProvider]);

  return (
    <div className="flex h-full">
      <div className="drag flex min-w-0 flex-1 flex-col">
        <div className={cx("flex items-center gap-2.5 px-10", isMac ? "pt-12" : "pt-7")}>
          <Logo size={24} />
          <span className="text-[14px] font-semibold tracking-tight">WisprFlow</span>
        </div>

        <div className="no-drag flex flex-1 items-center px-10">
          <div key={step} className="animate-fade-up w-full max-w-[480px]">
            {step === "welcome" && <Welcome />}
            {step === "permissions" && <Permissions />}
            {step === "provider" && <Provider settings={settings} update={update} refresh={refresh} />}
            {step === "hotkey" && <HotkeyStep settings={settings} />}
            {step === "try" && <TryIt settings={settings} state={state} />}
          </div>
        </div>

        <div className="no-drag flex items-center justify-between px-10 pb-9">
          <div className="flex gap-1.5">
            {STEPS.map((s, idx) => (
              <span
                key={s}
                className={cx("h-1.5 rounded-full transition-all duration-300", idx === i ? "w-6 bg-accent" : idx < i ? "w-1.5 bg-accent/50" : "w-1.5 bg-surface-3")}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && (
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={back}>
                Back
              </Button>
            )}
            {step === "try" ? (
              <Button variant="brand" size="lg" onClick={finish}>
                Start using WisprFlow <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                variant={step === "welcome" ? "brand" : "primary"}
                size="lg"
                onClick={next}
                disabled={step === "provider" && !keyReady}
              >
                {step === "welcome" ? "Get started" : "Continue"} <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <Showcase step={step} hotkey={settings.hotkey} />
    </div>
  );
}

function Heading({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-7">
      {eyebrow && <div className="mb-3 text-[12px] font-semibold tracking-wide text-accent-text uppercase">{eyebrow}</div>}
      <h1 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.025em]">{title}</h1>
      {children && <p className="mt-3 text-[14px] leading-relaxed text-fg-2">{children}</p>}
    </div>
  );
}

function Welcome() {
  const points = [
    { icon: <MousePointerClick className="size-4" />, title: "Works everywhere", text: "Email, Slack, docs, your IDE — anywhere there's a cursor." },
    { icon: <Sparkles className="size-4" />, title: "Polished as you speak", text: "Filler words gone, punctuation fixed, self-corrections applied." },
    { icon: <Lock className="size-4" />, title: "Private by design", text: "Your keys, your provider. History stays on this device." },
  ];
  return (
    <>
      <Heading title={<>Write at the speed of <span className="brand-text">thought.</span></>}>
        Press a shortcut, say what you mean, and clean, well-punctuated text appears wherever you're typing.
      </Heading>
      <div className="flex flex-col gap-4">
        {points.map((p) => (
          <div key={p.title} className="flex gap-3.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">{p.icon}</span>
            <div>
              <div className="text-[13.5px] font-semibold">{p.title}</div>
              <div className="text-[13px] text-fg-3">{p.text}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function PermissionCard({ icon, title, text, granted, action }: { icon: ReactNode; title: string; text: string; granted: boolean; action: ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-xl", granted ? "bg-success/12 text-success" : "bg-surface-3 text-fg-2")}>
        {granted ? <Check className="size-5" strokeWidth={2.5} /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">{title}</div>
        <div className="text-[12.5px] text-fg-3">{text}</div>
      </div>
      {granted ? <span className="text-[12.5px] font-medium text-success">Granted</span> : action}
    </div>
  );
}

function Permissions() {
  const [mic, setMic] = useState(false);
  const [acc, setAcc] = useState(!isMac);
  useEffect(() => {
    wispr.getPermissions().then((p) => {
      setMic(p.microphone === "granted");
      setAcc(p.accessibility);
    });
    if (!isMac) return;
    const t = setInterval(() => wispr.getPermissions().then((p) => setAcc(p.accessibility)), 1500);
    return () => clearInterval(t);
  }, []);
  const askMic = async () => {
    try {
      await wispr.requestMic();
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setMic(true);
    } catch {
      setMic(false);
    }
  };
  return (
    <>
      <Heading eyebrow="Step 1 of 4" title="A couple of permissions">
        WisprFlow only listens while you hold the floor — never in the background.
      </Heading>
      <div className="flex flex-col gap-3">
        <PermissionCard
          icon={<Mic className="size-5" />}
          title="Microphone"
          text="To hear what you dictate."
          granted={mic}
          action={
            <Button size="sm" variant="primary" onClick={askMic}>
              Allow
            </Button>
          }
        />
        {isMac && (
          <PermissionCard
            icon={<Keyboard className="size-5" />}
            title="Accessibility"
            text="To paste text into the app you're using."
            granted={acc}
            action={
              <Button size="sm" variant="primary" onClick={() => wispr.openAccessibility()}>
                Open Settings
              </Button>
            }
          />
        )}
      </div>
    </>
  );
}

function Provider({ settings, update, refresh }: Omit<Props, "state">) {
  const p = STT_PROVIDERS[settings.sttProvider];
  return (
    <>
      <Heading eyebrow="Step 2 of 4" title="Connect a transcription engine">
        Bring your own key. Audio goes straight to the provider you pick.
      </Heading>
      <ProviderCards
        value={settings.sttProvider}
        onChange={(v: SttProvider) =>
          update({
            sttProvider: v,
            sttModel: STT_PROVIDERS[v].models[0] || settings.sttModel,
            ...(v !== "custom" ? { llmProvider: v, llmModel: v === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini" } : {}),
          })
        }
        options={(Object.keys(STT_PROVIDERS) as SttProvider[]).map((k) => ({ value: k, name: STT_PROVIDERS[k].name, blurb: STT_PROVIDERS[k].blurb }))}
      />
      <div className="mt-5 flex flex-col gap-4">
        {settings.sttProvider === "custom" && (
          <Field label="Base URL">
            <Input
              defaultValue={settings.sttBaseUrl}
              onBlur={(e) => update({ sttBaseUrl: e.target.value.trim(), cleanupEnabled: false })}
              placeholder="http://localhost:8000/v1"
              className="font-mono text-[12.5px]"
            />
          </Field>
        )}
        <Field label={settings.sttProvider === "custom" ? "API key (optional)" : `${p.name} API key`} hint={<KeyLink url={p.keyUrl} />}>
          <KeyInput provider={settings.sttProvider} hasKey={!!settings.hasKey?.[settings.sttProvider]} placeholder={p.keyPrefix} onSaved={refresh} />
        </Field>
        <TestButton kind="stt" />
      </div>
    </>
  );
}

function HotkeyStep({ settings }: { settings: Settings }) {
  return (
    <>
      <Heading eyebrow="Step 3 of 4" title="Pick your shortcut">
        Press it once to start talking and again to drop the text in. Choose something comfortable you'll reach for all day.
      </Heading>
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div>
          <div className="text-[13.5px] font-semibold">Dictation shortcut</div>
          <div className="text-[12.5px] text-fg-3">Works in every app</div>
        </div>
        <HotkeyRecorder
          value={settings.hotkey}
          onSave={async (accel) => {
            const r = await wispr.setHotkey(accel);
            return r.ok ? null : r.error || "Couldn't register shortcut";
          }}
        />
      </div>
    </>
  );
}

function TryIt({ settings, state }: { settings: Settings; state: DictationState }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    ref.current?.focus();
    return wispr.onHistoryAdded(() => setSuccess(true));
  }, []);
  const recording = state.status === "recording";
  return (
    <>
      <Heading eyebrow="Step 4 of 4" title={success ? "That's it. You're a natural." : "Give it a try"}>
        {success ? (
          "Use the same shortcut in any app. You can fine-tune style, language and more in Settings."
        ) : (
          <>
            Press <Hotkey accel={settings.hotkey} size="sm" /> and say something like{" "}
            <em className="text-fg">“Hey, um, can we meet at 4… actually 5 tomorrow?”</em>
          </>
        )}
      </Heading>
      <div
        className={cx(
          "relative rounded-2xl border bg-surface shadow-sm transition-all",
          recording ? "border-accent ring-4 ring-accent/15" : success ? "border-success/40" : "border-line-strong"
        )}
      >
        <textarea
          ref={ref}
          rows={5}
          placeholder="Your words will appear here…"
          className="w-full resize-none rounded-2xl bg-transparent p-4 text-[14px] leading-relaxed outline-none placeholder:text-fg-3"
        />
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12px] text-fg-3">
          <span className="flex items-center gap-2">
            {recording ? (
              <>
                <span className="size-1.5 animate-pulse rounded-full bg-[#ff5c8a]" /> Listening…
              </>
            ) : state.status === "processing" ? (
              <span className="shimmer-text font-medium">Polishing your words…</span>
            ) : success ? (
              <span className="flex items-center gap-1.5 font-medium text-success">
                <PartyPopper className="size-3.5" /> Nailed it
              </span>
            ) : (
              "Waiting for you to speak"
            )}
          </span>
          <button onClick={() => wispr.toggleDictation()} className="font-medium text-accent-text hover:underline">
            {recording ? "Stop" : "Or click to start"}
          </button>
        </div>
      </div>
    </>
  );
}

/* Right-hand visual panel */
function Showcase({ step, hotkey }: { step: Step; hotkey: string }) {
  const lines: Record<Step, { raw: string; clean: string }> = {
    welcome: { raw: "so um I think we should uh ship it on friday", clean: "I think we should ship it on Friday." },
    permissions: { raw: "remind me to call mom at 6 no wait 7", clean: "Remind me to call Mom at 7." },
    provider: { raw: "the api returns a four oh four for missing users", clean: "The API returns a 404 for missing users." },
    hotkey: { raw: "groceries eggs milk and uh coffee beans", clean: "Groceries:\n• Eggs\n• Milk\n• Coffee beans" },
    try: { raw: "thanks so much this is like super helpful", clean: "Thanks so much — this is super helpful!" },
  };
  const l = lines[step];
  return (
    <div className="drag relative hidden w-[44%] max-w-[560px] shrink-0 overflow-hidden bg-[#0e0e13] lg:block">
      <div className="absolute -top-20 -right-20 size-[420px] rounded-full bg-[#6d4dff] opacity-40 blur-[110px]" />
      <div className="absolute -bottom-24 -left-10 size-[360px] rounded-full bg-[#ff5c8a] opacity-25 blur-[110px]" />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
      />
      <div className="relative flex h-full flex-col items-center justify-center px-10">
        <div key={step} className="animate-fade-up w-full max-w-[360px]">
          <div className="mb-3 text-[11px] font-semibold tracking-wider text-white/40 uppercase">You say</div>
          <p className="text-[15px] leading-relaxed text-white/50 italic">“{l.raw}”</p>
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <Sparkles className="size-4 text-[#a996ff]" />
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
          <div className="mb-3 text-[11px] font-semibold tracking-wider text-white/40 uppercase">WisprFlow types</div>
          <div className="rounded-2xl bg-white/[0.06] p-4 text-[15px] leading-relaxed whitespace-pre-line text-white ring-1 ring-white/10 backdrop-blur">
            {l.clean}
            <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-[#a996ff]" />
          </div>
        </div>

        {/* Mini pill preview */}
        <div className="absolute bottom-10 flex items-center gap-3 rounded-full bg-[#1b1b22]/90 py-2 pr-4 pl-2 shadow-2xl ring-1 ring-white/10">
          <span className="flex size-7 items-center justify-center rounded-full bg-[#ff5c8a]">
            <Mic className="size-3.5 text-white" />
          </span>
          <span className="flex h-5 items-center gap-[3px]">
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-white/80"
                style={{ height: `${30 + ((i * 37) % 70)}%`, animation: `bar ${0.7 + (i % 4) * 0.15}s ease-in-out ${i * 0.06}s infinite` }}
              />
            ))}
          </span>
          <Hotkey accel={hotkey} size="sm" tone="inverse" />
        </div>
      </div>
    </div>
  );
}
