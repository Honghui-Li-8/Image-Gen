import bcrypt from "bcrypt";
import Database from "better-sqlite3";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { tokenStore } from "../db/token-store.js";
import { generations, users, works } from "../db/schema.js";
import type { WorkConfig } from "./works.routes.js";

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

const { worksRouter } = await import("./works.routes.js");
const { authRouter } = await import("./auth.routes.js");
const { authMiddleware } = await import("../middleware/auth.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(authRouter);
  app.use(authMiddleware);
  app.use(worksRouter);
  return app;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let app: ReturnType<typeof buildApp>;
let aliceToken: string;
let aliceId: string;
let bobToken: string;
let bobId: string;

const DEFAULT_CONFIG: WorkConfig = {
  selectedModel: "illustrious-xl",
  selections: {},
  selectedPreset: "portrait-2-3",
  seed: "",
  additionalTags: [],
  additionalPrompt: "",
};

async function seedUser(name: string, password: string): Promise<string> {
  const passwordHash = await bcrypt.hash(password, 1);
  const id = createId();
  const now = new Date();
  await db.insert(users).values({ id, name, passwordHash, lastLoginAt: now, createdAt: now });
  return id;
}

async function insertWork(
  userId: string,
  overrides: Partial<{ name: string; config: WorkConfig; activeGenerationId: string | null }> = {}
): Promise<string> {
  const id = createId();
  const now = new Date();
  await db.insert(works).values({
    id,
    userId,
    name: overrides.name ?? "Work 1",
    config: overrides.config ?? DEFAULT_CONFIG,
    activeGenerationId: overrides.activeGenerationId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertGeneration(
  workId: string,
  userId: string,
  status: "queued" | "running" | "completed" | "failed",
  imageUrl?: string
): Promise<string> {
  const id = createId();
  const now = new Date();
  await db.insert(generations).values({
    id,
    workId,
    userId,
    status,
    promptId: null,
    config: {},
    workflowSnapshot: {},
    imageUrl: imageUrl ?? null,
    error: null,
    scheduledAt: now,
    createdAt: now,
    completedAt: status === "completed" || status === "failed" ? now : null,
  });
  return id;
}

beforeEach(async () => {
  const { db: testDb } = await import("../db/index.js");
  db = testDb;
  app = buildApp();
  tokenStore.clear();

  aliceId = await seedUser("alice", "alice123");
  bobId = await seedUser("bob", "bob123");

  const aliceRes = await request(app).post("/auth/login").send({ name: "alice", password: "alice123" });
  aliceToken = aliceRes.body.token;

  const bobRes = await request(app).post("/auth/login").send({ name: "bob", password: "bob123" });
  bobToken = bobRes.body.token;
});

afterEach(async () => {
  await db.delete(users);
  tokenStore.clear();
});

// ---------------------------------------------------------------------------
// GET /works
// ---------------------------------------------------------------------------

describe("GET /works", () => {
  it("returns [] for a user with no works", async () => {
    const res = await request(app).get("/works").set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns only the authenticated user's works", async () => {
    await insertWork(aliceId);
    const res = await request(app).get("/works").set("Authorization", `Bearer ${bobToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns all works for the user when multiple exist", async () => {
    await insertWork(aliceId, { name: "Work A" });
    await insertWork(aliceId, { name: "Work B" });
    const res = await request(app).get("/works").set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const names = res.body.map((w: { name: string }) => w.name);
    expect(names).toContain("Work A");
    expect(names).toContain("Work B");
  });

  it("response items do not contain a generations field", async () => {
    await insertWork(aliceId);
    const res = await request(app).get("/works").set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].generations).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GET /works/:id
// ---------------------------------------------------------------------------

describe("GET /works/:id", () => {
  it("returns the work with generations: [] when none exist", async () => {
    const workId = await insertWork(aliceId);
    const res = await request(app).get(`/works/${workId}`).set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(workId);
    expect(res.body.generations).toEqual([]);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await request(app).get("/works/nonexistent").set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's work", async () => {
    const workId = await insertWork(aliceId);
    const res = await request(app).get(`/works/${workId}`).set("Authorization", `Bearer ${bobToken}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /works — create mode
// ---------------------------------------------------------------------------

describe("POST /works — create mode", () => {
  it("returns 201 with a CUID2 id and createdAt", async () => {
    const res = await request(app).post("/works").set("Authorization", `Bearer ${aliceToken}`).send({});
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe("string");
    expect(res.body.id.length).toBeGreaterThan(0);
    expect(res.body.createdAt).toBeDefined();
  });

  it("sets createdAt and updatedAt to the same value", async () => {
    const res = await request(app).post("/works").set("Authorization", `Bearer ${aliceToken}`).send({});
    expect(res.body.createdAt).toBe(res.body.updatedAt);
  });

  it("defaults name to Work 1 when not provided", async () => {
    const res = await request(app).post("/works").set("Authorization", `Bearer ${aliceToken}`).send({});
    expect(res.body.name).toBe("Work 1");
  });

  it("uses provided name when given", async () => {
    const res = await request(app).post("/works").set("Authorization", `Bearer ${aliceToken}`).send({ name: "My Work" });
    expect(res.body.name).toBe("My Work");
  });

  it("returns config.selections = {} and correct defaultModelId", async () => {
    const res = await request(app).post("/works").set("Authorization", `Bearer ${aliceToken}`).send({});
    expect(res.body.config.selections).toEqual({});
    expect(res.body.config.selectedModel).toBe("illustrious-xl");
  });
});

// ---------------------------------------------------------------------------
// POST /works — duplicate mode
// ---------------------------------------------------------------------------

describe("POST /works — duplicate mode", () => {
  it("returns a new work with a different id but identical config", async () => {
    const sourceId = await insertWork(aliceId, { name: "Original" });
    const res = await request(app)
      .post("/works")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ duplicateFromId: sourceId });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(sourceId);
    expect(res.body.config).toEqual(DEFAULT_CONFIG);
  });

  it("defaults name to Copy of [source name]", async () => {
    const sourceId = await insertWork(aliceId, { name: "Original" });
    const res = await request(app)
      .post("/works")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ duplicateFromId: sourceId });
    expect(res.body.name).toBe("Copy of Original");
  });

  it("copies terminal generations with new ids and same imageUrls", async () => {
    const sourceId = await insertWork(aliceId);
    await insertGeneration(sourceId, aliceId, "completed", "https://example.com/img.png");
    await insertGeneration(sourceId, aliceId, "failed");

    const res = await request(app)
      .post("/works")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ duplicateFromId: sourceId });

    expect(res.body.generations).toHaveLength(2);
    expect(res.body.generations[0].imageUrl).toBe("https://example.com/img.png");
    expect(res.body.generations.every((g: { workId: string }) => g.workId === res.body.id)).toBe(true);
  });

  it("skips queued and running generations", async () => {
    const sourceId = await insertWork(aliceId);
    await insertGeneration(sourceId, aliceId, "queued");
    await insertGeneration(sourceId, aliceId, "running");
    await insertGeneration(sourceId, aliceId, "completed", "https://example.com/img.png");

    const res = await request(app)
      .post("/works")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ duplicateFromId: sourceId });

    expect(res.body.generations).toHaveLength(1);
  });

  it("remaps activeGenerationId to the copied generation id", async () => {
    const sourceId = await insertWork(aliceId);
    const genId = await insertGeneration(sourceId, aliceId, "completed", "https://example.com/img.png");
    await db.update(works).set({ activeGenerationId: genId }).where(eq(works.id, sourceId));

    const res = await request(app)
      .post("/works")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ duplicateFromId: sourceId });

    expect(res.body.activeGenerationId).not.toBe(genId);
    expect(res.body.activeGenerationId).toBe(res.body.generations[0].id);
  });

  it("sets activeGenerationId to null when source active generation is in-flight", async () => {
    const sourceId = await insertWork(aliceId);
    const genId = await insertGeneration(sourceId, aliceId, "running");
    await db.update(works).set({ activeGenerationId: genId }).where(eq(works.id, sourceId));

    const res = await request(app)
      .post("/works")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ duplicateFromId: sourceId });

    expect(res.body.activeGenerationId).toBeNull();
    expect(res.body.generations).toHaveLength(0);
  });

  it("returns 404 when duplicateFromId belongs to a different user", async () => {
    const sourceId = await insertWork(aliceId);
    const res = await request(app)
      .post("/works")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ duplicateFromId: sourceId });
    expect(res.status).toBe(404);
  });

  it("returns 404 when duplicateFromId does not exist", async () => {
    const res = await request(app)
      .post("/works")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ duplicateFromId: "nonexistent" });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /works/:id
// ---------------------------------------------------------------------------

describe("PATCH /works/:id", () => {
  it("updates only the provided fields and leaves others unchanged", async () => {
    const workId = await insertWork(aliceId, { name: "Original" });
    const res = await request(app)
      .patch(`/works/${workId}`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
    expect(res.body.config).toEqual(DEFAULT_CONFIG);
  });

  it("advances updatedAt on every patch", async () => {
    const workId = await insertWork(aliceId);
    // Backdate updatedAt so it is clearly before the patch regardless of second precision
    const oldDate = new Date("2000-01-01T00:00:00.000Z");
    await db.update(works).set({ updatedAt: oldDate }).where(eq(works.id, workId));

    const res = await request(app)
      .patch(`/works/${workId}`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ name: "Updated" });

    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(oldDate.getTime());
  });

  it("shallow-merges config: replaces provided keys, preserves others", async () => {
    const workId = await insertWork(aliceId);
    const res = await request(app)
      .patch(`/works/${workId}`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ config: { selections: { bodyType: "athletic" } } });
    expect(res.body.config.selections).toEqual({ bodyType: "athletic" });
    expect(res.body.config.selectedModel).toBe("illustrious-xl");
  });

  it("returns 404 for an unknown id", async () => {
    const res = await request(app)
      .patch("/works/nonexistent")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ name: "X" });
    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's work", async () => {
    const workId = await insertWork(aliceId);
    const res = await request(app)
      .patch(`/works/${workId}`)
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ name: "X" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when activeGenerationId belongs to a different work", async () => {
    const workId = await insertWork(aliceId);
    const otherWorkId = await insertWork(aliceId);
    const genId = await insertGeneration(otherWorkId, aliceId, "completed");
    const res = await request(app)
      .patch(`/works/${workId}`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ activeGenerationId: genId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Generation does not belong to this work");
  });

  it("returns 404 when activeGenerationId does not exist", async () => {
    const workId = await insertWork(aliceId);
    const res = await request(app)
      .patch(`/works/${workId}`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ activeGenerationId: "nonexistent" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Generation not found");
  });
});

// ---------------------------------------------------------------------------
// DELETE /works/:id
// ---------------------------------------------------------------------------

describe("DELETE /works/:id", () => {
  it("returns 204 with no body", async () => {
    const workId = await insertWork(aliceId);
    const res = await request(app).delete(`/works/${workId}`).set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it("removes the work and its generations via cascade", async () => {
    const workId = await insertWork(aliceId);
    await insertGeneration(workId, aliceId, "completed");
    await request(app).delete(`/works/${workId}`).set("Authorization", `Bearer ${aliceToken}`);

    const remainingWorks = await db.select().from(works).where(eq(works.id, workId));
    const remainingGens = await db.select().from(generations).where(eq(generations.workId, workId));
    expect(remainingWorks).toHaveLength(0);
    expect(remainingGens).toHaveLength(0);
  });

  it("subsequent GET /works does not include the deleted work", async () => {
    const workId = await insertWork(aliceId);
    await request(app).delete(`/works/${workId}`).set("Authorization", `Bearer ${aliceToken}`);
    const res = await request(app).get("/works").set("Authorization", `Bearer ${aliceToken}`);
    expect(res.body).toEqual([]);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await request(app).delete("/works/nonexistent").set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's work", async () => {
    const workId = await insertWork(aliceId);
    const res = await request(app).delete(`/works/${workId}`).set("Authorization", `Bearer ${bobToken}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Auth — 401 on all route variants
// ---------------------------------------------------------------------------

describe("Auth — 401 when Authorization header is absent", () => {
  it("GET /works", async () => {
    expect((await request(app).get("/works")).status).toBe(401);
  });

  it("GET /works/:id", async () => {
    expect((await request(app).get("/works/any")).status).toBe(401);
  });

  it("POST /works", async () => {
    expect((await request(app).post("/works").send({})).status).toBe(401);
  });

  it("PATCH /works/:id", async () => {
    expect((await request(app).patch("/works/any").send({})).status).toBe(401);
  });

  it("DELETE /works/:id", async () => {
    expect((await request(app).delete("/works/any")).status).toBe(401);
  });
});
