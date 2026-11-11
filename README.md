<p align="center"><img src="build/icon.png" width="96" alt="SayType" /></p>
<h1 align="center">SayType</h1>
<p align="center">Voice typing for every app, in English, Hindi, Telugu, Tamil and Kannada.<br/>Press a shortcut, speak, and clean, formatted text appears wherever your cursor is.</p>

<p align="center"><img src="docs/home-light.png" width="760" alt="SayType home" /></p>

<p align="center"><a href="https://github.com/santhankrishna8/wisprflow/releases/latest/download/SayType-Setup.exe"><b>⬇ Download for Windows</b></a></p>

## Features

- **Dictate anywhere** – a global shortcut (default <kbd>Ctrl/⌘</kbd> <kbd>Shift</kbd> <kbd>Space</kbd>) starts recording; press again to transcribe and paste at your cursor. <kbd>Esc</kbd> cancels. It works in every text box: your browser, ChatGPT, Cursor, WhatsApp, Word.
- **Five languages** – English, हिन्दी, తెలుగు, தமிழ் and ಕನ್ನಡ, with English words mixed in. Pick your language (Settings, the Home screen or the tray menu) or leave it on Auto. Auto only ever chooses among these five: if the engine guesses some other language, SayType transcribes again in the likeliest of yours. Nothing is translated.
- **Formats for the app you're in** – SayType notes which app is in front when you start talking: emails get a greeting, paragraphs and sign-off; chat apps get a short message; ChatGPT, Claude and Gemini get a clear, structured prompt; documents get paragraphs and lists. You can also fix the format in Settings → Formatting.
- **Built for developers** – in VS Code, Cursor, Windsurf, JetBrains IDEs and terminals it writes camelCase and snake_case, turns “utils dot ts” into `utils.ts`, tags files as `@utils.ts` in Cursor and Windsurf, and spells tools like Supabase, Vercel and PostgreSQL correctly.
- **Role and names** – tell it your role (developer, student, writer, business, support, healthcare) and a line about you, and add uncommon names and terms to the dictionary: Adithya, git diff, Andreessen Horowitz, Guillain–Barré syndrome.
- **Instant formatting, no key needed** – “new line”, “new paragraph” and “bullet point”, filler removal, file names and developer terms work offline. Add an AI key (or Ollama) for lists, emails, prompts and self-corrections (“4, actually 5” → “5”). Styles: Natural, Professional, Casual or Verbatim.
- **Edge handle** – a slim always-on-top handle rests at the edge of your screen. Click it once to start listening: it grows into a pill with a live voice mark, and clicking the pill finishes. When the text is pasted it shrinks back to the handle. Drag it anywhere; it snaps to the nearest side.
- **Recording bar** – a live waveform, timer, and cancel/finish buttons that never steal focus from the app you're typing in.
- **Free, private, offline transcription** – choose **On this PC** and SayType runs Whisper (whisper.cpp) on your own computer. No API key, no Docker, no cost. Base (142 MB) is fine for English; use Large v3 Turbo (574 MB) or Large v3 (1.08 GB) for Indian languages. The engine only runs while you dictate and shuts itself down after 10 idle minutes.
- **Or bring your own provider** – OpenAI or Groq (Whisper Large v3, the fastest accurate option for Telugu, Tamil and Kannada) for speech-to-text, and OpenAI, Anthropic Claude, or Groq for polish. Any **OpenAI-compatible self-hosted server** (Speaches, faster-whisper-server, Ollama, LM Studio) works too.
- **Updates inside the app** – when a new version is released, an "Update available" card appears in the sidebar (and in Settings → About, which also has **Check now**). **Install and restart** downloads the installer inside the app with a progress bar, checks its size and SHA-256 against the release, installs quietly over the current version and restarts. Your settings, history and models are kept. It only ever downloads from this project's GitHub releases.
- **History & stats** – searchable history grouped by day, with the original transcript next to the polished one, plus words dictated, time saved, speaking pace and streak.
- **Private** – history, dictionary and settings live in a local file (history is auto-deleted after 30 days by default); API keys are encrypted with the OS keychain (Electron `safeStorage`); no telemetry. Only the front window's name and title are read, and you can turn that off. The app checks GitHub for new releases about once a day, which you can also turn off.

| Onboarding | Settings |
| --- | --- |
| <img src="docs/onboarding.png" alt="Onboarding" /> | <img src="docs/settings.png" alt="Settings" /> |
| **History** | **Dark mode** |
| <img src="docs/history.png" alt="History" /> | <img src="docs/home-dark.png" alt="Dark mode" /> |

<p align="center"><img src="docs/overlay-recording.png" width="420" alt="Recording pill" /></p>
<p align="center"><img src="docs/bubble-states.png" width="470" alt="Edge handle, and the pill it grows into: recording, processing, done, error" /></p>

## Getting started

Requires Node.js 20+.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` starts Vite and Electron together with hot reload. To work on the UI in a normal browser with a mocked backend, run `npm run dev:web` and open <http://localhost:5173> (`?onboarding`, `?theme=dark`, `?empty` and `?route=settings` are handy query flags; `overlay.html?demo=recording` previews the pill).

### Build installers

```bash
npm run dist
```

Use `dist:mac`, `dist:win` or `dist:linux` to build for one platform. Output goes to `release/`.

You can also build the Windows installer on GitHub: open **Actions → Build Windows installer → Run workflow**, then download `SayType-Windows-installer` from the finished run.

## On-device transcription

The installers bundle a CPU build of `whisper-server` (whisper.cpp, pinned and SHA-256 verified by `scripts/fetch-whisper.cjs`). Models download from Hugging Face into SayType's data folder the first time you choose them; interrupted downloads resume and are verified against Hugging Face's SHA-256. When you start recording, SayType starts the engine so the model loads while you speak; it reuses it for back-to-back dictations and stops it after 10 minutes of inactivity or when you quit.

For AI cleanup without the cloud, install [Ollama](https://ollama.com), run `ollama pull llama3.2:3b`, then pick **Self-hosted → Use Ollama** under Settings → Formatting. If no AI is configured, SayType applies its instant offline formatting only.

The Windows CI build smoke-tests this end to end: it downloads the Tiny model and transcribes a speech sample with the packaged engine.

## Platform notes

- **macOS** – grant Microphone and Accessibility access (onboarding walks you through it). Accessibility is needed to paste into other apps.
- **Windows** – works out of the box.
- **Linux** – auto-paste uses `xdotool` on X11, and `wtype` or `ydotool` on Wayland. Install one of them; otherwise the text is left on your clipboard. Some Wayland compositors restrict global shortcuts.

## How it works

```
electron/
  main.cjs      windows, global shortcut, tray, dictation pipeline, IPC
  preload.cjs   the typed `window.saytype` bridge
  ai.cjs        speech-to-text + LLM cleanup (OpenAI-compatible & Anthropic)
  localWhisper.cjs  on-device engine: model downloads, on-demand whisper-server, idle shutdown
  format.cjs    languages, app detection rules, offline formatting, prompt rules per app and role
  paste.cjs     clipboard + simulated paste per platform, and which app is in front
  store.cjs     JSON persistence with keychain-encrypted API keys
src/
  App.tsx       shell and sidebar
  pages/        Home, History, Dictionary, Settings, Onboarding
  overlay/      recording pill, mic capture and level metering
  bubble/       always-on-top edge pill
  components/   UI kit (buttons, switches, hotkey recorder, toasts…)
```

The shortcut shows the overlay, which records audio with `MediaRecorder`. On the second press the audio goes to the main process, which transcribes it, applies your dictionary and the offline formatting, optionally polishes it with an LLM for the app you're in, pastes it, and saves it to history. API keys never reach the renderer.

## Releasing & website

- **Release:** on GitHub open **Actions → Build Windows installer → Run workflow** and enter a version such as `0.2.0` (or push a tag like `v0.2.0`). GitHub Actions builds the installer, runs the on-device transcription smoke test, and publishes `SayType-Setup.exe` to GitHub Releases. The permanent download link is `https://github.com/santhankrishna8/wisprflow/releases/latest/download/SayType-Setup.exe`.
- **Website:** the landing page lives in `site/` (plain HTML, no build). On Vercel, import the repo and set **Root Directory** to `site` with the **Other** framework preset. `site/vercel.json` deploys the `main` branch only; other branches are skipped.
- **Installer size:** most of the download is the Electron runtime. The build ships one UI locale and uses maximum compression; the speech engine itself is about 3 MB, and models are downloaded separately.

SayType was previously called WisprFlow. The first launch after updating moves your settings, history, keys and downloaded models across.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Electron + Vite with hot reload |
| `npm run dev:web` | UI only, in the browser, with a mock backend |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests for the text pipeline |
| `npm run dist` | Package installers with electron-builder |

## Credits

Inspired by [OpenWhispr](https://github.com/OpenWhispr/openwhispr) (MIT). MIT licensed.
