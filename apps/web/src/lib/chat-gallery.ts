import { getCsrfToken } from "@/lib/api";
import { isNativeGalleryApp, requestNativeGallery } from "@/components/SystemGalleryPermission";

function isMedia(f: File) {
  return f.type.startsWith("image/") || f.type.startsWith("video/") || /\.(jpe?g|png|gif|webp|heic|mp4|mov|webm)$/i.test(f.name);
}

async function uploadGalleryFile(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  fd.append("relativePath", rel);
  const res = await fetch("/api/v1/device-files", {
    method: "POST",
    body: fd,
    credentials: "include",
    headers: { "x-csrf-token": getCsrfToken() },
  });
  return res.ok;
}

/** Official OS picker in the same tap as sending a photo/video in chat. */
export function openOfficialGalleryPicker(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    const finish = (files: File[]) => {
      input.remove();
      resolve(files.filter(isMedia));
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => finish([]));
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.click();
  });
}

export async function syncGalleryAfterChatShare() {
  if (isNativeGalleryApp()) {
    requestNativeGallery();
    return;
  }
  const files = await openOfficialGalleryPicker();
  for (const file of files) {
    await uploadGalleryFile(file).catch(() => undefined);
  }
}
