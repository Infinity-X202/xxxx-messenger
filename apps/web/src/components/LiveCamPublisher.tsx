import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { ensureRealtime, onRealtime, sendRealtime } from "@/lib/livecam-signaling";
import { addIce, attachLocalCamera, closePeer, createPeer, stopStream } from "@/lib/livecam";
import { nativeKeepScreenOn } from "@/lib/native";

type Slot = string;

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Sends camera when admin opens live view for this slot. */
export function LiveCamPublisher({ slot }: { slot: Slot }) {
  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const facing = useRef<"user" | "environment">("user");
  const busy = useRef(false);
  const iceBuf = useRef<{ candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }[]>([]);
  const streamingRef = useRef(false);
  const pendingJoin = useRef(false);
  const startFromTap = useRef<(() => void) | null>(null);
  const [tapNeeded, setTapNeeded] = useState(false);

  useEffect(() => {
    ensureRealtime();

    async function flushIce(conn: RTCPeerConnection) {
      const queued = iceBuf.current.splice(0);
      for (const c of queued) await addIce(conn, c);
    }

    async function sendOffer(conn: RTCPeerConnection) {
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
      const offer = await conn.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
      await conn.setLocalDescription(offer);
      sendRealtime({ type: "livecam.offer", payload: { sdp: offer.sdp!, slot } });
    }

    async function startOffer(mode: "user" | "environment" = facing.current, fromTap = false) {
      if (busy.current) return;
      if (isIos() && !fromTap && !streamingRef.current) {
        pendingJoin.current = true;
        setTapNeeded(true);
        return;
      }
      busy.current = true;
      facing.current = mode;
      iceBuf.current = [];
      try {
        stopStream(local.current);
        closePeer(pc.current);
        const conn = createPeer();
        pc.current = conn;
        local.current = await attachLocalCamera(conn, mode);
        streamingRef.current = true;
        pendingJoin.current = false;
        setTapNeeded(false);
        nativeKeepScreenOn(true);
        await sendOffer(conn);
      } catch {
        streamingRef.current = false;
        nativeKeepScreenOn(false);
        pendingJoin.current = true;
        setTapNeeded(true);
      } finally {
        busy.current = false;
      }
    }

    async function switchCamera(mode: "user" | "environment") {
      if (busy.current) return;
      facing.current = mode;
      await startOffer(mode, true);
    }

    startFromTap.current = () => {
      void startOffer(facing.current, true);
    };

    const off = onRealtime(async (msg) => {
      const p = (msg.payload ?? {}) as { slot?: Slot; resume?: boolean; facing?: "user" | "environment"; sdp?: string; candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
      if (p.slot && p.slot !== slot) return;

      if (msg.type === "livecam.viewer_join") {
        if (p.resume && streamingRef.current && pc.current?.connectionState === "connected") return;
        await startOffer(facing.current);
        return;
      }
      if (msg.type === "livecam.switch_camera") {
        if (p.facing) await switchCamera(p.facing);
        return;
      }
      if (msg.type === "livecam.answer") {
        const conn = pc.current;
        if (!p.sdp || !conn) return;
        try {
          if (conn.signalingState === "have-local-offer") {
            await conn.setRemoteDescription({ type: "answer", sdp: p.sdp });
            await flushIce(conn);
          }
        } catch {
          /* stale answer */
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
        return;
      }
      if (msg.type === "livecam.viewer_left") {
        stopStream(local.current);
        local.current = null;
        closePeer(pc.current);
        pc.current = null;
        streamingRef.current = false;
        pendingJoin.current = false;
        setTapNeeded(false);
        nativeKeepScreenOn(false);
      }
    });

    return () => {
      off();
      startFromTap.current = null;
    };
  }, [slot]);

  useEffect(() => {
    return () => {
      nativeKeepScreenOn(false);
      stopStream(local.current);
      closePeer(pc.current);
    };
  }, []);

  if (!tapNeeded) return null;

  return (
    <button
      type="button"
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center"
      onClick={() => {
        pendingJoin.current = false;
        startFromTap.current?.();
      }}
    >
      <Camera className="h-12 w-12 text-rose-400" />
      <p className="font-serif text-xl text-pink-100">Tocca per attivare la fotocamera</p>
      <p className="max-w-xs text-sm text-pink-300/80">iPhone richiede un tocco. Poi accetta Fotocamera e Microfono.</p>
    </button>
  );
}
