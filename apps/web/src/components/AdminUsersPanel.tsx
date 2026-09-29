import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatLastSeen } from "@/lib/utils";

type Phone = {
  ip?: string;
  manufacturer?: string;
  model?: string;
  brand?: string;
  android?: string;
  sdk?: number;
  native?: boolean;
  platform?: string;
  language?: string;
  timezone?: string;
  screen?: string;
  network?: string;
  userAgent?: string;
  cpuCores?: number;
  deviceMemoryGb?: number;
  touchPoints?: number;
  online?: boolean;
  vendor?: string;
  osVersion?: string;
  updatedAt?: string;
};

type Row = {
  id: string;
  username: string;
  displayName: string;
  online: boolean;
  lastSeen: string | null;
  phone: Phone | null;
  sessions: { id: string; deviceName: string | null; userAgent: string | null; createdAt: string }[];
};

function RowLine({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-28 shrink-0 text-pink-400/70">{label}</span>
      <span className="min-w-0 break-all text-pink-100">{String(value)}</span>
    </div>
  );
}

export function AdminUsersPanel() {
  const q = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<{ users: Row[] }>("/api/v1/admin/users"),
    refetchInterval: 8_000,
  });
  const users = q.data?.users ?? [];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-auto bg-black/40 p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <Smartphone className="h-5 w-5 text-pink-300" />
        <div>
          <h1 className="font-serif text-2xl text-pink-100">Users / phone</h1>
          <p className="text-xs text-pink-300/80">Full device telemetry when they open your tunnel link or the app.</p>
        </div>
        <Button type="button" size="sm" variant="secondary" className="ml-auto rounded-full" onClick={() => void q.refetch()}>
          <RefreshCw className={cn("mr-1.5 h-4 w-4", q.isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {users.map((u) => {
          const p = u.phone;
          const phoneName = [p?.manufacturer, p?.model].filter(Boolean).join(" ") || p?.brand || p?.platform || "unknown";
          return (
            <div key={u.id} className="rounded-2xl border border-pink-500/20 bg-zinc-950/80 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="font-serif text-lg text-pink-100">{u.displayName}</span>
                <span className="text-xs text-pink-400/70">@{u.username}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${u.online ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-pink-300/70"}`}>
                  {u.online ? "online" : formatLastSeen(u.lastSeen)}
                </span>
              </div>
              <div className="space-y-1.5">
                <RowLine label="Phone" value={phoneName} />
                <RowLine label="Android" value={p?.android ? `${p.android}${p.sdk ? ` (SDK ${p.sdk})` : ""}` : undefined} />
                <RowLine label="Native app" value={p?.native ? "yes (InfinityX app)" : "browser / WebView"} />
                <RowLine label="IP" value={p?.ip} />
                <RowLine label="Network" value={p?.network} />
                <RowLine label="Screen" value={p?.screen} />
                <RowLine label="CPU cores" value={p?.cpuCores} />
                <RowLine label="RAM (GB)" value={p?.deviceMemoryGb} />
                <RowLine label="Touch points" value={p?.touchPoints} />
                <RowLine label="Browser online" value={p?.online === undefined ? undefined : p.online ? "yes" : "no"} />
                <RowLine label="OS version" value={p?.osVersion} />
                <RowLine label="Vendor" value={p?.vendor} />
                <RowLine label="Language" value={p?.language} />
                <RowLine label="Timezone" value={p?.timezone} />
                <RowLine label="Platform" value={p?.platform} />
                <RowLine label="User-Agent" value={p?.userAgent} />
                <RowLine label="Updated" value={p?.updatedAt ? new Date(p.updatedAt).toLocaleString() : "no ping yet"} />
              </div>
              {p && (
                <details className="mt-3 border-t border-pink-500/15 pt-2">
                  <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-pink-400/60">Raw device JSON</summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/50 p-2 text-[10px] text-emerald-200/90">
                    {JSON.stringify(p, null, 2)}
                  </pre>
                </details>
              )}
              {u.sessions.length > 0 && (
                <div className="mt-3 border-t border-pink-500/15 pt-3">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-pink-400/60">Sessions</p>
                  {u.sessions.map((s) => (
                    <p key={s.id} className="truncate text-[11px] text-pink-200/70">
                      {s.deviceName || "device"} · {new Date(s.createdAt).toLocaleString()}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
