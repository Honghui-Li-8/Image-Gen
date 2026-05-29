import bcrypt from "bcrypt";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { tokenStore } from "../db/token-store.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

// mock the db module so the route uses our in-memory DB
vi.mock("../db/index.js", async () => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const { drizzle: d } = await import("drizzle-orm/better-sqlite3");
  const { migrate: m } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("../db/schema.js");
  const db = d(sqlite, { schema });
  m(db, { migrationsFolder: "./drizzle" });
  return { db };
});

const { authRouter } = await import("./auth.routes.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(authRouter);
  return app;
}

const now = new Date();

async function seedUser(
  db: ReturnType<typeof drizzle>,
  name: string,
  password: string
) {
  const passwordHash = await bcrypt.hash(password, 1);
  const id = createId();
  await db.insert(users).values({ id, name, passwordHash, lastLoginAt: now, createdAt: now });
  return id;
}

describe("POST /auth/login", () => {
  let app: ReturnType<typeof buildApp>;
  let db: ReturnType<typeof drizzle>;

  beforeEach(async () => {
    const { db: testDb } = await import("../db/index.js");
    db = testDb as ReturnType<typeof drizzle>;
    app = buildApp();
    tokenStore.clear();
  });

  afterEach(async () => {
    await db.delete(users);
    tokenStore.clear();
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app).post("/auth/login").send({ password: "pw" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app).post("/auth/login").send({ name: "alice" });
    expect(res.status).toBe(400);
  });

  it("returns 401 for an unknown name", async () => {
    const res = await request(app).post("/auth/login").send({ name: "nobody", password: "pw" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("returns 401 for wrong password without revealing whether user exists", async () => {
    await seedUser(db, "alice", "correct");
    const res = await request(app).post("/auth/login").send({ name: "alice", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("returns 200 with token for valid credentials", async () => {
    await seedUser(db, "alice", "pass123");
    const res = await request(app).post("/auth/login").send({ name: "alice", password: "pass123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.userId).toBeDefined();
    expect(res.body.name).toBe("alice");
  });

  it("writes the token to the tokenStore on success", async () => {
    await seedUser(db, "alice", "pass123");
    const res = await request(app).post("/auth/login").send({ name: "alice", password: "pass123" });
    expect(tokenStore.has(res.body.token)).toBe(true);
  });

  it("updates lastLoginAt in DB after successful login", async () => {
    const id = await seedUser(db, "alice", "pass123");
    const before = await db.select().from(users).where(eq(users.id, id));
    await new Promise((r) => setTimeout(r, 10));
    await request(app).post("/auth/login").send({ name: "alice", password: "pass123" });
    const after = await db.select().from(users).where(eq(users.id, id));
    expect(after[0].lastLoginAt.getTime()).toBeGreaterThanOrEqual(
      before[0].lastLoginAt.getTime()
    );
  });
});
