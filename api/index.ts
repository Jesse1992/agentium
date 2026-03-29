/**
 * Vercel serverless entry point.
 *
 * Uses a dynamic import so any boot-time errors from server.ts are
 * surfaced as JSON responses rather than opaque FUNCTION_INVOCATION_FAILED.
 */
import express from "express";

const fallback = express();
fallback.use(express.json());

let bootError: string | null = null;
let serverApp: express.Express | null = null;

try {
  // server.js — compiled output of server.ts
  const mod = await import("../server.js");
  serverApp = mod.default as express.Express;
} catch (err: unknown) {
  bootError = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
  console.error("[boot error]", bootError);
}

fallback.use((req, res, next) => {
  if (bootError) {
    return res.status(500).json({ error: "boot_failed", details: bootError });
  }
  if (serverApp) return (serverApp as any)(req, res, next);
  next();
});

export default fallback;
