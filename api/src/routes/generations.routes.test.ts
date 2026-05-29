import bcrypt from "bcrypt";
import Database from "better-sqlite3";
import express from "express";
import request from "supertest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generationEmitter } from "../db/emitter.js";
import { generations, users, works } from "../db/schema.js";
import { tokenStore } from "../db/token-store.js";
import type { GenerationRequestConfig } from "../services/generation-job.service.js";
import { GENERATION_UPDATE_EVENT } from "../services/generation-job.service.js";

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

const { generationsRouter } = await import("./generations.routes.js");

const ALICE_TOKEN = "alice-token";
const BOB_TOKEN = "bob-token";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let app: express.Express;
let aliceId: string;
let bobId: string;

const GENERATION_BODY: GenerationRequestConfig = {
  modelId: "illustrious-xl",
  selections: {
    bodyType: "slender",
    hairStyle: "long-hair",
  },
  selectedPreset: "portrait-2-3",
  seed: "123",
  additionalTags: ["cinematic lighting"],
  additionalPrompt: "standing",
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(generationsRouter);
  return app;
}

async function seedUser(name: string): Promise<string> {
  const id = createId();
  const now = new Date();
  await db.insert(users).values({
    id,
    name,
    passwordHash: await bcrypt.hash("password", 1),
    lastLoginAt: now,
    createdAt: now,
  });
  return id;
}

async function seedWork(userId: string): Promise<string> {
  const id = createId();
  const now = new Date();
  await db.insert(works).values({
    id,
    userId,
    name: "Work 1",
    config: {},
    activeGenerationId: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function seedGeneration(
  workId: string,
  userId: string,
  status: "queued" | "running" | "completed" | "failed"
): Promise<string> {
  const id = createId();
  const now = new Date();
  await db.insert(generations).values({
    id,
    workId,
    userId,
    status,
    promptId: null,
    config: GENERATION_BODY,
    workflowSnapshot: {},
    imageUrl: null,
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
  generationEmitter.removeAllListeners(GENERATION_UPDATE_EVENT);

  aliceId = await seedUser(`alice_${createId()}`);
  bobId = await seedUser(`bob_${createId()}`);
  tokenStore.set(ALICE_TOKEN, {
    token: ALICE_TOKEN,
    userId: aliceId,
    createdAt: new Date(),
  });
  tokenStore.set(BOB_TOKEN, {
    token: BOB_TOKEN,
    userId: bobId,
    createdAt: new Date(),
  });
});

afterEach(async () => {
  await db.delete(users);
  generationEmitter.removeAllListeners(GENERATION_UPDATE_EVENT);
  tokenStore.clear();
});

describe("POST /works/:workId/generations", () => {
  it("rejects missing auth", async () => {
    const workId = await seedWork(aliceId);

    const res = await request(app)
      .post(`/works/${workId}/generations`)
      .send(GENERATION_BODY);

    expect(res.status).toBe(401);
  });

  it("rejects another user's work", async () => {
    const workId = await seedWork(aliceId);

    const res = await request(app)
      .post(`/works/${workId}/generations`)
      .set("Authorization", `Bearer ${BOB_TOKEN}`)
      .send(GENERATION_BODY);

    expect(res.status).toBe(404);
  });

  it("rejects invalid request bodies", async () => {
    const workId = await seedWork(aliceId);

    const res = await request(app)
      .post(`/works/${workId}/generations`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send({ ...GENERATION_BODY, additionalTags: "cinematic lighting" });

    expect(res.status).toBe(400);
  });

  it("creates a queued generation and returns 202", async () => {
    const workId = await seedWork(aliceId);

    const res = await request(app)
      .post(`/works/${workId}/generations`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send(GENERATION_BODY);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("queued");
    expect(typeof res.body.generationId).toBe("string");

    const [generation] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, res.body.generationId));

    expect(generation.status).toBe("queued");
    expect(generation.config).toEqual(GENERATION_BODY);
  });

  it("updates the work activeGenerationId", async () => {
    const workId = await seedWork(aliceId);

    const res = await request(app)
      .post(`/works/${workId}/generations`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send(GENERATION_BODY);

    const [work] = await db.select().from(works).where(eq(works.id, workId));
    expect(work.activeGenerationId).toBe(res.body.generationId);
  });

  it("rejects a fourth in-flight generation", async () => {
    const workId = await seedWork(aliceId);
    await seedGeneration(workId, aliceId, "queued");
    await seedGeneration(workId, aliceId, "running");
    await seedGeneration(workId, aliceId, "queued");

    const res = await request(app)
      .post(`/works/${workId}/generations`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send(GENERATION_BODY);

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("Too many active generations");
  });
});
