import { useEffect, useState } from "react";
import { Check, CircleAlert, ExternalLink, Laptop, Moon, Plug, ShieldCheck, Sun } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button,
  Card,
  Field,
  HotkeyRecorder,
  Input,
  KeyInput,
  Logo,
  Row,
  SectionTitle,
  Segmented,
  Select,
  Switch,
  cx,
  useToast,
} from "../components/ui";
import { LANGUAGES, LLM_PROVIDERS, STT_PROVIDERS, TONES } from "../lib/providers";
import { isMac, wispr } from "../lib/wispr";
import type { LlmProvider, Settings, SttProvider, Theme } from "../lib/wispr";

type Tab = "general" | "transcription" | "cleanup" | "appearance" | "about";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "general", label: "General" },
  { id: "transcription", label: "Transcription" },
  { id: "cleanup", label: "AI cleanup" },
  { id: "appearance", label: "Appearance" },
  { id: "about", label: "About" },
];

interface Props {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  refresh: () => void;
}

export default function SettingsPage(props: Props) {
  const [tab, setTab] = useState<Tab>("general");
  return (
    <div className="mx-auto max-w-[760px] px-10 pt-14 pb-16">
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Settings</h1>
      </header>
      <div className="mb-7 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "relative -mb-px h-10 px-3 text-[13px] font-medium transition-colors",
              tab === t.id ? "text-fg" : "text-fg-3 hover:text-fg-2"
            )}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent" />}
          </button>
        ))}
      </div>
      <div key={tab} className="animate-fade-up">
        {tab === "general" && <General {...props} />}
        {tab === "transcription" && <Transcription {...props} />}
        {tab === "cleanup" && <Cleanup {...props} />}
        {tab === "appearance" && <Appearance {...props} />}
        {tab === "about" && <About />}
      </div>
    </div>
  );
}

function General({ settings, update }: Props) {
  const toast = useToast();
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setMics(d.filter((x) => x.kind === "audioinput" && x.deviceId)))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle title="Shortcut" description="Press once to start dictating, press again to paste." />
        <Card>
          <Row title="Dictation shortcut" description="Works system-wide, in any app. Press Esc while recording to cancel.">
            <HotkeyRecorder
              value={settings.hotkey}
              onSave={async (accel) => {
                const r = await wispr.setHotkey(accel);
                if (r.ok) toast("Shortcut updated", "success");
                return r.ok ? null : r.error || "Couldn't register shortcut";
              }}
            />
          </Row>
        </Card>
      </section>

      <section>
        <SectionTitle title="Output" />
        <Card>
          <Row title="Paste automatically" description="Insert text at your cursor. When off, text is copied to the clipboard.">
            <Switch checked={settings.autoPaste} onChange={(v) => update({ autoPaste: v })} label="Paste automatically" />
          </Row>
          <Row title="Restore clipboard" description="Put back whatever you had copied after pasting.">
            <Switch checked={settings.restoreClipboard} onChange={(v) => update({ restoreClipboard: v })} label="Restore clipboard" />
          </Row>
          <Row title="Sound effects" description="Soft chimes when recording starts and stops.">
            <Switch checked={settings.soundEffects} onChange={(v) => update({ soundEffects: v })} label="Sound effects" />
          </Row>
        </Card>
      </section>

      <section>
        <SectionTitle title="System" />
        <Card>
          <Row title="Microphone">
            <Select value={settings.micDeviceId} onChange={(e) => update({ micDeviceId: e.target.value })} className="w-[260px]">
              <option value="default">System default</option>
              {mics
                .filter((m) => m.deviceId !== "default")
                .map((m) => (
                  <option key={m.deviceId} value={m.deviceId}>
                    {m.label || "Microphone"}
                  </option>
                ))}
            </Select>
          </Row>
          <Row title="Launch at login" description="Start WisprFlow quietly in the background.">
            <Switch checked={settings.launchAtLogin} onChange={(v) => update({ launchAtLogin: v })} label="Launch at login" />
          </Row>
          {isMac && <PermissionsRow />}
        </Card>
      </section>
    </div>
  );
}

function PermissionsRow() {
  const [acc, setAcc] = useState<boolean | null>(null);
  useEffect(() => {
    wispr.getPermissions().then((p) => setAcc(p.accessibility));
  }, []);
  return (
    <Row title="Accessibility access" description="Required on macOS to paste into other apps.">
      {acc ? (
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-success">
          <Check className="size-4" /> Granted
        </span>
      ) : (
        <Button size="sm" onClick={() => wispr.openAccessibility()}>
          Grant access
        </Button>
      )}
    </Row>
  );
}

function ProviderCards<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; name: string; blurb?: string }>;
}) {
  return (
    <div className={cx("grid gap-2.5", options.length > 3 ? "grid-cols-4" : "grid-cols-3")}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative rounded-xl border p-3.5 text-left transition-all",
              active ? "border-accent bg-accent-soft/60 ring-4 ring-accent/10" : "border-line-strong bg-surface hover:border-fg-3/40"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold">{o.name}</span>
              <span
                className={cx(
                  "flex size-4 items-center justify-center rounded-full border",
                  active ? "border-accent bg-accent text-white" : "border-line-strong"
                )}
              >
                {active && <Check className="size-2.5" strokeWidth={3.5} />}
              </span>
            </div>
            {o.blurb && <p className="mt-1.5 text-[11.5px] leading-snug text-fg-3">{o.blurb}</p>}
          </button>
        );
      })}
    </div>
  );
}

function TestButton({ kind }: { kind: "stt" | "llm" }) {
  const [state, setState] = useState<{ loading?: boolean; ok?: boolean; error?: string }>({});
  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        loading={state.loading}
        icon={<Plug className="size-3.5" />}
        onClick={async () => {
          setState({ loading: true });
          setState(await wispr.testConnection(kind));
        }}
      >
        Test connection
      </Button>
      {state.ok && (
        <span className="animate-fade-up flex items-center gap-1 text-[12.5px] font-medium text-success">
          <Check className="size-4" /> Connected
        </span>
      )}
      {state.error && (
        <span className="animate-fade-up flex items-center gap-1 text-[12.5px] text-danger">
          <CircleAlert className="size-4" /> {state.error}
        </span>
      )}
    </div>
  );
}

function ModelPicker({ models, value, onChange }: { models: string[]; value: string; onChange: (v: string) => void }) {
  if (!models.length) return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Model name" />;
  return (
    <Select value={models.includes(value) ? value : "__custom"} onChange={(e) => onChange(e.target.value === "__custom" ? "" : e.target.value)}>
      {models.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
      {!models.includes(value) && <option value="__custom">{value || "Custom…"}</option>}
    </Select>
  );
}

function KeyLink({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <button onClick={() => wispr.openExternal(url)} className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
      Get a key <ExternalLink className="size-3" />
    </button>
  );
}

function Transcription({ settings, update, refresh }: Props) {
  const p = STT_PROVIDERS[settings.sttProvider];
  const choose = (v: SttProvider) =>
    update({ sttProvider: v, sttModel: STT_PROVIDERS[v].models[0] || settings.sttModel });
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle title="Speech-to-text provider" description="Audio is sent only to the provider you choose — never anywhere else." />
        <ProviderCards
          value={settings.sttProvider}
          onChange={choose}
          options={(Object.keys(STT_PROVIDERS) as SttProvider[]).map((k) => ({ value: k, name: STT_PROVIDERS[k].name, blurb: STT_PROVIDERS[k].blurb }))}
        />
      </section>
      <Card className="flex flex-col gap-5 p-5">
        {settings.sttProvider === "custom" && (
          <Field label="Base URL" hint="OpenAI-compatible endpoint. We'll call {base}/audio/transcriptions.">
            <Input
              defaultValue={settings.sttBaseUrl}
              onBlur={(e) => update({ sttBaseUrl: e.target.value.trim() })}
              placeholder="http://localhost:8000/v1"
              className="font-mono text-[12.5px]"
            />
          </Field>
        )}
        <Field label={settings.sttProvider === "custom" ? "API key (optional)" : `${p.name} API key`} hint={<KeyLink url={p.keyUrl} />}>
          <KeyInput provider={settings.sttProvider} hasKey={!!settings.hasKey?.[settings.sttProvider]} placeholder={p.keyPrefix} onSaved={refresh} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Model">
            <ModelPicker models={p.models} value={settings.sttModel} onChange={(v) => update({ sttModel: v })} />
          </Field>
          <Field label="Language">
            <Select value={settings.language} onChange={(e) => update({ language: e.target.value })}>
              {LANGUAGES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="border-t border-line pt-4">
          <TestButton kind="stt" />
        </div>
      </Card>
    </div>
  );
}

function Cleanup({ settings, update, refresh }: Props) {
  const p = LLM_PROVIDERS[settings.llmProvider];
  const choose = (v: LlmProvider) => update({ llmProvider: v, llmModel: LLM_PROVIDERS[v].models[0] || settings.llmModel });
  const on = settings.cleanupEnabled;
  return (
    <div className="flex flex-col gap-8">
      <Card>
        <Row
          title="Polish with AI"
          description="Removes filler words, fixes punctuation, applies self-corrections and formats lists — without changing what you meant."
        >
          <Switch checked={on} onChange={(v) => update({ cleanupEnabled: v })} label="Polish with AI" />
        </Row>
      </Card>

      <div className={cx("flex flex-col gap-8 transition-opacity", !on && "pointer-events-none opacity-45")}>
        <section>
          <SectionTitle title="Writing style" />
          <div className="grid grid-cols-2 gap-2.5">
            {TONES.map((t) => {
              const active = settings.tone === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => update({ tone: t.value })}
                  className={cx(
                    "rounded-xl border p-4 text-left transition-all",
                    active ? "border-accent bg-accent-soft/60 ring-4 ring-accent/10" : "border-line-strong bg-surface hover:border-fg-3/40"
                  )}
                >
                  <div className="text-[13px] font-semibold">{t.label}</div>
                  <p className="mt-1.5 font-serif text-[13px] leading-snug text-fg-2 italic">“{t.sample}”</p>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <SectionTitle title="Language model" description="A small, fast model is plenty — cleanup should feel instant." />
          <ProviderCards
            value={settings.llmProvider}
            onChange={choose}
            options={(Object.keys(LLM_PROVIDERS) as LlmProvider[]).map((k) => ({ value: k, name: LLM_PROVIDERS[k].name }))}
          />
          <Card className="mt-3 flex flex-col gap-5 p-5">
            {settings.llmProvider === "custom" && (
              <Field label="Base URL" hint="OpenAI-compatible chat endpoint, e.g. Ollama or LM Studio.">
                <Input
                  defaultValue={settings.llmBaseUrl}
                  onBlur={(e) => update({ llmBaseUrl: e.target.value.trim() })}
                  placeholder="http://localhost:11434/v1"
                  className="font-mono text-[12.5px]"
                />
              </Field>
            )}
            {settings.llmProvider !== settings.sttProvider || settings.llmProvider === "custom" ? (
              <Field label={settings.llmProvider === "custom" ? "API key (optional)" : `${p.name} API key`} hint={<KeyLink url={p.keyUrl} />}>
                <KeyInput provider={settings.llmProvider} hasKey={!!settings.hasKey?.[settings.llmProvider]} placeholder={p.keyPrefix} onSaved={refresh} />
              </Field>
            ) : (
              <p className="flex items-center gap-2 text-[12.5px] text-fg-3">
                <ShieldCheck className="size-4 text-success" /> Uses the same {p.name} key as transcription.
              </p>
            )}
            <Field label="Model">
              <ModelPicker models={p.models} value={settings.llmModel} onChange={(v) => update({ llmModel: v })} />
            </Field>
            <div className="border-t border-line pt-4">
              <TestButton kind="llm" />
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}

function Appearance({ settings, update }: Props) {
  const options: Array<{ value: Theme; label: string; icon: ReactNode }> = [
    { value: "system", label: "System", icon: <Laptop className="size-4" /> },
    { value: "light", label: "Light", icon: <Sun className="size-4" /> },
    { value: "dark", label: "Dark", icon: <Moon className="size-4" /> },
  ];
  return (
    <section>
      <SectionTitle title="Theme" />
      <div className="grid grid-cols-3 gap-3">
        {options.map((o) => {
          const active = settings.theme === o.value;
          return (
            <button key={o.value} onClick={() => update({ theme: o.value })} className="group text-left">
              <div
                className={cx(
                  "overflow-hidden rounded-xl border-2 transition-all",
                  active ? "border-accent ring-4 ring-accent/15" : "border-line group-hover:border-line-strong"
                )}
              >
                <ThemePreview mode={o.value} />
              </div>
              <div className={cx("mt-2.5 flex items-center gap-2 px-0.5 text-[13px] font-medium", active ? "text-fg" : "text-fg-2")}>
                {o.icon}
                {o.label}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ThemePreview({ mode }: { mode: Theme }) {
  const pane = (dark: boolean) => (
    <div className={cx("flex h-full flex-1", dark ? "bg-[#0d0d11]" : "bg-[#f7f7f5]")}>
      <div className={cx("w-1/4 border-r p-1.5", dark ? "border-white/5 bg-[#0a0a0d]" : "border-black/5 bg-[#f0f0ed]")}>
        <div className="mb-1.5 size-2.5 rounded brand-gradient" />
        {[0, 1, 2].map((i) => (
          <div key={i} className={cx("mb-1 h-1 rounded-full", dark ? "bg-white/15" : "bg-black/10")} />
        ))}
      </div>
      <div className="flex-1 p-2">
        <div className="mb-1.5 h-5 rounded bg-[#121218]" />
        <div className={cx("h-3 rounded", dark ? "bg-[#15151b]" : "bg-white shadow-sm")} />
      </div>
    </div>
  );
  return (
    <div className="flex h-[92px]">
      {mode === "system" ? (
        <>
          {pane(false)}
          {pane(true)}
        </>
      ) : (
        pane(mode === "dark")
      )}
    </div>
  );
}

function About() {
  const [info, setInfo] = useState<{ version: string } | null>(null);
  useEffect(() => {
    wispr.appInfo().then(setInfo);
  }, []);
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex items-center gap-4 p-5">
        <Logo size={48} />
        <div>
          <div className="text-[15px] font-semibold">WisprFlow</div>
          <div className="text-[12.5px] text-fg-3">Version {info?.version ?? "—"}</div>
        </div>
      </Card>
      <Card>
        <Row title="Your data stays yours" description="History, dictionary and settings are stored locally. API keys are encrypted with your OS keychain. No telemetry, ever.">
          <ShieldCheck className="size-5 text-success" />
        </Row>
        <Row title="Inspired by OpenWhispr" description="Open-source, MIT licensed.">
          <Button size="sm" variant="ghost" onClick={() => wispr.openExternal("https://github.com/OpenWhispr/openwhispr")}>
            GitHub <ExternalLink className="size-3.5" />
          </Button>
        </Row>
      </Card>
    </div>
  );
}

export { ProviderCards, KeyLink, TestButton };
