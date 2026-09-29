import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/brand";
import { AppDownloadIcon } from "@/components/AppDownloadBanner";

export function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="hearts pointer-events-none absolute inset-0" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="font-serif text-xl text-pink-100">{SITE_NAME}</div>
        <div className="flex items-center gap-3">
          <AppDownloadIcon />
          <Button asChild className="rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-600">
            <Link to="/login">Enter</Link>
          </Button>
        </div>
      </header>
      <main className="relative mx-auto max-w-4xl px-6 py-24 text-center">
        <p className="animate-pulse text-sm tracking-[0.35em] text-pink-300">PRIVATE · SWEET · JUST YOU TWO</p>
        <h1 className="mt-6 font-serif text-5xl leading-tight text-pink-50 md:text-7xl">{SITE_NAME}</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-pink-200/80">
          Messages, photos, videos and voice notes. A pink world just for Dua.
        </p>
        <Button size="lg" asChild className="mt-10 rounded-full bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-600 px-10 text-base shadow-[0_0_40px_rgba(244,63,94,0.45)]">
          <Link to="/login">Open chat 😘</Link>
        </Button>
      </main>
    </div>
  );
}
