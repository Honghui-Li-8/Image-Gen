import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db/index.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3000;

async function start() {
  migrate(db, { migrationsFolder: "./drizzle" });
  await seed();

  const app = createApp();
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
