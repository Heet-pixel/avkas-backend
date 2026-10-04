const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const rateLimit = require("express-rate-limit");

const cfg = require("./config");
const { once } = require("./idempotency");
const { sendContact, sendCareer } = require("./mailer");
const { validateContact, validateCareer, validateResume, parseSubmissionId, clean } = require("./validate");

const app = express();
app.set("trust proxy", 1); // Render sits behind one proxy – needed for correct client IPs
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

/* ---------------- CORS: explicit allow-list, never "*" ---------------- */
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || cfg.origins.includes(origin)),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 86400,
  })
);
// CORS only protects browsers – also refuse POSTs that announce a foreign Origin.
const originGuard = (req, res, next) => {
  const o = req.headers.origin;
  if (o && !cfg.origins.includes(o)) return res.status(403).json({ status: "error", error: "Origin not allowed." });
  next();
};

/* ---------------- size limits & rate limits ---------------- */
app.use(express.json({ limit: "20kb" }));

const limit = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ status: "error", error: message }),
  });
const globalLimiter = limit(15 * 60 * 1000, 300, "Too many requests. Please try again later.");
const wakeLimiter = limit(60 * 1000, 60, "Too many requests.");
// 15 per 10 min per IP: a retried submission (up to 3 attempts) still fits comfortably.
const formLimiter = limit(10 * 60 * 1000, 15, "Too many submissions. Please try again in a few minutes.");
app.use(globalLimiter);

/* ---------------- health & wake: tiny, no side-effects, no email ---------------- */
app.get("/api/health", (req, res) => {
  res.set("Cache-Control", "no-store").json({ status: "ok" });
});
app.get("/api/wake", wakeLimiter, (req, res) => {
  res.set("Cache-Control", "no-store").json({ status: "awake" });
});

/* ---------------- uploads (memory only, hard limits) ---------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: cfg.maxFileBytes, files: 1, fields: 15, fieldSize: 24 * 1024, parts: 25 },
});

const notConfigured = (res) => res.status(503).json({ status: "error", error: "The email service is not available right now. Please call us or try again later." });

/* ---------------- POST /api/contact ---------------- */
app.post("/api/contact", originGuard, formLimiter, upload.none(), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (clean(b.website, 100)) return res.json({ status: "sent" }); // honeypot: pretend success to bots

    const id = parseSubmissionId(b.submissionId);
    if (!id) return res.status(400).json({ status: "error", error: "Invalid request. Please refresh the page and try again." });

    const v = validateContact(b);
    if (v.error) return res.status(400).json({ status: "error", error: v.error });
    if (cfg.missing.length) return notConfigured(res);

    const { first } = await once(`contact:${id}`, () => sendContact(v.data));
    res.json({ status: "sent", duplicate: !first }); // only reached after SES accepted the message
  } catch (err) {
    next(err);
  }
});

/* ---------------- POST /api/career ---------------- */
app.post("/api/career", originGuard, formLimiter, upload.single("resume"), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (clean(b.website, 100)) return res.json({ status: "sent" });

    const id = parseSubmissionId(b.submissionId);
    if (!id) return res.status(400).json({ status: "error", error: "Invalid request. Please refresh the page and try again." });

    const v = validateCareer(b);
    if (v.error) return res.status(400).json({ status: "error", error: v.error });
    const r = validateResume(req.file, cfg.maxFileBytes);
    if (r.error) return res.status(400).json({ status: "error", error: r.error });
    if (cfg.missing.length) return notConfigured(res);

    const { first } = await once(`career:${id}`, () => sendCareer(v.data, r.data));
    res.json({ status: "sent", duplicate: !first });
  } catch (err) {
    next(err);
  }
});

/* ---------------- 404 + error handling (no internals leaked) ---------------- */
app.use((req, res) => res.status(404).json({ status: "error", error: "Not found." }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    return res.status(tooBig ? 413 : 400).json({ status: "error", error: tooBig ? "Resume must be 5 MB or smaller." : "Invalid upload." });
  }
  if (err && (err.type === "entity.too.large" || err.status === 413)) return res.status(413).json({ status: "error", error: "Request too large." });
  if (err && err.type === "entity.parse.failed") return res.status(400).json({ status: "error", error: "Invalid request." });

  // Log what happened (name/message only – never request bodies or credentials), tell the visitor nothing sensitive.
  console.error("[error]", err && err.name, err && err.message);
  res.status(500).json({ status: "error", error: "We could not send your message right now. Please try again." });
});

module.exports = app;
