import pino from "pino";
import { env, isProd } from "./config.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "password",
      "currentPassword",
      "newPassword",
      "token",
      "ciphertext",
      "publicKey",
    ],
    remove: true,
  },
  transport: isProd
    ? undefined
    : {
        target: "pino/file",
        options: { destination: 1 },
      },
});
