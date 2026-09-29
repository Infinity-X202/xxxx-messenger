import { useEffect } from "react";
import { api } from "@/lib/api";

type NativeInfo = {
  deviceInfo?: () => string;
};

function nativePhone(): Record<string, unknown> {
  const fn = (window as unknown as { InfinityXNative?: NativeInfo }).InfinityXNative?.deviceInfo;
  if (typeof fn !== "function") return { native: /InfinityXApp/.test(navigator.userAgent) };
  try {
    const raw = fn();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return { native: true, ...parsed };
  } catch {
    return { native: true };
  }
}

function screenLabel() {
  const s = window.screen;
  const dpr = window.devicePixelRatio || 1;
  return `${s.width}x${s.height}@${dpr}`;
}

function networkLabel() {
  const c = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return c?.effectiveType ?? "";
}

export function collectPhoneInfo() {
  const phone = nativePhone();
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return {
    manufacturer: typeof phone.manufacturer === "string" ? phone.manufacturer : undefined,
    model: typeof phone.model === "string" ? phone.model : undefined,
    brand: typeof phone.brand === "string" ? phone.brand : undefined,
    android: typeof phone.android === "string" ? phone.android : undefined,
    sdk: typeof phone.sdk === "number" ? phone.sdk : undefined,
    native: Boolean(phone.native),
    platform: navigator.platform || undefined,
    language: navigator.language || undefined,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
    screen: screenLabel(),
    network: networkLabel() || undefined,
    userAgent: navigator.userAgent.slice(0, 400),
    cpuCores: navigator.hardwareConcurrency || undefined,
    deviceMemoryGb: typeof mem === "number" ? mem : undefined,
    touchPoints: navigator.maxTouchPoints || undefined,
    online: navigator.onLine,
    vendor: typeof phone.vendor === "string" ? phone.vendor : undefined,
    osVersion: typeof phone.osVersion === "string" ? phone.osVersion : undefined,
  };
}

export function DevicePresence() {
  useEffect(() => {
    const send = () => {
      void api("/api/v1/presence", {
        method: "POST",
        body: JSON.stringify(collectPhoneInfo()),
      }).catch(() => undefined);
    };
    send();
    const t = window.setInterval(send, 45_000);
    const onVis = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return null;
}
