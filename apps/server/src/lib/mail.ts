import nodemailer from "nodemailer";
import { env, isProd } from "../config.js";
import { logger } from "../logger.js";

function transport() {
  if (!env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
}

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const t = transport();
  if (!t) {
    if (isProd) {
      logger.warn({ to, subject }, "smtp_unconfigured_skip_email");
      return;
    }
    logger.info({ to, subject, text }, "dev_email_preview");
    return;
  }
  await t.sendMail({ from: env.SMTP_FROM, to, subject, text });
}
