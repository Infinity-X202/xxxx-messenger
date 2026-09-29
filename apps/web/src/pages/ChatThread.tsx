import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Film, Forward, Mic, Paperclip, Pencil, Phone, Reply, Send, Trash2, Video, X } from "lucide-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Me } from "@/App";
import { api } from "@/lib/api";
import { decryptText } from "@/lib/e2ee";
import { onRealtime, sendRealtime } from "@/lib/realtime";
import { previewFromCipher } from "@/lib/preview";
import { prepareUploadFile } from "@/lib/media";
import { syncGalleryAfterChatShare } from "@/lib/chat-gallery";
import { Button } from "@/components/ui/button";
import { cn, formatDuration, formatLastSeen, formatTime } from "@/lib/utils";
import { VoiceNote } from "./VoiceNote";
import { UserAvatar } from "@/components/ui/avatar";
import { useCall } from "@/components/CallOverlay";

const REACTIONS = ["❤️", "🔥", "😘", "😍", "💋", "😂"];

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  ciphertext: string;
  messageType: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToMessageId: string | null;
  forwardedFromId?: string | null;
  reactions: { userId: string; reaction: string }[];
  attachments: { id: string; originalFilename: string; mimeType: string; size: number }[];
  receipts: { userId: string; deliveredAt: string | null; readAt: string | null }[];
  sender?: { displayName: string; username: string };
};

type ConvInfo = {
  id: string;
  type: string;
  title: string | null;
  members: { id: string; displayName: string; username: string; avatarUrl?: string | null; online?: boolean; lastSeen?: string | null }[];
};

export function ChatThread({
  me,
  conversationId,
  onForward,
}: {
  me: Me;
  conversationId: string;
  onForward: (msg: ChatMessage, plaintext: string) => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [plain, setPlain] = useState<Record<string, string>>({});
  const [typing, setTyping] = useState(false);
  const [peerRecording, setPeerRecording] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const cancelled = useRef(false);
  const recTick = useRef<number | undefined>(undefined);
  const [lightbox, setLightbox] = useState<{ src: string; type: "image" | "video" } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const { startCall } = useCall();
  const chunks = useRef<Blob[]>([]);
  const typingTimer = useRef<number | undefined>(undefined);
  const deviceId = localStorage.getItem("ixm-device-id") ?? "";

  function scrollToBottom(smooth = true) {
    const el = scroller.current;
    if (!el) return;
    const run = () => {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    };
    run();
    requestAnimationFrame(run);
    window.setTimeout(run, 80);
    window.setTimeout(run, 280);
  }

  const conv = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => api<{ conversation: ConvInfo }>(`/api/v1/conversations/${conversationId}`),
  });

  const devices = useQuery({
    queryKey: ["devices", conversationId],
    queryFn: () => api<{ devices: { id: string; userId: string; publicKey: string }[] }>(`/api/v1/conversations/${conversationId}/devices`),
  });

  const messages = useInfiniteQuery({
    queryKey: ["messages", conversationId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<{ messages: ChatMessage[]; nextCursor: string | null }>(
        `/api/v1/conversations/${conversationId}/messages` + (pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = useMemo(() => messages.data?.pages.flatMap((p) => p.messages) ?? [], [messages.data]);
  const visible = useMemo(() => items.filter((m) => !m.deletedAt && !gone.has(m.id)), [items, gone]);
  const other = conv.data?.conversation.members.find((m) => m.id !== me.id);
  const title = conv.data?.conversation.type === "group" ? conv.data.conversation.title || "Group" : other?.displayName ?? "Chat";
  const presence = peerRecording
    ? "recording audio…"
    : typing
      ? "typing…"
      : other?.online
        ? "online"
        : formatLastSeen(other?.lastSeen);

  useEffect(() => {
    return onRealtime((msg) => {
      if (msg.type === "typing") {
        const p = msg.payload as { conversationId?: string; userId?: string; isTyping?: boolean };
        if (p.conversationId === conversationId && p.userId !== me.id) {
          setTyping(Boolean(p.isTyping));
          if (p.isTyping) setPeerRecording(false);
        }
      }
      if (msg.type === "recording") {
        const p = msg.payload as { conversationId?: string; userId?: string; isRecording?: boolean };
        if (p.conversationId === conversationId && p.userId !== me.id) {
          setPeerRecording(Boolean(p.isRecording));
          if (p.isRecording) setTyping(false);
        }
      }
      if (msg.type === "message.delete") {
        const p = msg.payload as { id?: string };
        if (p.id) setGone((s) => new Set(s).add(p.id!));
      }
      if (msg.type === "message.new" || msg.type === "message.edit" || msg.type === "message.reaction" || msg.type === "receipt") {
        const p = msg.payload as { conversationId?: string };
        if (!p.conversationId || p.conversationId === conversationId) {
          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
          if (msg.type === "message.new") scrollToBottom();
        }
      }
      if (msg.type === "presence") {
        qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      }
    });
  }, [conversationId, me.id, qc]);

  useEffect(() => {
    (async () => {
      const list = devices.data?.devices ?? [];
      const next: Record<string, string> = {};
      for (const m of items) {
        if (m.deletedAt) {
          next[m.id] = "Message deleted";
          continue;
        }
        next[m.id] = await decryptText(m.ciphertext, deviceId, list);
      }
      setPlain(next);
    })();
  }, [items, devices.data, deviceId]);

  const lastId = visible[visible.length - 1]?.id;

  useEffect(() => {
    scrollToBottom(items.length < 2 ? false : true);
  }, [lastId, items.length, typing, peerRecording, recording]);

  useEffect(() => {
    if (!lastId) return;
    scrollToBottom();
  }, [lastId, plain[lastId ?? ""]]);

  useEffect(() => {
    return () => {
      sendRealtime({ type: "typing", payload: { conversationId, isTyping: false } });
      sendRealtime({ type: "recording", payload: { conversationId, isRecording: false } });
    };
  }, [conversationId]);

  const marked = useRef(new Set<string>());

  useEffect(() => {
    for (const m of items) {
      if (m.senderId === me.id || m.deletedAt) continue;
      if (marked.current.has(m.id)) continue;
      marked.current.add(m.id);
      sendRealtime({
        type: "receipt",
        payload: { conversationId, messageId: m.id, status: "delivered" },
      });
      sendRealtime({
        type: "receipt",
        payload: { conversationId, messageId: m.id, status: "read" },
      });
    }
  }, [items, conversationId, me.id]);

  function pulseTyping(on: boolean) {
    sendRealtime({ type: "typing", payload: { conversationId, isTyping: on } });
  }

  function pulseRecording(on: boolean) {
    sendRealtime({ type: "recording", payload: { conversationId, isRecording: on } });
  }

  const send = useMutation({
    mutationFn: async (payload?: { ciphertext?: string; reply?: string | null; forwardId?: string }) => {
      const body = payload?.ciphertext ?? text.trim();
      if (!body) throw new Error("Write a message");
      const ciphertext = JSON.stringify({ v: 1, mode: "compat", plaintext: body });
      if (editing) {
        await api(`/api/v1/messages/${editing}`, { method: "PATCH", body: JSON.stringify({ ciphertext }) });
        return;
      }
      await api("/api/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          messageType: "text",
          ciphertext,
          replyToMessageId: payload?.reply ?? replyTo ?? undefined,
          forwardedFromId: payload?.forwardId,
          clientId: crypto.randomUUID(),
        }),
      });
    },
    onSuccess: () => {
      setText("");
      setReplyTo(null);
      setEditing(null);
      pulseTyping(false);
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      scrollToBottom();
    },
    onError: (err: Error) => toast.error(err.message || "Send failed"),
  });

  async function uploadFile(file: File) {
    const max = 500 * 1024 * 1024;
    if (file.size > max) throw new Error("Video too large (max 500 MB)");
    const ready = await prepareUploadFile(file);
    const fd = new FormData();
    fd.append("conversationId", conversationId);
    fd.append("file", ready, ready.name);
    await api(`/api/v1/attachments?conversationId=${encodeURIComponent(conversationId)}`, { method: "POST", body: fd });
    qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
    scrollToBottom();
  }

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    try {
      await uploadFile(file);
      const media = file.type.startsWith("image/") || file.type.startsWith("video/");
      if (media) void syncGalleryAfterChatShare();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  function stopRec(send: boolean) {
    cancelled.current = !send;
    window.clearInterval(recTick.current);
    rec.current?.stop();
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setRecSec(0);
    pulseRecording(false);
  }

  async function toggleRec() {
    if (recording) {
      stopRec(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunks.current = [];
      cancelled.current = false;
      mr.ondataavailable = (ev) => {
        if (ev.data.size) chunks.current.push(ev.data);
      };
      mr.onstop = async () => {
        if (cancelled.current) return;
        const type = mime.split(";")[0] || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        if (blob.size < 200) {
          toast.error("Voice note too short");
          return;
        }
        const file = new File([blob], type.includes("webm") ? "vocale.webm" : "vocale.m4a", { type });
        try {
          await uploadFile(file);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Voice note not sent");
        }
      };
      rec.current = mr;
      mr.start();
      setRecording(true);
      setRecSec(0);
      pulseTyping(false);
      pulseRecording(true);
      recTick.current = window.setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch {
      toast.error("Microphone not available");
    }
  }

  async function react(id: string, emoji: string) {
    const m = items.find((x) => x.id === id);
    const mine = m?.reactions.find((r) => r.userId === me.id && r.reaction === emoji);
    try {
      if (mine) await api(`/api/v1/messages/${id}/reactions/${encodeURIComponent(emoji)}`, { method: "DELETE" });
      else await api(`/api/v1/messages/${id}/reactions`, { method: "POST", body: JSON.stringify({ reaction: emoji }) });
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reaction failed");
    }
  }

  async function remove(id: string) {
    setGone((s) => new Set(s).add(id));
    setMenu(null);
    try {
      await api(`/api/v1/messages/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      setGone((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const replyMsg = items.find((m) => m.id === replyTo);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="chat-glow pointer-events-none absolute inset-0" />
      <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-pink-500/20 bg-black/40 px-3 py-2.5 backdrop-blur-xl">
        <button className="text-sm text-pink-200 md:hidden" onClick={() => history.back()}>
          ←
        </button>
        <UserAvatar name={title} src={other?.avatarUrl} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-medium text-pink-50">{title}</div>
          <div className="flex items-center gap-2 text-[12px] text-pink-300/80">
            {other?.online && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />}
            <span className={typing || peerRecording ? "animate-pulse text-emerald-300" : ""}>{presence}</span>
          </div>
        </div>
        {conv.data?.conversation.type !== "group" && other && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full text-pink-100 hover:bg-white/10"
              aria-label="Videochiamata"
              onClick={() => startCall({ conversationId, mode: "video", peerName: other.displayName })}
            >
              <Video className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full text-pink-100 hover:bg-white/10"
              aria-label="Chiamata vocale"
              onClick={() => startCall({ conversationId, mode: "audio", peerName: other.displayName })}
            >
              <Phone className="h-5 w-5" />
            </button>
          </div>
        )}
      </header>
      <div ref={scroller} className="relative z-10 min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.hasNextPage && (
          <div className="flex justify-center">
            <button
              type="button"
              className="rounded-full border border-pink-500/30 px-3 py-1 text-[11px] text-pink-200/80"
              onClick={() => void messages.fetchNextPage()}
              disabled={messages.isFetchingNextPage}
            >
              {messages.isFetchingNextPage ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        {visible.map((m) => {
          const mine = m.senderId === me.id;
          const ticks = receiptState(m, me.id);
          const grouped = groupReactions(m.reactions);
          return (
            <div key={m.id} className={cn("flex animate-in fade-in slide-in-from-bottom-2 duration-300", mine ? "justify-end" : "justify-start")}>
              <div className="max-w-[82%]">
                {m.replyToMessageId && (
                  <p className="mb-1 truncate rounded-lg border border-pink-400/20 bg-black/30 px-2 py-1 text-[11px] text-pink-200/80">
                    {previewFromCipher(items.find((x) => x.id === m.replyToMessageId)?.ciphertext, null)}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setMenu(menu === m.id ? null : m.id)}
                  className={cn(
                    "w-full rounded-2xl px-3 py-2 text-left text-sm shadow-lg transition hover:scale-[1.01]",
                    mine
                      ? "rounded-br-md bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-600 text-white"
                      : "rounded-bl-md border border-pink-500/20 bg-zinc-900/80 text-pink-50",
                    m.deletedAt && "opacity-60 italic",
                  )}
                >
                  {conv.data?.conversation.type === "group" && !mine && (
                    <p className="mb-1 text-[10px] font-medium text-pink-300">{m.sender?.displayName}</p>
                  )}
                  {m.attachments.map((a) => (
                    <Media key={a.id} attachment={a} mine={mine} onOpen={setLightbox} />
                  ))}
                  {(m.attachments.length === 0 || (plain[m.id] && plain[m.id] !== "…")) && (
                    <p className="whitespace-pre-wrap break-words">{plain[m.id] ?? (m.attachments.length ? "" : "…")}</p>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80">
                    {m.forwardedFromId && <span>inoltrato</span>}
                    {m.editedAt && <span>modificato</span>}
                    <span>{formatTime(m.createdAt)}</span>
                    {mine && <Ticks state={ticks} />}
                  </div>
                </button>
                {grouped.length > 0 && (
                  <div className={cn("mt-1 flex flex-wrap gap-1", mine ? "justify-end" : "justify-start")}>
                    {grouped.map((g) => (
                      <button
                        key={g.reaction}
                        className="rounded-full bg-black/50 px-2 py-0.5 text-xs shadow"
                        onClick={() => void react(m.id, g.reaction)}
                      >
                        {g.reaction} {g.count}
                      </button>
                    ))}
                  </div>
                )}
                {menu === m.id && !m.deletedAt && (
                  <div className="mt-2 flex flex-wrap gap-1 rounded-2xl border border-pink-500/30 bg-black/80 p-2 shadow-xl">
                    {REACTIONS.map((e) => (
                      <button key={e} className="text-lg transition hover:scale-125" onClick={() => void react(m.id, e)}>
                        {e}
                      </button>
                    ))}
                    <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-pink-500/20" onClick={() => { setReplyTo(m.id); setMenu(null); }} aria-label="Reply">
                      <Reply className="h-4 w-4" />
                    </button>
                    <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-pink-500/20" onClick={() => { onForward(m, plain[m.id] ?? ""); setMenu(null); }} aria-label="Forward">
                      <Forward className="h-4 w-4" />
                    </button>
                    {mine && (
                      <button
                        className="grid h-8 w-8 place-items-center rounded-full hover:bg-pink-500/20"
                        onClick={() => {
                          setEditing(m.id);
                          setText(plain[m.id] ?? "");
                          setMenu(null);
                        }}
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button className="grid h-8 w-8 place-items-center rounded-full text-rose-300 hover:bg-pink-500/20" onClick={() => void remove(m.id)} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {peerRecording && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-zinc-900/80 px-3 py-2 text-xs text-rose-200">
              <Mic className="h-3.5 w-3.5 animate-pulse text-rose-400" />
              <span>recording…</span>
            </div>
          </div>
        )}
        {typing && !peerRecording && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl bg-zinc-900/80 px-3 py-2">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400 [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400 [animation-delay:240ms]" />
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>
      {(replyTo || editing) && (
        <div className="relative z-10 flex items-center justify-between border-t border-pink-500/20 bg-black/50 px-3 py-2 text-xs text-pink-200">
          <span className="truncate">{editing ? "Edit message" : `Reply: ${previewFromCipher(replyMsg?.ciphertext, null)}`}</span>
          <button
            onClick={() => {
              setReplyTo(null);
              setEditing(null);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {recording ? (
        <div className="relative z-10 flex shrink-0 items-center gap-3 border-t border-rose-500/30 bg-black/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" className="rounded-full px-3 py-2 text-xs text-pink-200" onClick={() => stopRec(false)}>
            Cancel
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-rose-500/20 px-4 py-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
            <div className="flex h-6 flex-1 items-end gap-[2px]">
              {Array.from({ length: 22 }).map((_, i) => (
                <span key={i} className="w-[3px] animate-pulse rounded-full bg-rose-400" style={{ height: `${30 + ((i * 13 + recSec * 17) % 70)}%`, animationDelay: `${i * 40}ms` }} />
              ))}
            </div>
            <span className="font-mono text-sm text-rose-100">{formatDuration(recSec)}</span>
          </div>
          <Button type="button" size="icon" className="h-11 w-11 rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600" onClick={() => stopRec(true)} aria-label="Send voice note">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      ) : (
      <form
        className="relative z-10 flex shrink-0 items-end gap-2 border-t border-pink-500/20 bg-black/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send.mutate(undefined);
        }}
      >
        <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-pink-500/15 text-pink-200 hover:bg-pink-500/25">
          <Paperclip className="h-4 w-4" />
          <input type="file" className="hidden" accept="image/*,audio/*" onChange={(e) => void onUpload(e)} />
        </label>
        <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-pink-500/15 text-pink-200 hover:bg-pink-500/25">
          <Film className="h-4 w-4" />
          <input type="file" className="hidden" accept="video/mp4,video/quicktime,video/webm,video/3gpp,.mp4,.mov,.webm,.3gp,video/*" onChange={(e) => void onUpload(e)} />
        </label>
        <textarea
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            pulseTyping(true);
            window.clearTimeout(typingTimer.current);
            typingTimer.current = window.setTimeout(() => pulseTyping(false), 1800);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) send.mutate(undefined);
            }
          }}
          placeholder="Message"
          enterKeyHint="send"
          autoComplete="off"
          className="max-h-28 min-h-11 flex-1 resize-none rounded-3xl border border-pink-500/30 bg-zinc-950/70 px-4 py-2.5 text-sm text-pink-50 outline-none focus-visible:ring-2 focus-visible:ring-pink-400/40"
        />
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-11 w-11 rounded-full"
          onClick={() => void toggleRec()}
          aria-label="Voice note"
        >
          <Mic className="h-4 w-4" />
        </Button>
        <Button type="submit" size="icon" className="h-11 w-11 rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600" disabled={send.isPending || !text.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
      )}
      {lightbox && (
        <button
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4 animate-in fade-in"
          onClick={() => setLightbox(null)}
        >
          {lightbox.type === "image" ? (
            <img src={lightbox.src} alt="" className="max-h-full max-w-full rounded-xl shadow-2xl" />
          ) : (
            <video src={lightbox.src} controls autoPlay className="max-h-full max-w-full rounded-xl" />
          )}
        </button>
      )}
    </div>
  );
}

function Ticks({ state }: { state: "sent" | "delivered" | "read" }) {
  if (state === "sent") return <Check className="h-3.5 w-3.5 text-white/70" />;
  if (state === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-white/80" />;
  return <CheckCheck className="h-3.5 w-3.5 text-pink-200 drop-shadow-[0_0_6px_rgba(251,207,232,0.9)]" />;
}

function receiptState(m: ChatMessage, meId: string): "sent" | "delivered" | "read" {
  const others = m.receipts.filter((r) => r.userId !== meId);
  if (others.some((r) => r.readAt)) return "read";
  if (others.some((r) => r.deliveredAt)) return "delivered";
  return "sent";
}

function groupReactions(rows: { userId: string; reaction: string }[]) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.reaction, (map.get(r.reaction) ?? 0) + 1);
  return [...map.entries()].map(([reaction, count]) => ({ reaction, count }));
}

function Media({
  attachment,
  mine,
  onOpen,
}: {
  attachment: { id: string; originalFilename: string; mimeType: string };
  mine: boolean;
  onOpen: (v: { src: string; type: "image" | "video" }) => void;
}) {
  const src = `/api/v1/attachments/${attachment.id}`;
  const audioLike = attachment.mimeType.startsWith("audio/") || /^vocale\./i.test(attachment.originalFilename);
  if (attachment.mimeType.startsWith("image/")) {
    return (
      <img
        src={src}
        alt=""
        className="mt-1 max-h-72 max-w-full cursor-zoom-in rounded-xl"
        onClick={(e) => {
          e.stopPropagation();
          onOpen({ src, type: "image" });
        }}
      />
    );
  }
  if (audioLike) {
    return <VoiceNote src={src} mine={mine} />;
  }
  if (attachment.mimeType.startsWith("video/")) {
    return (
      <video
        src={src}
        className="mt-1 max-h-72 max-w-full rounded-xl"
        controls
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpen({ src, type: "video" });
        }}
      />
    );
  }
  if (attachment.mimeType.startsWith("audio/")) {
    return <audio src={src} controls className="mt-2 w-full" onClick={(e) => e.stopPropagation()} />;
  }
  return (
    <a className="mt-2 block underline" href={src} onClick={(e) => e.stopPropagation()}>
      {attachment.originalFilename}
    </a>
  );
}
