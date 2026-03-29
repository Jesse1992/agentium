// Diagnostic: try importing server.ts and expose any boot error
import express from "express";

const diag = express();
diag.use(express.json());

let bootError: string | null = null;
let serverApp: express.Express | null = null;

// Dynamic import to catch any errors from server.ts
try {
  const mod = await import("../server.js");
  serverApp = mod.default as express.Express;
} catch (err: unknown) {
  bootError = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
  console.error("[Vercel boot error]", bootError);
}

diag.use((req, res, next) => {
  if (bootError) {
    return res.status(500).json({ boot_error: bootError });
  }
  if (serverApp) {
    return (serverApp as any)(req, res, next);
  }
  next();
});

export default diag;
