import { SITE_NAME } from "./brand";
import { nativeVibrate } from "./native";

export function askNotifyPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") void Notification.requestPermission();
}

export function notifyIncoming(title: string, body: string) {
  nativeVibrate(50);
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  try {
    new Notification(title || SITE_NAME, { body, silent: false });
  } catch {
    /* ignored on unsupported browsers */
  }
}
