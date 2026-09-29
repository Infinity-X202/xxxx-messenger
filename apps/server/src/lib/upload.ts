import { mkdir, writeFile, unlink, open, rename, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { randomToken } from "./crypto.js";
import { env } from "../config.js";
import { errors } from "../errors.js";
import { ALLOWED_UPLOAD_MIME } from "@ixm/shared";

type Allowed = (typeof ALLOWED_UPLOAD_MIME)[number];

function sniffMime(buf: Buffer): Allowed | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  if (buf[0] === 0x50 && buf[1] === 0x4b) return "application/zip";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "video/webm";
  const brand = buf.subarray(4, 16).toString("ascii").toLowerCase();
  if (brand.startsWith("ftyp")) {
    if (brand.includes("heic") || brand.includes("heif") || brand.includes("mif1") || brand.includes("msf1")) return "image/heic";
    if (brand.includes("qt") || brand.includes("moov")) return "video/quicktime";
    if (brand.includes("3gp")) return "video/3gpp";
    if (brand.includes("m4a") || brand.includes("mp4a")) return "audio/mp4";
    return "video/mp4";
  }
  if (buf.subarray(0, 3).toString("ascii") === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (buf.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE") return "audio/wav";
  const sample = buf.subarray(0, 512);
  if (sample.length > 0 && !sample.includes(0) && /^[\t\n\r\x20-\x7e]*$/.test(sample.toString("latin1"))) return "text/plain";
  return null;
}

function normalizeDeclared(raw: string): string {
  const m = raw.toLowerCase().split(";")[0]!.trim();
  if (m === "image/jpg") return "image/jpeg";
  if (m === "audio/x-m4a") return "audio/mp4";
  if (m === "audio/mp4a-latm") return "audio/mp4";
  return m;
}

export function sanitizeOriginalName(name: string): string {
  return path.basename(name).replace(/[^\w.\- ]+/g, "_").slice(0, 180) || "file";
}

function resolveMime(rawType: string, head: Buffer): Allowed {
  const declared = normalizeDeclared(rawType);
  const sniffed = sniffMime(head);
  let mime = (sniffed ?? declared) as Allowed;
  if (declared === "audio/webm" && (sniffed === "video/webm" || !sniffed)) mime = "audio/webm";
  if (declared.startsWith("image/") && sniffed?.startsWith("image/")) mime = sniffed;
  if (declared.startsWith("video/") && sniffed?.startsWith("video/")) mime = sniffed;
  const allowed = ALLOWED_UPLOAD_MIME as readonly string[];
  if (!allowed.includes(mime)) {
    if (declared.startsWith("image/") || declared.startsWith("video/") || declared.startsWith("audio/")) {
      mime = (sniffed && allowed.includes(sniffed) ? sniffed : declared) as Allowed;
    }
  }
  if (!allowed.includes(mime)) throw errors.media();
  return (mime === "image/jpg" ? "image/jpeg" : mime) as Allowed;
}

export async function storeUpload(file: { filename: string; mimetype: string; buffer: Buffer }) {
  if (file.buffer.length > env.UPLOAD_MAX_BYTES) throw errors.payload();
  if (file.buffer.length < 8) throw errors.media("File vuoto");
  const mime = resolveMime(file.mimetype, file.buffer);
  const ext = safeExt(mime);
  const key = `${randomToken(18)}${ext}`;
  const dir = path.resolve(env.UPLOAD_DIR);
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, key);
  if (!dest.startsWith(dir)) throw errors.forbidden();
  await writeFile(dest, file.buffer);
  return {
    storageKey: key,
    originalFilename: sanitizeOriginalName(file.filename),
    mimeType: mime,
    size: file.buffer.length,
  };
}

export async function storeUploadStream(file: { filename: string; mimetype: string; stream: NodeJS.ReadableStream }) {
  const dir = path.resolve(env.UPLOAD_DIR);
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `tmp-${randomToken(14)}`);
  if (!tmp.startsWith(dir)) throw errors.forbidden();
  try {
    await pipeline(file.stream, createWriteStream(tmp));
    const st = await stat(tmp);
    if (st.size > env.UPLOAD_MAX_BYTES) throw errors.payload();
    if (st.size < 8) throw errors.media("File vuoto");
    const fh = await open(tmp, "r");
    const head = Buffer.alloc(Math.min(256, st.size));
    await fh.read(head, 0, head.length, 0);
    await fh.close();
    const mime = resolveMime(file.mimetype, head);
    const key = `${randomToken(18)}${safeExt(mime)}`;
    const dest = path.join(dir, key);
    if (!dest.startsWith(dir)) throw errors.forbidden();
    await rename(tmp, dest);
    return {
      storageKey: key,
      originalFilename: sanitizeOriginalName(file.filename),
      mimeType: mime,
      size: st.size,
    };
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export function resolveStoragePath(storageKey: string): string {
  if (storageKey.includes("..") || storageKey.includes("/") || storageKey.includes("\\")) {
    throw errors.forbidden();
  }
  const dir = path.resolve(env.UPLOAD_DIR);
  const dest = path.join(dir, storageKey);
  if (!dest.startsWith(dir)) throw errors.forbidden();
  return dest;
}

export async function deleteStored(storageKey: string): Promise<void> {
  try {
    await unlink(resolveStoragePath(storageKey));
  } catch {
    /* ignore */
  }
}

function safeExt(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/3gpp": ".3gp",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".weba",
    "audio/aac": ".aac",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "application/zip": ".zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  };
  return map[mime] ?? ".bin";
}
