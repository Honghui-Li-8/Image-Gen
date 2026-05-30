import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db/index.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";
import { failInterruptedGenerations } from "./services/generation-job.service.js";

const REQUIRED_ENV_VARS = ["PROXY_AUTH_SECRET"] as const;
const missingVars = REQUIRED_ENV_VARS.filter((k) => !process.env[k]);
if (missingVars.length > 0) {
  console.error(`Missing required env vars: ${missingVars.join(", ")}`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production" && !process.env.PROXY_URL) {
  console.error("Missing required env var in production: PROXY_URL");
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;

async function start() {
  migrate(db, { migrationsFolder: "./drizzle" });
  await seed();
  await failInterruptedGenerations();

  const app = createApp();
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
