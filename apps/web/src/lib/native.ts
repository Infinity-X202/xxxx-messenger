type NativeBridge = {
  vibrate?: (ms?: number) => void;
  keepScreenOn?: (on: boolean) => void;
  share?: (text: string) => void;
  copy?: (text: string) => void;
  checkUpdate?: () => void;
  openSettings?: () => void;
  requestGallery?: () => void;
};

function bridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { InfinityXNative?: NativeBridge }).InfinityXNative ?? null;
}

export function nativeVibrate(ms = 40) {
  try {
    bridge()?.vibrate?.(ms);
  } catch {
    /* web */
  }
}

export function nativeKeepScreenOn(on: boolean) {
  try {
    bridge()?.keepScreenOn?.(on);
  } catch {
    /* web */
  }
}
