const express = require("express");
const { stmts } = require("./db");
const engine = require("./engine");

const bootedAt = Date.now();

function build() {
  const app = express();
  app.use(express.json());

  app.get(["/state", "/history", "/tape", "/health"], (req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    next();
  });

  app.get("/state", (req, res) => res.json(engine.getState()));

  app.get("/history", (req, res) => {
    const n = Math.min(Math.max(parseInt(req.query.n, 10) || 120, 1), 1000);
    res.json(stmts.recentHistory.all(n));
  });

  app.get("/tape", (req, res) => res.json(engine.getTape(20)));

  app.get("/health", (req, res) => {
    const last = engine.lastTickAt();
    res.json({
      ok: true,
      last_tick_ms_ago: last ? Date.now() - last : null,
      uptime_s: Math.round((Date.now() - bootedAt) / 1000),
    });
  });

  const admin = (req, res, next) => {
    if (req.get("x-admin-token") !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: "bad admin token" });
    }
    next();
  };

  app.post("/admin/nudge", admin, (req, res) => {
    const dm = Number(req.body && req.body.dm);
    if (!Number.isFinite(dm)) return res.status(400).json({ error: "dm must be a number" });
    res.json({ m: engine.nudge(dm) });
  });

  app.post("/admin/flag", admin, (req, res) => {
    const { key, value } = req.body || {};
    if (typeof key !== "string" || !key) return res.status(400).json({ error: "key required" });
    stmts.setFlag.run({ key, value: value == null ? null : String(value) });
    res.json({ key, value });
  });

  return app;
}

module.exports = { build };
