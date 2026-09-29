import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { Me } from "@/App";
import { api } from "@/lib/api";
import { startRealtime, onRealtime } from "@/lib/realtime";
import { previewFromCipher } from "@/lib/preview";
import { askNotifyPermission, notifyIncoming } from "@/lib/notify";
import { SITE_NAME } from "@/lib/brand";
import { AppDownloadIcon } from "@/components/AppDownloadBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/avatar";
import { cn, formatLastSeen, formatTime } from "@/lib/utils";
import { ChatThread, type ChatMessage } from "./ChatThread";

type Person = { id: string; username: string; displayName: string; avatarUrl?: string | null; online?: boolean; lastSeen?: string | null };

type Conversation = {
  id: string;
  type: string;
  title?: string | null;
  unread: number;
  updatedAt: string;
  members: Person[];
  lastMessage: {
    id: string;
    createdAt: string;
    messageType: string;
    ciphertext?: string;
    deletedAt?: string | null;
    senderId?: string;
  } | null;
};

export function ChatHome({ me }: { me: Me }) {
  const { conversationId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("us two 😘");
  const [picked, setPicked] = useState<string[]>([]);
  const [forward, setForward] = useState<{ plaintext: string; fromId: string } | null>(null);
  const [activity, setActivity] = useState<Record<string, "typing" | "recording" | undefined>>({});
  const opened = useRef(false);

  const convos = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ conversations: Conversation[] }>("/api/v1/conversations"),
  });

  const people = useQuery({
    queryKey: ["directory"],
    queryFn: () => api<{ users: Person[] }>("/api/v1/users/directory"),
  });

  useEffect(() => {
    startRealtime();
    askNotifyPermission();
    return onRealtime((msg) => {
      if (msg.type === "message.new") {
        const p = msg.payload as ChatMessage;
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["messages"] });
        if (p.senderId !== me.id) {
          notifyIncoming(SITE_NAME, previewFromCipher(p.ciphertext, p.deletedAt, p.messageType) || "New message");
        }
      }
      if (msg.type === "typing") {
        const p = msg.payload as { conversationId?: string; userId?: string; isTyping?: boolean };
        if (p.conversationId && p.userId !== me.id) {
          setActivity((a) => ({ ...a, [p.conversationId!]: p.isTyping ? "typing" : undefined }));
        }
      }
      if (msg.type === "recording") {
        const p = msg.payload as { conversationId?: string; userId?: string; isRecording?: boolean };
        if (p.conversationId && p.userId !== me.id) {
          setActivity((a) => ({ ...a, [p.conversationId!]: p.isRecording ? "recording" : undefined }));
        }
      }
      if (msg.type === "presence" || msg.type === "receipt" || msg.type === "message.edit" || msg.type === "message.delete" || msg.type === "message.reaction") {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["directory"] });
        qc.invalidateQueries({ queryKey: ["messages"] });
        qc.invalidateQueries({ queryKey: ["conversation"] });
      }
    });
  }, [qc, me.id]);

  async function startChat(userId: string) {
    try {
      const r = await api<{ conversation: { id: string } }>("/api/v1/conversations/direct", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setQ("");
      nav(`/app/${r.conversation.id}`);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open chat");
    }
  }

  async function removeContact(userId: string, e: MouseEvent) {
    e.stopPropagation();
    try {
      await api(`/api/v1/contacts/${userId}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["directory"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Contact removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Not removed");
    }
  }

  async function hideChat(id: string, e: MouseEvent) {
    e.stopPropagation();
    try {
      await api(`/api/v1/conversations/${id}`, { method: "DELETE" });
      if (conversationId === id) nav("/app");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chat not deleted");
    }
  }

  useEffect(() => {
    if (conversationId || opened.current) return;
    const otherName =
      me.username === "dua" || me.username === "ghosty" || me.username === "maria"
        ? "adil"
        : me.username === "adil"
          ? "dua"
          : null;
    const other = (people.data?.users ?? []).find((u) => u.username === otherName);
    if (!other) return;
    opened.current = true;
    void startChat(other.id);
  }, [conversationId, people.data, me.username]);

  async function createGroup() {
    try {
      const r = await api<{ conversation: { id: string } }>("/api/v1/conversations/group", {
        method: "POST",
        body: JSON.stringify({ title: groupTitle.trim() || "Group", userIds: picked }),
      });
      setGroupOpen(false);
      setPicked([]);
      nav(`/app/${r.conversation.id}`);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Group not created");
    }
  }

  async function doForward(conversation: string) {
    if (!forward) return;
    try {
      await api("/api/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId: conversation,
          messageType: "text",
          ciphertext: JSON.stringify({ v: 1, mode: "compat", plaintext: forward.plaintext }),
          forwardedFromId: forward.fromId,
          clientId: crypto.randomUUID(),
        }),
      });
      setForward(null);
      nav(`/app/${conversation}`);
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Forward failed");
    }
  }

  const list = (convos.data?.conversations ?? []).filter((c) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    const other = c.members[0];
    const title = c.type === "group" ? c.title || "Group" : other?.displayName ?? "";
    const preview = previewFromCipher(c.lastMessage?.ciphertext, c.lastMessage?.deletedAt, c.lastMessage?.messageType);
    return title.toLowerCase().includes(s) || other?.username?.toLowerCase().includes(s) || preview.toLowerCase().includes(s);
  });
  const filteredPeople = (people.data?.users ?? []).filter((u) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return u.displayName.toLowerCase().includes(s) || u.username.toLowerCase().includes(s);
  });

  return (
    <div className="flex h-full min-h-0 flex-1">
      <section className={cn("relative flex h-full min-h-0 w-full flex-col border-r border-pink-500/15 md:w-80 lg:w-96", conversationId ? "hidden md:flex" : "flex")}>
        <div className="hearts pointer-events-none absolute inset-0 overflow-hidden opacity-40" />
        <div className="relative border-b border-pink-500/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-serif text-xl leading-tight text-pink-100">{SITE_NAME}</h1>
              <p className="mt-1 text-xs text-pink-300/80">code only · dua, adil, ghosty, maria</p>
            </div>
            <AppDownloadIcon />
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-pink-400/70" />
            <Input className="rounded-full border-pink-500/30 bg-black/40 pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button className="mt-3 w-full rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-600" onClick={() => setGroupOpen(true)}>
            <Users className="mr-2 h-4 w-4" /> New group
          </Button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-pink-400/70">People</p>
          {filteredPeople.map((u) => (
            <div key={u.id} className="flex items-center pr-2">
              <button onClick={() => startChat(u.id)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-pink-500/10">
                <div className="relative">
                  <UserAvatar name={u.displayName} src={u.avatarUrl} className="ring-2 ring-pink-400/40" />
                  {u.online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />}
                </div>
                <span className="min-w-0">
                  <span className="block font-medium text-pink-50">{u.displayName}</span>
                  <span className="text-xs text-pink-300/60">{u.online ? "online" : formatLastSeen(u.lastSeen)}</span>
                </span>
              </button>
              <button className="grid h-9 w-9 place-items-center rounded-full text-pink-300/70 hover:bg-rose-500/20 hover:text-rose-200" onClick={(e) => void removeContact(u.id, e)} aria-label="Remove contact">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-pink-400/70">Chat</p>
          {list.map((c) => {
            const other = c.members[0];
            const title = c.type === "group" ? c.title || "Group" : other?.displayName ?? "Chat";
            const live = activity[c.id];
            const preview = live === "recording"
              ? "recording audio…"
              : live === "typing"
                ? "typing…"
                : previewFromCipher(c.lastMessage?.ciphertext, c.lastMessage?.deletedAt, c.lastMessage?.messageType) || "No messages";
            return (
              <div key={c.id} className="flex items-center pr-2">
              <button
                onClick={() => (forward ? void doForward(c.id) : nav(`/app/${c.id}`))}
                className={cn("flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-pink-500/10", conversationId === c.id && "bg-pink-500/15")}
              >
                <UserAvatar name={title} src={other?.avatarUrl} className="ring-2 ring-fuchsia-400/30" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-pink-50">{title}</span>
                    {c.lastMessage && <span className="text-[10px] text-pink-300/60">{formatTime(c.lastMessage.createdAt)}</span>}
                  </div>
                  <p className={cn("truncate text-xs", live ? "animate-pulse italic text-pink-200" : "text-pink-200/60")}>{preview}</p>
                </div>
                {c.unread > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-500 px-1 text-[10px] font-semibold">
                    {c.unread}
                  </span>
                )}
              </button>
              <button className="grid h-9 w-9 place-items-center rounded-full text-pink-300/70 hover:bg-rose-500/20 hover:text-rose-200" onClick={(e) => void hideChat(c.id, e)} aria-label="Delete chat">
                <Trash2 className="h-4 w-4" />
              </button>
              </div>
            );
          })}
        </div>
      </section>
      {conversationId ? (
        <ChatThread me={me} conversationId={conversationId} onForward={(m, plaintext) => setForward({ plaintext, fromId: m.id })} />
      ) : (
        <div className="relative hidden flex-1 place-items-center md:grid">
          <div className="hearts pointer-events-none absolute inset-0" />
          <p className="relative font-serif text-2xl text-pink-200/80">pick who makes your heart race</p>
        </div>
      )}
      {groupOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" onClick={() => setGroupOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl border border-pink-500/30 bg-zinc-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-xl text-pink-100">New group</h2>
            <Input className="mt-3" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Group name" />
            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
              {(people.data?.users ?? []).map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.includes(u.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, u.id] : p.filter((x) => x !== u.id)))}
                  />
                  {u.displayName}
                </label>
              ))}
            </div>
            <Button className="mt-4 w-full rounded-full" disabled={!picked.length} onClick={() => void createGroup()}>
              Create
            </Button>
          </div>
        </div>
      )}
      {forward && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" onClick={() => setForward(null)}>
          <div className="w-full max-w-sm rounded-3xl border border-pink-500/30 bg-zinc-950 p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-xl text-pink-100">Forward to…</h2>
            <p className="mt-2 text-xs text-pink-300/80">Tap a chat in the list, or pick one here:</p>
            <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
              {list.map((c) => {
                const title = c.type === "group" ? c.title || "Group" : c.members[0]?.displayName ?? "Chat";
                return (
                  <button key={c.id} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-pink-500/15" onClick={() => void doForward(c.id)}>
                    {title}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
