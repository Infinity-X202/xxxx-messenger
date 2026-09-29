# Security notes

- Password: Argon2id only. SHA-256/HMAC are for session tokens and IP hashing, never passwords.
- Sessions: random 32-byte token, hashed at rest, rotated after login (old cookie revoked), revocable.
- Login: constant-looking failure (`INVALID_CREDENTIALS`), lockout via Redis, dummy Argon2 verify when user missing.
- Forgot-password always returns `{ ok: true }`.
- CSRF: double-submit cookie + origin check in production.
- Authorization: membership/ownership on every conversation, message, attachment, session, device.
- Uploads: MIME allowlist, magic-byte check, random keys, path traversal rejected, `Content-Disposition: attachment`, HTML served as octet-stream.
- Rate limits: AUTH / API / MESSAGE / UPLOAD via Redis.
- Logs: passwords, tokens, cookies, private keys, E2EE ciphertext redacted from logger paths; audit table stores event names not secrets.
- Admin: `BOOTSTRAP_ADMIN_EMAIL` optional promotion; roles `user | moderator | admin` reserved for a future panel (no hardcoded admin UI).
