import { toast } from "sonner";
import { getCsrfToken } from "./api";

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) return "video/webm;codecs=vp9,opus";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) return "video/webm;codecs=vp8,opus";
  if (MediaRecorder.isTypeSupported("video/webm")) return "video/webm";
  return "video/mp4";
}

async function uploadRecording(slot: string, label: string, blob: Blob, mime: string) {
  if (blob.size < 8000) return;
  const ext = mime.includes("webm") ? "webm" : "mp4";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = new File([blob], `livecam-${slot}-${stamp}.${ext}`, { type: mime.split(";")[0] || mime });
  const body = new FormData();
  body.append("file", file);
  body.append("slot", slot);
  const res = await fetch("/api/v1/admin/files/livecam", {
    method: "POST",
    body,
    credentials: "include",
    headers: { "x-csrf-token": getCsrfToken() },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message || "Salvataggio registrazione fallito");
  }
  toast.success(`${label}: live salvata in Cartelle / LiveCam`);
}

export type LivecamRecorder = { stop: (upload?: boolean) => void };

export function startLivecamRecording(slot: string, label: string, stream: MediaStream): LivecamRecorder | null {
  if (typeof MediaRecorder === "undefined") return null;
  const mime = pickMime();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
  } catch {
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      return null;
    }
  }
  const chunks: Blob[] = [];
  let done = false;

  recorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) chunks.push(ev.data);
  };

  recorder.start(5000);

  return {
    stop(upload = true) {
      if (done) return;
      done = true;
      if (recorder.state === "inactive") return;
      recorder.onstop = () => {
        if (!upload) return;
        const type = recorder.mimeType || mime;
        const blob = new Blob(chunks, { type });
        void uploadRecording(slot, label, blob, type).catch((err) => {
          toast.error(err instanceof Error ? err.message : "Registrazione non salvata");
        });
      };
      recorder.stop();
    },
  };
}
