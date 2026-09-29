import { useEffect, useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";

export function AdminMediaThumb({
  id,
  mimeType,
  className,
}: {
  id: string;
  mimeType: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const url = `/api/v1/admin/files/content?id=${encodeURIComponent(id)}`;

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setFailed(false);
    setSrc(null);

    (async () => {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("preview failed");
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (alive) setSrc(objectUrl);
      } catch {
        if (alive) setFailed(true);
      }
    })();

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (failed) {
    return (
      <div className={`grid place-items-center bg-zinc-900 text-pink-400/40 ${className ?? ""}`}>
        <ImageIcon className="h-8 w-8" />
      </div>
    );
  }

  if (!src) {
    return (
      <div className={`grid place-items-center bg-zinc-900 text-pink-300/40 ${className ?? ""}`}>
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (mimeType.startsWith("video/")) {
    return <video src={src} className={className} muted preload="metadata" />;
  }

  return <img src={src} alt="" className={className} loading="lazy" />;
}
