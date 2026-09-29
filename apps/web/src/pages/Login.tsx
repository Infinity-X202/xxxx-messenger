import { FormEvent, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SITE_NAME } from "@/lib/brand";
import { AppDownloadIcon } from "@/components/AppDownloadBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Login() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    setLoading(true);
    try {
      const deviceName = navigator.userAgent.slice(0, 80);
      await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ code: value, deviceName }) });
      await new Promise((r) => setTimeout(r, 150));
      nav("/app", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame title={SITE_NAME}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="code">Secret code</Label>
          <Input id="code" name="code" required autoFocus autoComplete="off" spellCheck={false} placeholder="dua, adil, ghosty, maria" className="rounded-full" />
        </div>
        <Button className="w-full rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-600" disabled={loading}>
          {loading ? "Signing in…" : "Enter 💋"}
        </Button>
        <p className="text-center text-xs text-pink-300/70">Code only. No names, no email.</p>
        <div className="flex justify-center pt-1">
          <AppDownloadIcon />
        </div>
      </form>
    </AuthFrame>
  );
}

export function Register() {
  return <Navigate to="/login" replace />;
}

export function ForgotPassword() {
  return <Navigate to="/login" replace />;
}

export function ResetPassword() {
  return <Navigate to="/login" replace />;
}

export function VerifyEmail() {
  return <Navigate to="/login" replace />;
}

function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center p-4">
      <div className="hearts pointer-events-none absolute inset-0" />
      <Card className="relative w-full max-w-md border-pink-500/30 bg-black/50 shadow-[0_0_80px_rgba(244,63,94,0.25)] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="font-serif text-3xl leading-tight text-pink-100">{title}</CardTitle>
          <p className="text-sm text-pink-300/80">private chat, just for the two of you</p>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
