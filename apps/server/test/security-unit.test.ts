import { describe, expect, it } from "vitest";
import { resolveStoragePath, sanitizeOriginalName } from "../src/lib/upload.js";
import { hmacHash, randomToken, safeEqual } from "../src/lib/crypto.js";

describe("crypto helpers", () => {
  it("generates unpredictable tokens", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it("safeEqual rejects different values", () => {
    expect(safeEqual("aaaa", "aaab")).toBe(false);
    expect(safeEqual("same", "same")).toBe(true);
  });

  it("does not use raw SHA for password-equivalent hashing of IPs", () => {
    expect(hmacHash("1.1.1.1")).not.toEqual("1.1.1.1");
  });
});

describe("upload path traversal", () => {
  it("rejects .. and separators in storage keys", () => {
    expect(() => resolveStoragePath("../etc/passwd")).toThrow();
    expect(() => resolveStoragePath("a/b")).toThrow();
    expect(() => resolveStoragePath("a\\b")).toThrow();
  });

  it("strips path components from original filenames", () => {
    expect(sanitizeOriginalName("../../etc/passwd")).toBe("passwd");
  });
});
