export function previewFromCipher(ciphertext?: string | null, deleted?: string | Date | null, messageType?: string) {
  if (deleted) return "Message deleted";
  if (!ciphertext) return typePreview(messageType);
  try {
    const env = JSON.parse(ciphertext) as { mode?: string; plaintext?: string };
    if (typeof env.plaintext === "string" && env.plaintext) return env.plaintext;
  } catch {
    /* ignore */
  }
  return typePreview(messageType) || "Message";
}

function typePreview(messageType?: string) {
  if (messageType === "image") return "Photo";
  if (messageType === "file") return "File";
  if (messageType === "emoji") return "Sticker";
  return "";
}
