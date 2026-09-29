const ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

export function createPeer(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE });
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export async function addIce(
  pc: RTCPeerConnection,
  payload: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null },
) {
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
    /* ignore */
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
