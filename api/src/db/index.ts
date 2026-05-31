import dotenv from "dotenv";
dotenv.config();

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import * as schema from "./schema.js";

const dbPath = resolve(process.env.DB_PATH ?? "./db.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
