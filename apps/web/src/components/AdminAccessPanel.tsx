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
      toast.success("Nome aggiunto. Compare in hack camera.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (username: string) =>
      api<{ entries: Entry[] }>(`/api/v1/admin/access/${encodeURIComponent(username)}`, { method: "DELETE" }),
    onSuccess: (data) => {
      qc.setQueryData(["admin-access"], data);
      qc.invalidateQueries({ queryKey: ["livecam-slots"] });
      toast.success("Accesso eliminato.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const entries = q.data?.entries ?? [];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-auto bg-black/40 p-4 md:p-6">
      <h1 className="font-serif text-2xl text-pink-100">Chi può entrare</h1>
      <p className="mt-1 text-xs text-pink-300/80">Massimo 3 persone (oltre Adil). Il nome compare sulla live cam. Adil resta sempre.</p>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !code.trim()) return;
          add.mutate();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-pink-300/80">
          Nome
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Luca" className="w-48 rounded-full" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-pink-300/80">
          Codice segreto
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="es. luca" className="w-48 rounded-full" />
        </label>
        <Button type="submit" className="rounded-full" disabled={add.isPending}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Aggiungi
        </Button>
      </form>
      <div className="mt-5 grid gap-2">
        {entries.map((entry) => (
          <div key={entry.username} className="flex items-center gap-3 rounded-2xl border border-pink-500/20 bg-zinc-950/80 px-4 py-3">
            <div className="min-w-0">
              <p className="font-serif text-pink-100">{entry.displayName}</p>
              <p className="text-xs text-pink-300/70">
                codice <span className="text-pink-100">{entry.code}</span>
                {entry.builtin ? " · già presente" : ""}
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
                Elimina
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
