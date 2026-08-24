/**
 * Sentry initialization. MUST be the first import in server/index.ts so the
 * SDK can instrument modules before anything else loads.
 *
 * No-op unless SENTRY_DSN is set — local dev and any environment without the
 * env var run exactly as before.
 *
 * PII policy (deliberate, see the 2026-08 log-redaction sweep): no request
 * bodies, no cookies/auth headers, no user emails/IPs ever leave this server.
 */
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment:
      process.env.SENTRY_ENVIRONMENT ||
      (process.env.NODE_ENV === "production" ? "production" : "development"),
    // Keep default sendDefaultPii: false (no IPs, cookies, auth headers).
    tracesSampleRate: 0.1,
    includeLocalVariables: false,
    beforeSend(event) {
      // Belt-and-braces: strip request payloads and identity even if a
      // future integration starts attaching them.
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
          delete (event.request.headers as any)["x-api-key"];
        }
      }
      if (event.user) {
        // Keep nothing but an internal id if one was ever set.
        event.user = event.user.id ? { id: event.user.id } : undefined;
      }
      return event;
    },
  });
  console.log("✅ Sentry: initialized");
}

export { Sentry };
