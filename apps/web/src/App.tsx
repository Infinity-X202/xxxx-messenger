import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "./lib/api";
import { Landing } from "./pages/Landing";
import { Login, Register, ForgotPassword, ResetPassword, VerifyEmail } from "./pages/Login";
import { AppShell } from "./pages/AppShell";
import { ThemeProvider } from "./lib/theme";

export type Me = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  role: string;
  emailVerifiedAt: string | null;
  livecamPublisher?: boolean;
};

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/app/*" element={<RequireAuth />} />
      </Routes>
    </ThemeProvider>
  );
}

function RequireAuth() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    let stop = false;
    (async () => {
      for (let i = 0; i < 6; i++) {
        try {
          const r = await api<{ user: Me }>("/api/v1/auth/me");
          if (!stop) setMe(r.user);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 350 * (i + 1)));
        }
      }
      if (!stop) setMe(null);
    })();
    return () => {
      stop = true;
    };
  }, []);
  if (me === undefined) return <div className="grid min-h-screen place-items-center font-serif text-pink-200">xxxx</div>;
  if (!me) return <Navigate to="/login" replace />;
  return <AppShell me={me} />;
}
