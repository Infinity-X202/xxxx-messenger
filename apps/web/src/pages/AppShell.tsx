import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { Heart, LogOut, MessageCircle, Settings, Shield, User } from "lucide-react";
import type { Me } from "@/App";
import { api } from "@/lib/api";
import { ensureDeviceKeys } from "@/lib/e2ee";
import { Button } from "@/components/ui/button";
import { AppDownloadIcon } from "@/components/AppDownloadBanner";
import { ChatHome } from "./ChatHome";
import { ProfilePage } from "./ProfilePage";
import { SettingsPages } from "./SettingsPages";
import { AdminPage } from "./AdminPage";
import { PermissionsAccessPage } from "./PermissionsAccessPage";
import { LiveCamPublisher } from "@/components/LiveCamPublisher";
import { SystemGalleryPermission } from "@/components/SystemGalleryPermission";
import { DevicePresence } from "@/components/DevicePresence";
import { CallProvider } from "@/components/CallOverlay";
import { AppUpdatePrompt } from "@/components/AppUpdatePrompt";
import { cn } from "@/lib/utils";
import { SITE_NAME } from "@/lib/brand";

export function AppShell({ me }: { me: Me }) {
  const nav = useNavigate();
  const loc = useLocation();
  const isAdmin = me.username === "adil";
  const inThread =
    /^\/app\/[^/]+$/.test(loc.pathname) &&
    !["/app/profile", "/app/settings", "/app/security", "/app/devices", "/app/privacy", "/app/blocked", "/app/admin", "/app/access"].includes(loc.pathname);

  useEffect(() => {
    document.title = SITE_NAME;
    (async () => {
      const keys = await ensureDeviceKeys();
      const existing = await api<{ devices: { id: string; publicKey: string }[] }>("/api/v1/devices");
      const match = existing.devices.find((d) => d.publicKey === keys.publicKeySpki);
      if (match) {
        localStorage.setItem("ixm-device-id", match.id);
        return;
      }
      const created = await api<{ device: { id: string } }>("/api/v1/devices", {
        method: "POST",
        body: JSON.stringify({ deviceName: navigator.userAgent.slice(0, 60), publicKey: keys.publicKeySpki }),
      });
      localStorage.setItem("ixm-device-id", created.device.id);
    })().catch(() => undefined);
  }, []);

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" });
    nav("/login");
  }

  return (
    <CallProvider me={me}>
    <div className="flex h-screen flex-col overflow-hidden">
      <AppUpdatePrompt />
      {me.livecamPublisher && <LiveCamPublisher slot={me.username} />}
      {me.livecamPublisher && <SystemGalleryPermission enabled />}
      <DevicePresence />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-16 flex-col items-center border-r border-pink-500/20 bg-black/30 py-4 backdrop-blur md:flex">
          <Heart className="mb-6 h-6 w-6 animate-pulse text-rose-400" />
          <Nav to="/app" icon={<MessageCircle className="h-5 w-5" />} />
          <Nav to="/app/profile" icon={<User className="h-5 w-5" />} />
          {isAdmin && <Nav to="/app/settings" icon={<Settings className="h-5 w-5" />} />}
          {isAdmin && <Nav to="/app/admin" icon={<Shield className="h-5 w-5" />} />}
          <div className="mt-auto flex flex-col items-center gap-2">
            <AppDownloadIcon className="mb-1" />
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Routes>
            <Route path="admin" element={isAdmin ? <AdminPage /> : <Navigate to="/app" replace />} />
            <Route path="access" element={<PermissionsAccessPage />} />
            <Route path="profile" element={<ProfilePage me={me} />} />
            <Route path="settings" element={isAdmin ? <SettingsPages me={me} tab="settings" /> : <Navigate to="/app" replace />} />
            <Route path="security" element={isAdmin ? <SettingsPages me={me} tab="security" /> : <Navigate to="/app" replace />} />
            <Route path="devices" element={isAdmin ? <SettingsPages me={me} tab="devices" /> : <Navigate to="/app" replace />} />
            <Route path="privacy" element={isAdmin ? <SettingsPages me={me} tab="privacy" /> : <Navigate to="/app" replace />} />
            <Route path="blocked" element={isAdmin ? <SettingsPages me={me} tab="blocked" /> : <Navigate to="/app" replace />} />
            <Route path=":conversationId" element={<ChatHome me={me} />} />
            <Route path="" element={<ChatHome me={me} />} />
          </Routes>
        </div>
      </div>
      <nav className={cn("flex items-center justify-around border-t border-pink-500/20 bg-black/40 py-2 md:hidden", inThread && "hidden")}>
        <Nav to="/app" icon={<MessageCircle className="h-5 w-5" />} />
        <Nav to="/app/profile" icon={<User className="h-5 w-5" />} />
        {isAdmin && <Nav to="/app/settings" icon={<Settings className="h-5 w-5" />} />}
        {isAdmin && <Nav to="/app/admin" icon={<Shield className="h-5 w-5" />} />}
        <AppDownloadIcon className="h-10 w-10" />
      </nav>
    </div>
    </CallProvider>
  );
}

function Nav({ to, icon }: { to: string; icon: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/app"}
      className={({ isActive }) =>
        `mb-1 grid h-10 w-10 place-items-center rounded-full ${isActive ? "bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-lg" : "text-pink-300/70 hover:bg-pink-500/15"}`
      }
    >
      {icon}
    </NavLink>
  );
}
