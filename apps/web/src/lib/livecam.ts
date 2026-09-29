const ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

export function createPeer(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE });
}

export async function attachLocalCamera(pc: RTCPeerConnection, facing: "user" | "environment" = "user"): Promise<MediaStream> {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const video = ios
    ? ({ facingMode: facing } as MediaTrackConstraints)
    : ({ facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } as MediaTrackConstraints);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  }
  for (const track of stream.getTracks()) pc.addTrack(track, stream);
  return stream;
}

export function captureVideoFrame(video: HTMLVideoElement): boolean {
  if (!video.videoWidth) return false;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(video, 0, 0);
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hack-camera-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    "image/jpeg",
    0.92,
  );
  return true;
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export async function addIce(pc: RTCPeerConnection, payload: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }) {
  if (!payload.candidate) return;
  try {
    await pc.addIceCandidate(
      new RTCIceCandidate({
        candidate: payload.candidate,
        sdpMid: payload.sdpMid ?? undefined,
        sdpMLineIndex: payload.sdpMLineIndex ?? undefined,
      }),
    );
  } catch {
    /* candidate arrived before remote description */
  }
}

export function closePeer(pc: RTCPeerConnection | null) {
  if (!pc) return;
  try {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
  } catch {
    /* ignore */
  }
}
