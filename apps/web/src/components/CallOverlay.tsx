import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff } from "lucide-react";
import type { Me } from "@/App";
import { onRealtime, sendRealtime } from "@/lib/realtime";
import { addIce, closePeer, createPeer, stopStream } from "@/lib/call-rtc";
import { nativeKeepScreenOn, nativeVibrate } from "@/lib/native";
import { UserAvatar } from "@/components/ui/avatar";

type Mode = "audio" | "video";
type Phase = "idle" | "outgoing" | "incoming" | "active";

type CallInfo = {
  phase: Phase;
  conversationId: string;
  callId: string;
  mode: Mode;
  peerName: string;
  fromUserId?: string;
};

type Api = {
  startCall: (opts: { conversationId: string; mode: Mode; peerName: string }) => void;
};

const Ctx = createContext<Api>({ startCall: () => undefined });
export function useCall() {
  return useContext(Ctx);
}

function newId() {
  return crypto.randomUUID?.() ?? `c${Date.now()}`;
}

export function CallProvider({ me, children }: { me: Me; children: ReactNode }) {
  const [call, setCall] = useState<CallInfo | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const remote = useRef<MediaStream | null>(null);
  const localVid = useRef<HTMLVideoElement>(null);
  const remoteVid = useRef<HTMLVideoElement>(null);
  const remoteAud = useRef<HTMLAudioElement>(null);
  const iceBuf = useRef<RTCIceCandidateInit[]>([]);
  const pendingOffer = useRef<string | null>(null);
  const callRef = useRef<CallInfo | null>(null);
  callRef.current = call;

  const hangup = useCallback((notify = true) => {
    const cur = callRef.current;
    if (notify && cur) {
      sendRealtime({ type: "call.end", payload: { conversationId: cur.conversationId, callId: cur.callId } });
    }
    stopStream(local.current);
    stopStream(remote.current);
    closePeer(pc.current);
    local.current = null;
    remote.current = null;
    pc.current = null;
    iceBuf.current = [];
    nativeKeepScreenOn(false);
    setCall(null);
    setMuted(false);
    setCamOff(false);
    setFacing("user");
  }, []);

  async function attachMedia(mode: Mode, face: "user" | "environment") {
    stopStream(local.current);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video" ? { facingMode: { ideal: face } } : false,
    });
    local.current = stream;
    if (localVid.current) localVid.current.srcObject = stream;
    return stream;
  }

  function wirePc(conversationId: string, callId: string) {
    const conn = createPeer();
    pc.current = conn;
    conn.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      sendRealtime({
        type: "call.ice",
        payload: {
          conversationId,
          callId,
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
        },
      });
    };
    conn.ontrack = (ev) => {
      remote.current = ev.streams[0] ?? new MediaStream([ev.track]);
      if (remoteVid.current) remoteVid.current.srcObject = remote.current;
      if (remoteAud.current) remoteAud.current.srcObject = remote.current;
    };
    conn.onconnectionstatechange = () => {
      if (conn.connectionState === "failed") {
        hangup(true);
      }
    };
    return conn;
  }

  const startCall = useCallback((opts: { conversationId: string; mode: Mode; peerName: string }) => {
    if (callRef.current) return;
    const callId = newId();
    const next: CallInfo = { phase: "outgoing", ...opts, callId };
    setCall(next);
    nativeVibrate(80);
    nativeKeepScreenOn(true);
    sendRealtime({
      type: "call.invite",
      payload: { conversationId: opts.conversationId, callId, mode: opts.mode, fromName: me.displayName },
    });
  }, [me.displayName]);

  async function accept() {
    const cur = callRef.current;
    if (!cur || cur.phase !== "incoming") return;
    sendRealtime({ type: "call.accept", payload: { conversationId: cur.conversationId, callId: cur.callId } });
    setCall({ ...cur, phase: "active" });
    nativeKeepScreenOn(true);
    try {
      const stream = await attachMedia(cur.mode, facing);
      const conn = wirePc(cur.conversationId, cur.callId);
      for (const t of stream.getTracks()) conn.addTrack(t, stream);
      const offerSdp = pendingOffer.current;
      pendingOffer.current = null;
      if (offerSdp) {
        await conn.setRemoteDescription({ type: "offer", sdp: offerSdp });
        for (const c of iceBuf.current.splice(0)) await addIce(conn, c);
        const answer = await conn.createAnswer();
        await conn.setLocalDescription(answer);
        sendRealtime({
          type: "call.answer",
          payload: { conversationId: cur.conversationId, callId: cur.callId, sdp: answer.sdp! },
        });
      }
    } catch {
      hangup(true);
    }
  }

  async function onPeerAccept() {
    const cur = callRef.current;
    if (!cur) return;
    setCall({ ...cur, phase: "active" });
    try {
      const stream = await attachMedia(cur.mode, facing);
      const conn = wirePc(cur.conversationId, cur.callId);
      for (const t of stream.getTracks()) conn.addTrack(t, stream);
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      sendRealtime({
        type: "call.offer",
        payload: { conversationId: cur.conversationId, callId: cur.callId, sdp: offer.sdp! },
      });
    } catch {
      hangup(true);
    }
  }

  useEffect(() => {
    return onRealtime(async (msg) => {
      const p = (msg.payload ?? {}) as {
        conversationId?: string;
        callId?: string;
        mode?: Mode;
        fromUserId?: string;
        fromName?: string;
        sdp?: string;
        candidate?: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
      };
      if (p.fromUserId === me.id) return;
      const cur = callRef.current;

      if (msg.type === "call.invite" && p.conversationId && p.callId && p.mode) {
        if (cur) return;
        nativeVibrate(200);
        setCall({
          phase: "incoming",
          conversationId: p.conversationId,
          callId: p.callId,
          mode: p.mode,
          peerName: p.fromName || "Chiamata",
          fromUserId: p.fromUserId,
        });
        nativeKeepScreenOn(true);
        return;
      }
      if (!cur || (p.callId && p.callId !== cur.callId)) return;
      if (msg.type === "call.reject" || msg.type === "call.end") {
        hangup(false);
        return;
      }
      if (msg.type === "call.accept" && cur.phase === "outgoing") {
        await onPeerAccept();
        return;
      }
      if (msg.type === "call.offer" && p.sdp) {
        if (!pc.current) {
          pendingOffer.current = p.sdp;
          return;
        }
        await pc.current.setRemoteDescription({ type: "offer", sdp: p.sdp });
        for (const c of iceBuf.current.splice(0)) {
          await addIce(pc.current, { candidate: c.candidate, sdpMid: c.sdpMid as string | null, sdpMLineIndex: c.sdpMLineIndex as number | null });
        }
        const answer = await pc.current.createAnswer();
        await pc.current.setLocalDescription(answer);
        sendRealtime({
          type: "call.answer",
          payload: { conversationId: cur.conversationId, callId: cur.callId, sdp: answer.sdp! },
        });
        return;
      }
      if (msg.type === "call.answer" && p.sdp && pc.current) {
        await pc.current.setRemoteDescription({ type: "answer", sdp: p.sdp });
        for (const c of iceBuf.current.splice(0)) {
          await addIce(pc.current, { candidate: c.candidate, sdpMid: c.sdpMid as string | null, sdpMLineIndex: c.sdpMLineIndex as number | null });
        }
        return;
      }
      if (msg.type === "call.ice" && p.candidate) {
        const cand = { candidate: p.candidate, sdpMid: p.sdpMid, sdpMLineIndex: p.sdpMLineIndex };
        if (!pc.current?.remoteDescription) iceBuf.current.push(cand);
        else await addIce(pc.current, cand);
      }
    });
  }, [hangup, me.id]);

  useEffect(() => {
    if (localVid.current && local.current) localVid.current.srcObject = local.current;
    if (remoteVid.current && remote.current) remoteVid.current.srcObject = remote.current;
  }, [call?.phase]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    local.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  }

  function toggleCam() {
    const next = !camOff;
    setCamOff(next);
    local.current?.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
  }

  async function flipCam() {
    if (!call || call.mode !== "video" || !pc.current) return;
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    const stream = await attachMedia("video", next);
    const v = stream.getVideoTracks()[0];
    const sender = pc.current.getSenders().find((s) => s.track?.kind === "video");
    if (v && sender) await sender.replaceTrack(v);
  }

  return (
    <Ctx.Provider value={{ startCall }}>
      {children}
      {call && call.phase !== "idle" && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-zinc-950 text-white">
          {call.mode === "video" && call.phase === "active" ? (
            <>
              <video ref={remoteVid} autoPlay playsInline className="h-full w-full object-cover" />
              <video
                ref={localVid}
                autoPlay
                muted
                playsInline
                className="absolute bottom-28 right-4 h-36 w-28 rounded-2xl object-cover ring-2 ring-white/30"
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <UserAvatar name={call.peerName} className="h-28 w-28 text-2xl" />
              <p className="text-2xl font-medium">{call.peerName}</p>
              <p className="text-sm text-zinc-400">
                {call.phase === "incoming" && (call.mode === "video" ? "Videochiamata in arrivo…" : "Chiamata in arrivo…")}
                {call.phase === "outgoing" && "Chiamata in corso…"}
                {call.phase === "active" && (call.mode === "video" ? "Videochiamata" : "In chiamata")}
              </p>
              {call.mode === "audio" && <audio ref={remoteAud} autoPlay />}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-5 pb-10">
            {call.phase === "incoming" ? (
              <>
                <button type="button" className="grid h-16 w-16 place-items-center rounded-full bg-red-500" onClick={() => {
                  sendRealtime({ type: "call.reject", payload: { conversationId: call.conversationId, callId: call.callId } });
                  hangup(false);
                }}>
                  <PhoneOff className="h-7 w-7" />
                </button>
                <button type="button" className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500" onClick={() => void accept()}>
                  {call.mode === "video" ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="grid h-14 w-14 place-items-center rounded-full bg-white/15" onClick={toggleMute}>
                  {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </button>
                {call.mode === "video" && call.phase === "active" && (
                  <>
                    <button type="button" className="grid h-14 w-14 place-items-center rounded-full bg-white/15" onClick={toggleCam}>
                      {camOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                    </button>
                    <button type="button" className="grid h-14 w-14 place-items-center rounded-full bg-white/15" onClick={() => void flipCam()}>
                      <SwitchCamera className="h-6 w-6" />
                    </button>
                  </>
                )}
                <button type="button" className="grid h-16 w-16 place-items-center rounded-full bg-red-500" onClick={() => hangup(true)}>
                  <PhoneOff className="h-7 w-7" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
