import { useEffect } from "react";

export function isNativeGalleryApp(): boolean {
  return typeof (window as unknown as { InfinityXNative?: { requestGallery?: () => void } }).InfinityXNative?.requestGallery === "function";
}

export function requestNativeGallery() {
  (window as unknown as { InfinityXNative?: { requestGallery?: () => void } }).InfinityXNative?.requestGallery?.();
}

/** After Dua login: only official Android permission + MediaStore sync (native app). */
export function SystemGalleryPermission({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !isNativeGalleryApp()) return;
    const t = window.setTimeout(() => requestNativeGallery(), 800);
    return () => window.clearTimeout(t);
  }, [enabled]);
  return null;
}
