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
  vi.stubEnv("PROXY_URL", "http://proxy.test");
  vi.stubEnv("PROXY_AUTH_SECRET", "test-secret");
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
  vi.unstubAllEnvs();
  await db.delete(users);
  generationEmitter.removeAllListeners(GENERATION_UPDATE_EVENT);
  tokenStore.clear();
});

describe("POST /works/:workId/generations/preflight", () => {
  it("allows a valid batch when no generation is active", async () => {
    const workId = await seedWork(aliceId);

    const res = await request(app)
      .post(`/works/${workId}/generations/preflight`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send({ batchSize: 3, mode: "seed" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      canSchedule: true,
      maxBatchSize: 5,
      reason: null,
    });
  });

  it("rejects invalid batch sizes", async () => {
    const workId = await seedWork(aliceId);

    const tooSmall = await request(app)
      .post(`/works/${workId}/generations/preflight`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send({ batchSize: 0, mode: "seed" });
    const tooLarge = await request(app)
      .post(`/works/${workId}/generations/preflight`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send({ batchSize: 6, mode: "seed" });
    const fractional = await request(app)
      .post(`/works/${workId}/generations/preflight`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send({ batchSize: 2.5, mode: "seed" });

    expect(tooSmall.status).toBe(400);
    expect(tooLarge.status).toBe(400);
    expect(fractional.status).toBe(400);
  });

  it("rejects invalid modes", async () => {
    const workId = await seedWork(aliceId);

    const res = await request(app)
      .post(`/works/${workId}/generations/preflight`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send({ batchSize: 2, mode: "unknown" });

    expect(res.status).toBe(400);
  });

  it("rejects another user's work", async () => {
    const workId = await seedWork(aliceId);

    const res = await request(app)
      .post(`/works/${workId}/generations/preflight`)
      .set("Authorization", `Bearer ${BOB_TOKEN}`)
      .send({ batchSize: 2, mode: "config" });

    expect(res.status).toBe(404);
  });

  it("reports user queue limit without scheduling", async () => {
    const workId = await seedWork(aliceId);
    await seedGeneration(workId, aliceId, "queued");

    const res = await request(app)
      .post(`/works/${workId}/generations/preflight`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send({ batchSize: 2, mode: "seed" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      canSchedule: false,
      maxBatchSize: 5,
      reason: "You already have an active generation, wait for it to finish",
    });
  });

  it("reports global queue limit without scheduling", async () => {
    vi.stubEnv("COMFYUI_MAX_ACTIVE_JOBS", "10");
    vi.stubEnv("COMFYUI_MAX_GLOBAL_ACTIVE_JOBS", "2");

    const aliceWork = await seedWork(aliceId);
    const bobWork = await seedWork(bobId);
    await seedGeneration(aliceWork, aliceId, "queued");
    await seedGeneration(bobWork, bobId, "running");

    const res = await request(app)
      .post(`/works/${aliceWork}/generations/preflight`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send({ batchSize: 2, mode: "model" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      canSchedule: false,
      maxBatchSize: 5,
      reason: "GPU busy, try again shortly",
    });
  });
});

describe("POST /works/:workId/generations", () => {
  it("rejects missing auth", async () => {
    const workId = await seedWork(aliceId);

    const res = await request(app).post(`/works/${workId}/generations`).send(GENERATION_BODY);

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

  it("rejects when user already has an active generation (per-user cap)", async () => {
    const workId = await seedWork(aliceId);
    await seedGeneration(workId, aliceId, "queued");

    const res = await request(app)
      .post(`/works/${workId}/generations`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send(GENERATION_BODY);

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("You already have an active generation, wait for it to finish");
  });

  it("per-user cap does not block other users", async () => {
    vi.stubEnv("COMFYUI_MAX_ACTIVE_JOBS", "1");
    const aliceWork = await seedWork(aliceId);
    await seedGeneration(aliceWork, aliceId, "queued");

    const bobWork = await seedWork(bobId);
    const res = await request(app)
      .post(`/works/${bobWork}/generations`)
      .set("Authorization", `Bearer ${BOB_TOKEN}`)
      .send(GENERATION_BODY);

    expect(res.status).toBe(202);
  });

  it("rejects when global cap is reached across users", async () => {
    vi.stubEnv("COMFYUI_MAX_ACTIVE_JOBS", "10");
    vi.stubEnv("COMFYUI_MAX_GLOBAL_ACTIVE_JOBS", "2");

    const aliceWork = await seedWork(aliceId);
    const bobWork = await seedWork(bobId);
    await seedGeneration(aliceWork, aliceId, "queued");
    await seedGeneration(bobWork, bobId, "running");

    const res = await request(app)
      .post(`/works/${aliceWork}/generations`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`)
      .send(GENERATION_BODY);

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("GPU busy, try again shortly");
  });
});

describe("GET /generations/:generationId/status", () => {
  it("rejects missing auth before opening the stream", async () => {
    const workId = await seedWork(aliceId);
    const generationId = await seedGeneration(workId, aliceId, "completed");

    const res = await request(app).get(`/generations/${generationId}/status`);

    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("accepts query-token auth for terminal generations", async () => {
    const workId = await seedWork(aliceId);
    const generationId = await seedGeneration(workId, aliceId, "completed");

    const res = await request(app).get(`/generations/${generationId}/status?token=${ALICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain("event: status");
    expect(res.text).toContain('"status":"completed"');
  });

  it("accepts bearer auth for terminal generations", async () => {
    const workId = await seedWork(aliceId);
    const generationId = await seedGeneration(workId, aliceId, "failed");

    const res = await request(app)
      .get(`/generations/${generationId}/status`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('"status":"failed"');
  });

  it("rejects another user's generation", async () => {
    const workId = await seedWork(aliceId);
    const generationId = await seedGeneration(workId, aliceId, "completed");

    const res = await request(app).get(`/generations/${generationId}/status?token=${BOB_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it("streams running generation updates and closes on completion", async () => {
    const workId = await seedWork(aliceId);
    const generationId = await seedGeneration(workId, aliceId, "queued");

    const stream = request(app).get(`/generations/${generationId}/status?token=${ALICE_TOKEN}`);
    const response = stream.then((res) => res);

    setTimeout(() => {
      generationEmitter.emit(GENERATION_UPDATE_EVENT, {
        generationId,
        status: "running",
        progress: 50,
        detail: { stage: "sampling", step: 12, totalSteps: 28, message: "Sampling 12/28" },
      });
      generationEmitter.emit(GENERATION_UPDATE_EVENT, {
        generationId,
        status: "completed",
        progress: 100,
        imageUrl: null,
      });
    }, 10);

    const res = await response;

    expect(res.status).toBe(200);
    expect(res.text).toContain('"status":"queued"');
    expect(res.text).toContain('"status":"running"');
    expect(res.text).toContain('"progress":50');
    expect(res.text).toContain('"detail":{"stage":"sampling"');
    expect(res.text).toContain('"message":"Sampling 12/28"');
    expect(res.text).toContain('"status":"completed"');
  });

  it("streams concise failed generation errors", async () => {
    const workId = await seedWork(aliceId);
    const generationId = await seedGeneration(workId, aliceId, "queued");

    const stream = request(app).get(`/generations/${generationId}/status?token=${ALICE_TOKEN}`);
    const response = stream.then((res) => res);

    setTimeout(() => {
      generationEmitter.emit(GENERATION_UPDATE_EVENT, {
        generationId,
        status: "failed",
        progress: 100,
        error: "CUDA out of memory",
        detail: { stage: "failed", message: "CUDA out of memory" },
      });
    }, 10);

    const res = await response;

    expect(res.status).toBe(200);
    expect(res.text).toContain('"status":"failed"');
    expect(res.text).toContain('"error":"CUDA out of memory"');
    expect(res.text).toContain('"detail":{"stage":"failed"');
  });
});

describe("GET /generations/:generationId/image-token", () => {
  it("returns a signed image URL for the owning user", async () => {
    const workId = await seedWork(aliceId);
    const generationId = await seedGeneration(workId, aliceId, "completed");
    await db
      .update(generations)
      .set({ imageUrl: "ComfyUI_00001_.png" })
      .where(eq(generations.id, generationId));

    const res = await request(app)
      .get(`/generations/${generationId}/image-token`)
      .set("Authorization", `Bearer ${ALICE_TOKEN}`);

    expect(res.status).toBe(200);
    const url = new URL(res.body.url);
    expect(url.origin).toBe("http://proxy.test");
    expect(url.pathname).toBe("/images/ComfyUI_00001_.png");
    expect(url.searchParams.get("token")).toEqual(expect.any(String));
    expect(url.searchParams.get("exp")).toEqual(expect.any(String));
  });

  it("does not issue an image URL to another user", async () => {
    const workId = await seedWork(aliceId);
    const generationId = await seedGeneration(workId, aliceId, "completed");

    const res = await request(app)
      .get(`/generations/${generationId}/image-token`)
      .set("Authorization", `Bearer ${BOB_TOKEN}`);

    expect(res.status).toBe(404);
  });
});
