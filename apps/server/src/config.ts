import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url(),
  CORS_ORIGIN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default("ixm_session"),
  SESSION_TTL_SECONDS: z.coerce.number().default(1_209_600),
  TRUST_PROXY: z.coerce.boolean().default(false),
  LOG_LEVEL: z.string().default("info"),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
  ACCESS_CODE_DUA: z.string().min(1).default("dua"),
  ACCESS_CODE_ADIL: z.string().min(1).default("adil"),
  ACCESS_CODE_GHOSTY: z.string().min(1).default("ghosty"),
  ACCESS_CODE_MARIA: z.string().min(1).default("maria"),
  CLOUDFLARE_TUNNEL_TOKEN: z.string().optional().default(""),
  TUNNEL_HOSTNAME: z.string().optional().default(""),
  UPLOAD_MAX_BYTES: z.coerce.number().default(524_288_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(60),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(120),
  API_RATE_LIMIT_MAX: z.coerce.number().default(120),
  API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(60),
  MESSAGE_RATE_LIMIT_MAX: z.coerce.number().default(40),
  MESSAGE_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(10),
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().default(20),
  UPLOAD_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(60),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_FROM: z.string().default("Infinity X Messenger <noreply@localhost>"),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional().default(""),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";


