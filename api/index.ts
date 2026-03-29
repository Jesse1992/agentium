// Minimal test — will replace with full server once basic function works
import express from "express";

const app = express();
app.use(express.json());

app.get("/api/v1/test", (_req, res) => {
  res.json({ status: "ok", ts: Date.now(), env: process.env.NODE_ENV });
});

export default app;
