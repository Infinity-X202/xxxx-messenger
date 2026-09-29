export const APP_NAME = "xxxx";

export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;

export const ALLOWED_UPLOAD_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/3gpp",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/aac",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const WS_EVENTS = {
  HELLO: "hello",
  PING: "ping",
  PONG: "pong",
  MESSAGE_NEW: "message.new",
  MESSAGE_EDIT: "message.edit",
  MESSAGE_DELETE: "message.delete",
  MESSAGE_REACTION: "message.reaction",
  TYPING: "typing",
  PRESENCE: "presence",
  RECEIPT: "receipt",
  ERROR: "error",
} as const;
