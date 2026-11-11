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
import { FORMAT_MODES, INDIC, LLM_PROVIDERS, OLLAMA_PRESET, ROLES, STT_PROVIDERS, TONES, languageName, normalizeLanguage } from "../lib/providers";
import { LanguagePicker } from "../components/LanguagePicker";
import { LocalModelPicker, useLocalModels } from "../components/LocalModels";
import { isMac, bridge } from "../lib/bridge";
import type { LlmProvider, Settings, SttProvider, Theme } from "../lib/bridge";

type Tab = "general" | "transcription" | "cleanup" | "appearance" | "about";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "general", label: "General" },
  { id: "transcription", label: "Transcription" },
  { id: "cleanup", label: "Formatting" },
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
        {tab === "about" && <About settings={props.settings} />}
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
                const r = await bridge.setHotkey(accel);
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
          <Row
            title="Floating pill"
            description="A slim pill at the edge of your screen. Click to dictate, drag to move. Its arrow tucks it into the edge; click the tab that's left to bring it back."
          >
            <Switch checked={settings.showBubble} onChange={(v) => update({ showBubble: v })} label="Floating pill" />
          </Row>
          {settings.showBubble && settings.bubbleCollapsed && (
            <Row title="The pill is tucked into the screen edge" description="Look for the slim tab on the side of your screen, or bring the pill back from here.">
              <Button size="sm" onClick={() => bridge.setBubbleCollapsed(false)}>
                Bring it back
              </Button>
            </Row>
          )}
          <Row title="Sound effects" description="Soft chimes when recording starts and stops.">
            <Switch checked={settings.soundEffects} onChange={(v) => update({ soundEffects: v })} label="Sound effects" />
          </Row>
        </Card>
      </section>

      <section>
        <SectionTitle title="Privacy" />
        <Card>
          <Row title="Keep history" description="Older dictations are deleted automatically. Stats only count what's kept.">
            <Select
              value={settings.historyRetention}
              onChange={(e) => update({ historyRetention: e.target.value as Settings["historyRetention"] })}
              className="w-[180px]"
            >
              <option value="forever">Forever</option>
              <option value="3h">3 hours</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </Select>
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
          <Row title="Check for updates" description="Asks GitHub whether a newer release exists, about once a day. Nothing about you is sent.">
            <Switch checked={settings.checkUpdates} onChange={(v) => update({ checkUpdates: v })} label="Check for updates" />
          </Row>
          <Row title="Launch at login" description="Start Vaakya quietly in the background.">
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
    bridge.getPermissions().then((p) => setAcc(p.accessibility));
  }, []);
  return (
    <Row title="Accessibility access" description="Required on macOS to paste into other apps.">
      {acc ? (
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-success">
          <Check className="size-4" /> Granted
        </span>
      ) : (
        <Button size="sm" onClick={() => bridge.openAccessibility()}>
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
    <div className={cx("grid gap-2.5", options.length === 3 ? "grid-cols-3" : options.length > 4 || options.some((o) => o.blurb) ? "grid-cols-2" : "grid-cols-4")}>
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
                  active ? "border-accent bg-accent text-accent-ink" : "border-line-strong"
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
  const [state, setState] = useState<{ loading?: boolean; ok?: boolean; error?: string; message?: string }>({});
  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        loading={state.loading}
        icon={<Plug className="size-3.5" />}
        onClick={async () => {
          setState({ loading: true });
          setState(await bridge.testConnection(kind));
        }}
      >
        Test connection
      </Button>
      {state.ok && (
        <span className="animate-fade-up flex items-center gap-1 text-[12.5px] font-medium text-success">
          <Check className="size-4" /> {(state as { message?: string }).message || "Connected"}
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
  const [custom, setCustom] = useState(false);
  if (!models.length || custom || !models.includes(value)) {
    return (
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Model name" className="font-mono text-[12.5px]" />
        {models.length > 0 && (
          <Button
            size="sm"
            onClick={() => {
              setCustom(false);
              onChange(models[0]);
            }}
          >
            List
          </Button>
        )}
      </div>
    );
  }
  return (
    <Select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__custom") setCustom(true);
        else onChange(e.target.value);
      }}
    >
      {models.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
      <option value="__custom">Other…</option>
    </Select>
  );
}

function KeyLink({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <button onClick={() => bridge.openExternal(url)} className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
      Get a key <ExternalLink className="size-3" />
    </button>
  );
}

function Transcription({ settings, update, refresh }: Props) {
  const p = STT_PROVIDERS[settings.sttProvider];
  const choose = (v: SttProvider) =>
    update({ sttProvider: v, sttModel: STT_PROVIDERS[v].models[0] || STT_PROVIDERS[v].defaultModel || settings.sttModel });
  const lang = normalizeLanguage(settings.language);
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle
          title="Language you speak"
          description="Choosing your language is faster and far more accurate than Auto, especially for Telugu, Tamil and Kannada."
        />
        <LanguagePicker value={settings.language} onChange={(code) => update({ language: code })} />
        {lang !== "en" && (
          <p className="mt-3 px-1 text-[12px] leading-relaxed text-fg-3">
            English words you mix in ({lang === "auto" ? "names, technical terms" : `while speaking ${languageName(lang)}`}) stay in English. You can also switch language from the
            tray icon's menu.
          </p>
        )}
      </section>
      <section>
        <SectionTitle title="Speech-to-text provider" description="Audio is sent only to the provider you choose — never anywhere else." />
        <ProviderCards
          value={settings.sttProvider}
          onChange={choose}
          options={(Object.keys(STT_PROVIDERS) as SttProvider[]).map((k) => ({ value: k, name: STT_PROVIDERS[k].name, blurb: STT_PROVIDERS[k].blurb }))}
        />
      </section>
      {settings.sttProvider === "local" ? (
        <LocalSection settings={settings} update={update} />
      ) : (
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
        <Field label="Model" hint={INDIC.includes(lang) || lang === "auto" ? "For Indian languages pick a Large v3 model. Smaller or English-only models get them wrong." : undefined}>
          <ModelPicker models={p.models} value={settings.sttModel} onChange={(v) => update({ sttModel: v })} />
        </Field>
        <div className="border-t border-line pt-4">
          <TestButton kind="stt" />
        </div>
      </Card>
      )}
    </div>
  );
}

function LocalSection({ settings, update }: Pick<Props, "settings" | "update">) {
  const local = useLocalModels();
  const ready = local.models.some((m) => m.id === settings.localModel && m.downloaded);
  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionTitle title="Model" description="Bigger models are more accurate but slower. You can switch any time." />
        <LocalModelPicker value={settings.localModel} onChange={(id) => update({ localModel: id })} state={local} language={settings.language} />
      </section>
      {ready && (
        <Card className="p-5">
          <TestButton kind="stt" />
        </Card>
      )}
    </div>
  );
}

function Cleanup({ settings, update, refresh }: Props) {
  const p = LLM_PROVIDERS[settings.llmProvider];
  const choose = (v: LlmProvider) => update({ llmProvider: v, llmModel: LLM_PROVIDERS[v].models[0] || LLM_PROVIDERS[v].defaultModel || settings.llmModel });
  const on = settings.cleanupEnabled;
  const configured = settings.llmProvider === "custom" ? Boolean(settings.llmBaseUrl) : Boolean(settings.hasKey?.[settings.llmProvider]);
  return (
    <div className="flex flex-col gap-8">
      {on && !configured && (
        <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-[12.5px] text-fg-2">
          <CircleAlert className="size-4 shrink-0 text-warning" /> No {p.name} key or endpoint is set below, so only instant formatting applies. Add one for lists, emails,
          prompts and role-aware polish.
        </p>
      )}
      <section>
        <SectionTitle title="Format for" description="How your words are laid out depends on where they're going." />
        <div className="grid grid-cols-2 gap-2.5">
          {FORMAT_MODES.map((m) => {
            const active = (settings.formatMode || "auto") === m.value;
            return (
              <button
                key={m.value}
                onClick={() => update({ formatMode: m.value })}
                className={cx(
                  "rounded-xl border p-3.5 text-left transition-all",
                  m.value === "auto" && "col-span-2",
                  active ? "border-accent bg-accent-soft ring-4 ring-accent/10" : "border-line-strong bg-surface hover:border-fg-3/60"
                )}
              >
                <div className="text-[13px] font-semibold">{m.label}</div>
                <p className="mt-1 text-[12px] leading-snug text-fg-3">{m.hint}</p>
              </button>
            );
          })}
        </div>
        <Card className="mt-3">
          <Row
            title="Look at the app I'm typing in"
            description="Reads the name and window title of the app in front when you start dictating, to pick the format and spell names that appear there. The title is included in the AI polish request; nothing else on your screen is read."
          >
            <Switch checked={settings.useAppContext !== false} onChange={(v) => update({ useAppContext: v })} label="Look at the app I'm typing in" />
          </Row>
          <Row
            title="Instant formatting"
            description="Works offline with no key: “new line”, “new paragraph” and “bullet point”, drops um and uh, fixes file names (utils dot ts) and developer terms."
          >
            <Switch checked={settings.smartFormat !== false} onChange={(v) => update({ smartFormat: v })} label="Instant formatting" />
          </Row>
        </Card>
      </section>

      <section>
        <SectionTitle title="Your role" description="Tells Vaakya which words to expect from you." />
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((r) => {
              const active = (settings.role || "general") === r.value;
              return (
                <button
                  key={r.value}
                  title={r.hint}
                  onClick={() => update({ role: r.value })}
                  className={cx(
                    "h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
                    active ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface text-fg-2 hover:border-fg-3 hover:text-fg"
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <Field label="About you (optional)" hint="Names, companies and terms you say often. Used only to spell them right. For exact replacements, use the Dictionary.">
            <textarea
              defaultValue={settings.aboutYou}
              onBlur={(e) => update({ aboutYou: e.target.value.trim() })}
              rows={2}
              maxLength={400}
              placeholder="e.g. Backend engineer at Zentric in Hyderabad. I work with Adithya and Sravani on the payments API."
              className="w-full resize-none rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-[13px] leading-relaxed text-fg shadow-sm outline-none transition placeholder:text-fg-3 focus:border-accent focus:ring-4 focus:ring-accent/15"
            />
          </Field>
        </Card>
      </section>

      <Card>
        <Row
          title="Polish with AI"
          description="Removes filler words, fixes punctuation, applies self-corrections, builds lists, paragraphs and emails, and uses your role and the app you're in. Works in all five languages without translating."
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
                    active ? "border-accent bg-accent-soft ring-4 ring-accent/10" : "border-line-strong bg-surface hover:border-fg-3/60"
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
              <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-[12.5px] text-fg-2">
                <span>
                  Using <span className="font-semibold text-fg">Ollama</span>? Install it, run <code className="font-mono">ollama pull llama3.2:3b</code>, then:
                </span>
                <Button size="sm" onClick={() => update(OLLAMA_PRESET)}>
                  Use Ollama
                </Button>
              </div>
            )}
            {settings.llmProvider === "custom" && (
              <Field label="Base URL" hint="OpenAI-compatible chat endpoint, e.g. Ollama or LM Studio.">
                <Input
                  key={settings.llmBaseUrl}
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
    <div className={cx("flex h-full flex-1", dark ? "bg-[#071c1f]" : "bg-[#f7f9f8]")}>
      <div className={cx("w-1/4 border-r p-1.5", dark ? "border-white/5 bg-[#05171a]" : "border-black/5 bg-[#eef3f1]")}>
        <div className={cx("mb-1.5 size-2.5 rounded", dark ? "bg-[#9fd6cf]" : "bg-[#06525c]")} />
        {[0, 1, 2].map((i) => (
          <div key={i} className={cx("mb-1 h-1 rounded-full", dark ? "bg-white/15" : "bg-black/10")} />
        ))}
      </div>
      <div className="flex-1 p-2">
        <div className={cx("mb-1.5 h-5 rounded", dark ? "bg-[#0d2b2f]" : "bg-[#06525c]")} />
        <div className={cx("h-3 rounded", dark ? "bg-[#0d2b2f]" : "bg-white shadow-sm")} />
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

function About({ settings }: { settings: Settings }) {
  const [info, setInfo] = useState<{ version: string } | null>(null);
  useEffect(() => {
    bridge.appInfo().then(setInfo);
  }, []);
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex items-center gap-4 p-5">
        <Logo size={48} />
        <div>
          <div className="text-[15px] font-semibold">Vaakya</div>
          <div className="text-[12.5px] text-fg-3">
            Version {info?.version ?? "—"} · built{" "}
            {new Date(__BUILD_TIME__).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </div>
        </div>
      </Card>
      <Card>
        <Row title="Your data stays yours" description="History, dictionary and settings are stored locally. API keys are encrypted with your OS keychain. No telemetry, ever.">
          <ShieldCheck className="size-5 text-success" />
        </Row>
        {settings.keysEncrypted === false && (
          <Row title="API keys are not encrypted" description="No OS keychain is available on this system, so saved API keys are only obfuscated on disk. Prefer On this PC or keep keys out of shared machines.">
            <CircleAlert className="size-5 text-danger" />
          </Row>
        )}
        <Row title="Inspired by OpenWhispr" description="Open-source, MIT licensed.">
          <Button size="sm" variant="ghost" onClick={() => bridge.openExternal("https://github.com/OpenWhispr/openwhispr")}>
            GitHub <ExternalLink className="size-3.5" />
          </Button>
        </Row>
      </Card>
    </div>
  );
}

export { ProviderCards, KeyLink, TestButton };
