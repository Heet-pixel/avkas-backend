const app = require("./app");
const cfg = require("./config");

const server = app.listen(cfg.port, "0.0.0.0", () => {
  console.log(`avkas-api listening on :${cfg.port} (${cfg.isProd ? "production" : "development"})`);
  console.log(`CORS allowed origins: ${cfg.origins.join(", ")}`);
  if (cfg.missing.length) console.warn(`WARNING – missing settings, form emails will be refused: ${cfg.missing.join(", ")}`);
});

// Render stops the instance with SIGTERM – finish in-flight requests first.
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
