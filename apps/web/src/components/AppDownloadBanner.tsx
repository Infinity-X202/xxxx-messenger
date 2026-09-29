import { Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

export function isNativeApp() {
  if (typeof window === "undefined") return false;
  const native = (window as unknown as { InfinityXNative?: unknown }).InfinityXNative;
  return Boolean(native) || /InfinityXApp/.test(navigator.userAgent);
}

export const APP_DOWNLOAD_HREF = "/api/v1/app/download";

export function AppDownloadIcon({ className }: { className?: string }) {
  if (isNativeApp()) return null;
  return (
    <a
      href={APP_DOWNLOAD_HREF}
      title="Scarica l’app Android"
      aria-label="Scarica l’app Android"
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-pink-500/40 bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-[0_0_18px_rgba(244,63,94,0.45)] hover:opacity-90",
        className,
      )}
    >
      <Smartphone className="h-5 w-5" />
    </a>
  );
}
