// Microphone capture + level metering for the overlay.
import { blobToWav16k } from "./wav";

export interface Recording {
  stop(): Promise<{ audio: ArrayBuffer; mimeType: string; durationMs: number }>;
  cancel(): void;
  levels(out: Float32Array): void;
}

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export async function startRecording(deviceId?: string, wav = false): Promise<Recording> {
  const audio = (id?: string): MediaTrackConstraints => ({
    deviceId: id && id !== "default" ? { exact: id } : undefined,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  });
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: audio(deviceId) });
  } catch (err) {
    // The saved microphone is unplugged: fall back to the system default.
    const name = (err as Error)?.name;
    if (!deviceId || deviceId === "default" || (name !== "OverconstrainedError" && name !== "NotFoundError")) throw err;
    stream = await navigator.mediaDevices.getUserMedia({ audio: audio() });
  }
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);

  const mimeType = pickMime();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(250);
  const started = performance.now();

  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };

  return {
    levels(out) {
      // Fill `out` with RMS levels of consecutive slices of the time-domain signal.
      analyser.getByteTimeDomainData(buf);
      const slice = Math.floor(buf.length / out.length);
      for (let i = 0; i < out.length; i++) {
        let sum = 0;
        for (let j = 0; j < slice; j++) {
          const v = (buf[i * slice + j] - 128) / 128;
          sum += v * v;
        }
        out[i] = Math.min(1, Math.sqrt(sum / slice) * 4.2);
      }
    },
    stop() {
      return new Promise((resolve) => {
        const durationMs = performance.now() - started;
        recorder.onstop = async () => {
          release();
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
          if (wav && blob.size) {
            try {
              resolve({ audio: await blobToWav16k(blob), mimeType: "audio/wav", durationMs });
              return;
            } catch {
              /* fall through with the original encoding */
            }
          }
          resolve({ audio: await blob.arrayBuffer(), mimeType: blob.type, durationMs });
        };
        recorder.stop();
      });
    },
    cancel() {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
      release();
    },
  };
}

/** Gentle two-note chimes, synthesised so no audio assets are needed. */
export function chime(kind: "start" | "stop" | "error") {
  try {
    const ctx = new AudioContext();
    const notes = kind === "start" ? [660, 880] : kind === "stop" ? [880, 660] : [330, 260];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.085;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.25);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    /* audio unavailable */
  }
}
