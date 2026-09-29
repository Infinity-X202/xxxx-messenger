import { z } from "zod";
import { USERNAME_REGEX } from "./constants.js";

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a symbol");

export const registerSchema = z.object({
  username: z.string().regex(USERNAME_REGEX, "Username must be 3-32 letters, numbers, or underscore"),
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()),
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80),
});

export const loginSchema = z.object({
  code: z.string().trim().min(1).max(64),
  deviceName: z.string().trim().max(80).optional(),
});

export const joinSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  deviceName: z.string().trim().max(80).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(200),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  bio: z.string().max(280).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
});

export const createDirectConversationSchema = z.object({
  userId: z.string().min(1),
});

export const createGroupConversationSchema = z.object({
  title: z.string().trim().min(1).max(80),
  userIds: z.array(z.string().min(1)).min(1).max(32),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  messageType: z.enum(["text", "emoji", "image", "file"]),
  ciphertext: z.string().min(1).max(200_000),
  encryptionVersion: z.number().int().min(1).max(8).optional(),
  replyToMessageId: z.string().optional(),
  forwardedFromId: z.string().optional(),
  clientId: z.string().max(64).optional(),
});

export const editMessageSchema = z.object({
  ciphertext: z.string().min(1).max(200_000),
});

export const reactionSchema = z.object({
  reaction: z.string().min(1).max(32),
});

export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const contactRequestSchema = z.object({
  userId: z.string().min(1),
});

export const deviceRegisterSchema = z.object({
  deviceName: z.string().trim().min(1).max(80),
  publicKey: z.string().min(32).max(4096),
});

export const devicePresenceSchema = z.object({
  manufacturer: z.string().max(80).optional(),
  model: z.string().max(120).optional(),
  brand: z.string().max(80).optional(),
  android: z.string().max(40).optional(),
  sdk: z.number().int().min(1).max(99).optional(),
  native: z.boolean().optional(),
  platform: z.string().max(80).optional(),
  language: z.string().max(40).optional(),
  timezone: z.string().max(80).optional(),
  screen: z.string().max(40).optional(),
  network: z.string().max(40).optional(),
  userAgent: z.string().max(400).optional(),
  cpuCores: z.number().int().min(1).max(256).optional(),
  deviceMemoryGb: z.number().min(0).max(512).optional(),
  touchPoints: z.number().int().min(0).max(20).optional(),
  online: z.boolean().optional(),
  vendor: z.string().max(80).optional(),
  osVersion: z.string().max(80).optional(),
});

export const wsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping"), ts: z.number().optional() }),
  z.object({
    type: z.literal("message.send"),
    payload: sendMessageSchema,
  }),
  z.object({
    type: z.literal("typing"),
    payload: z.object({
      conversationId: z.string(),
      isTyping: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal("recording"),
    payload: z.object({
      conversationId: z.string(),
      isRecording: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal("livecam.watch"),
    payload: z.object({ slot: z.string().min(1).max(24).optional() }).optional(),
  }),
  z.object({
    type: z.literal("livecam.unwatch"),
    payload: z.object({ slot: z.string().min(1).max(24).optional() }).optional(),
  }),
  z.object({
    type: z.literal("livecam.switch"),
    payload: z.object({ facing: z.enum(["user", "environment"]), slot: z.string().min(1).max(24).optional() }),
  }),
  z.object({
    type: z.literal("livecam.offer"),
    payload: z.object({ sdp: z.string().min(1), slot: z.string().min(1).max(24).optional() }),
  }),
  z.object({
    type: z.literal("livecam.answer"),
    payload: z.object({ sdp: z.string().min(1), slot: z.string().min(1).max(24).optional() }),
  }),
  z.object({
    type: z.literal("livecam.ice"),
    payload: z.object({
      candidate: z.string(),
      sdpMid: z.string().nullable().optional(),
      sdpMLineIndex: z.number().nullable().optional(),
      slot: z.string().min(1).max(24).optional(),
    }),
  }),
  z.object({
    type: z.literal("receipt"),
    payload: z.object({
      conversationId: z.string(),
      messageId: z.string(),
      status: z.enum(["delivered", "read"]),
    }),
  }),
  z.object({
    type: z.literal("call.invite"),
    payload: z.object({
      conversationId: z.string(),
      callId: z.string(),
      mode: z.enum(["audio", "video"]),
      fromName: z.string().max(80).optional(),
    }),
  }),
  z.object({
    type: z.literal("call.accept"),
    payload: z.object({ conversationId: z.string(), callId: z.string() }),
  }),
  z.object({
    type: z.literal("call.reject"),
    payload: z.object({ conversationId: z.string(), callId: z.string() }),
  }),
  z.object({
    type: z.literal("call.end"),
    payload: z.object({ conversationId: z.string(), callId: z.string() }),
  }),
  z.object({
    type: z.literal("call.offer"),
    payload: z.object({ conversationId: z.string(), callId: z.string(), sdp: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("call.answer"),
    payload: z.object({ conversationId: z.string(), callId: z.string(), sdp: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("call.ice"),
    payload: z.object({
      conversationId: z.string(),
      callId: z.string(),
      candidate: z.string(),
      sdpMid: z.string().nullable().optional(),
      sdpMLineIndex: z.number().nullable().optional(),
    }),
  }),
]);

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
