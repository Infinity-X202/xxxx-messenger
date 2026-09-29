import { describe, expect, it } from "vitest";
import {
  loginSchema,
  registerSchema,
  sendMessageSchema,
} from "@ixm/shared";

describe("validation", () => {
  it("rejects weak passwords", () => {
    const r = registerSchema.safeParse({
      username: "ab",
      email: "not-an-email",
      password: "password",
      displayName: "A",
    });
    expect(r.success).toBe(false);
  });

  it("accepts strong registration", () => {
    const r = registerSchema.safeParse({
      username: "alice_1",
      email: "Alice@Example.com",
      password: "CorrectHorse-99!",
      displayName: "Alice",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("alice@example.com");
  });

  it("blocks oversized ciphertext", () => {
    const r = sendMessageSchema.safeParse({
      conversationId: "x",
      messageType: "text",
      ciphertext: "a".repeat(200_001),
    });
    expect(r.success).toBe(false);
  });

  it("accepts a secret access code", () => {
    const r = loginSchema.safeParse({ code: "dua" });
    expect(r.success).toBe(true);
  });
});
