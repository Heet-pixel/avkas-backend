// Local development: read backend/.env. On Render nothing is read from disk – its dashboard variables win.
require("dotenv").config();

const isProd = process.env.NODE_ENV === "production";

const list = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);

const origins = list(process.env.CORS_ORIGINS || "https://avkasco.com,https://www.avkasco.com").map((o) => o.replace(/\/+$/, ""));
if (!isProd) for (const port of [3000, 5500, 8080]) origins.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`); // local dev servers (npx serve, Live Server…)

const cfg = {
  isProd,
  port: parseInt(process.env.PORT || "4000", 10),
  origins,
  aws: { region: process.env.AWS_REGION || "ap-south-1" },
  ses: { from: (process.env.SES_FROM_EMAIL || "").trim(), to: list(process.env.SES_TO_EMAIL) },
  maxFileBytes: 5 * 1024 * 1024,
};

/** Names of missing settings (values are never logged). */
cfg.missing = [
  !process.env.AWS_ACCESS_KEY_ID && "AWS_ACCESS_KEY_ID",
  !process.env.AWS_SECRET_ACCESS_KEY && "AWS_SECRET_ACCESS_KEY",
  !cfg.ses.from && "SES_FROM_EMAIL",
  !cfg.ses.to.length && "SES_TO_EMAIL",
].filter(Boolean);

module.exports = cfg;
