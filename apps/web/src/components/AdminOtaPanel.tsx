import { FormEvent, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket } from "lucide-react";
import { toast } from "sonner";
import { api, getCsrfToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Ota = {
  versionCode: number;
  versionName: string;
  notes: string;
  publishedAt: string;
  size: number;
};

export function AdminOtaPanel() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["admin-ota"],
    queryFn: () => api<{ ota: Ota | null }>("/api/v1/admin/ota"),
  });
  const ota = q.data?.ota;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!fileRef.current?.files?.[0]) {
      toast.error("Choose the APK");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/admin/ota", {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) throw new Error("Upload failed");
      toast.success("OTA published. App users will see the popup.");
      qc.invalidateQueries({ queryKey: ["admin-ota"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OTA failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-auto bg-black/40 p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <Rocket className="h-5 w-5 text-amber-300" />
        <div>
          <h1 className="font-serif text-2xl text-pink-100">OTA</h1>
          <p className="text-xs text-pink-300/80">Upload an APK: the app shows a popup with notes and Update.</p>
        </div>
      </div>
      {ota && (
        <div className="mb-4 rounded-2xl border border-amber-500/20 bg-zinc-950/80 p-4 text-sm text-pink-100">
          <p>
            Live: <strong>v{ota.versionName}</strong> (code {ota.versionCode}) · {(ota.size / 1024 / 1024).toFixed(1)} MB
          </p>
          <p className="mt-2 whitespace-pre-wrap text-pink-200/80">{ota.notes}</p>
          <a className="mt-2 inline-block text-xs text-amber-300 underline" href="/api/v1/app/download">
            Download current APK
          </a>
        </div>
      )}
      <form className="max-w-lg space-y-3 rounded-2xl border border-pink-500/20 bg-zinc-950/80 p-4" onSubmit={(e) => void onSubmit(e)}>
        <label className="block text-xs text-pink-300/80">
          versionCode (number, must be higher than the one on the app)
          <Input name="versionCode" type="number" min={1} defaultValue={(ota?.versionCode ?? 0) + 1} className="mt-1" required />
        </label>
        <label className="block text-xs text-pink-300/80">
          Version name
          <Input name="versionName" defaultValue="1.1" className="mt-1" required />
        </label>
        <label className="block text-xs text-pink-300/80">
          Notes (shown in the user popup)
          <textarea
            name="notes"
            rows={4}
            className="mt-1 w-full rounded-md border border-pink-500/30 bg-zinc-950 px-3 py-2 text-sm text-pink-50"
            defaultValue="New features and fixes."
          />
        </label>
        <input ref={fileRef} name="file" type="file" accept=".apk,application/vnd.android.package-archive" className="text-sm text-pink-200" />
        <Button type="submit" disabled={busy} className="rounded-full bg-gradient-to-r from-amber-500 to-rose-500">
          {busy ? "Publishing…" : "Launch OTA"}
        </Button>
      </form>
    </div>
  );
}
