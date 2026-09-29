import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

export function VoiceNote({ src, mine }: { src: string; mine?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const bars = 28;

  useEffect(() => {
    const a = new Audio(src);
    a.preload = "metadata";
    audioRef.current = a;
    const onTime = () => setT(a.currentTime);
    const onMeta = () => setDur(Number.isFinite(a.duration) ? a.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setT(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, [src]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.playbackRate = speed;
      void a.play();
      setPlaying(true);
    }
  }

  function cycleSpeed() {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const progress = dur > 0 ? t / dur : 0;

  return (
    <div
      className={cn("flex min-w-[220px] items-center gap-2 py-1", mine ? "text-white" : "text-pink-50")}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-full shadow-lg transition hover:scale-105",
          mine ? "bg-white/20" : "bg-gradient-to-br from-rose-500 to-fuchsia-600",
        )}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-8 items-end gap-[3px]">
          {Array.from({ length: bars }).map((_, i) => {
            const h = 20 + ((i * 37) % 70);
            const on = i / bars <= progress;
            return (
              <span
                key={i}
                className={cn("w-[3px] rounded-full transition-all", on ? (mine ? "bg-white" : "bg-pink-400") : mine ? "bg-white/35" : "bg-pink-500/30")}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] opacity-80">
          <span>{formatDuration(playing || t > 0 ? t : dur)}</span>
          <button type="button" onClick={cycleSpeed} className="rounded-full px-1.5 font-semibold tracking-wide">
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}
