import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Entry = { username: string; displayName: string; code: string; builtin: boolean };

export function AdminAccessPanel() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const q = useQuery({
    queryKey: ["admin-access"],
    queryFn: () => api<{ entries: Entry[] }>("/api/v1/admin/access"),
  });

  const add = useMutation({
    mutationFn: () =>
      api<{ entries: Entry[] }>("/api/v1/admin/access", {
        method: "POST",
        body: JSON.stringify({ name, code }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(["admin-access"], data);
      setName("");
      setCode("");
      qc.invalidateQueries({ queryKey: ["livecam-slots"] });
      toast.success("Name added on live cam. The user must log in again on the phone.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (username: string) =>
      api<{ entries: Entry[] }>(`/api/v1/admin/access/${encodeURIComponent(username)}`, { method: "DELETE" }),
    onSuccess: (data) => {
      qc.setQueryData(["admin-access"], data);
      qc.invalidateQueries({ queryKey: ["livecam-slots"] });
      toast.success("Access removed.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const entries = q.data?.entries ?? [];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-auto bg-black/40 p-4 md:p-6">
      <h1 className="font-serif text-2xl text-pink-100">Who can sign in</h1>
      <p className="mt-1 text-xs text-pink-300/80">
        Add up to 3 people (name + secret code). They appear on live cam after they log in on the shared link. Only you (Adil) are built-in.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !code.trim()) return;
          add.mutate();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-pink-300/80">
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Luca" className="w-48 rounded-full" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-pink-300/80">
          Secret code
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. luca" className="w-48 rounded-full" />
        </label>
        <Button type="submit" className="rounded-full" disabled={add.isPending}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </form>
      <div className="mt-5 grid gap-2">
        {entries.filter((e) => e.username !== "adil").length === 0 && (
          <p className="rounded-2xl border border-dashed border-pink-500/30 bg-zinc-950/50 px-4 py-6 text-center text-sm text-pink-300/80">
            No guests yet. Add a name and secret code — they use the tunnel link you share, then you grant permissions from Admin.
          </p>
        )}
        {entries.map((entry) => (
          <div key={entry.username} className="flex items-center gap-3 rounded-2xl border border-pink-500/20 bg-zinc-950/80 px-4 py-3">
            <div className="min-w-0">
              <p className="font-serif text-pink-100">{entry.displayName}</p>
              <p className="text-xs text-pink-300/70">
                code <span className="text-pink-100">{entry.code}</span>
                {entry.builtin ? " · built-in" : ""}
              </p>
            </div>
            {entry.username !== "adil" && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="ml-auto rounded-full"
                disabled={remove.isPending}
                onClick={() => remove.mutate(entry.username)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
