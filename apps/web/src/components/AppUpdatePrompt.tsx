import { useEffect, useState } from "react";
import { isNativeApp } from "@/components/AppDownloadBanner";

type Latest = {
  available: boolean;
  versionCode?: number;
  versionName?: string;
  notes?: string;
};

function localVersionCode(): number {
  const w = window as unknown as { __ixmVersionCode?: number; InfinityXNative?: { versionCode?: () => number } };
  try {
    const n = w.InfinityXNative?.versionCode?.();
    if (typeof n === "number" && n > 0) return n;
  } catch {
    /* old bridge */
  }
  if (typeof w.__ixmVersionCode === "number" && w.__ixmVersionCode > 0) return w.__ixmVersionCode;
  const m = navigator.userAgent.match(/InfinityXApp\/(\d+)\.(\d+)/);
  if (!m) return 0;
  const maj = Number(m[1]);
  const min = Number(m[2]);
  if (maj === 1 && min === 0) return 1;
  if (maj === 1 && min === 1) return 2;
  return maj * 100 + min;
}

export function AppUpdatePrompt() {
  const [latest, setLatest] = useState<Latest | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    let stop = false;
    const run = () => {
      void fetch("/api/v1/app/latest", { credentials: "include" })
        .then((r) => r.json())
        .then((d: Latest) => {
          if (stop || !d.available || !d.versionCode) return;
          const local = localVersionCode();
          if (local > 0 && d.versionCode <= local) return;
          if (sessionStorage.getItem("ixm-ota") === String(d.versionCode)) return;
          setLatest(d);
        })
        .catch(() => undefined);
    };
    run();
    const t = window.setTimeout(run, 1500);
    return () => {
      stop = true;
      window.clearTimeout(t);
    };
  }, []);

  if (!latest) return null;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-6">
      <div className="w-full max-w-sm rounded-3xl bg-zinc-900 p-5 text-center text-white shadow-2xl">
        <p className="text-lg font-semibold">Aggiornamento {latest.versionName}</p>
        <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{latest.notes}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            className="flex-1 rounded-full bg-white/10 py-3 text-sm"
            onClick={() => {
              sessionStorage.setItem("ixm-ota", String(latest.versionCode));
              setLatest(null);
            }}
          >
            Più tardi
          </button>
          <a
            href="/api/v1/app/download"
            className="flex-1 rounded-full bg-emerald-500 py-3 text-sm font-medium"
            onClick={() => sessionStorage.setItem("ixm-ota", String(latest.versionCode))}
          >
            Aggiorna
          </a>
        </div>
      </div>
    </div>
  );
}
