/** Shared non-secret defaults. Secrets always come from environment variables. */
export const defaults = {
  sessionCookieName: "ixm_session",
  csrfCookieName: "ixm_csrf",
  sessionTtlSeconds: 1_209_600,
};
