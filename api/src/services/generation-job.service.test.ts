import bcrypt from "bcrypt";
import Database from "better-sqlite3";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generationEmitter } from "../db/emitter.js";
import { generations, users, works } from "../db/schema.js";
import { tokenStore } from "../db/token-store.js";
import type { GenerationRequestConfig, GenerationUpdateEvent } from "./generation-job.service.js";

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

const {
  GENERATION_UPDATE_EVENT,
  countInFlightGenerations,
  createQueuedGeneration,
  runStubGeneration,
  updateGenerationStatus,
} = await import("./generation-job.service.js");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let userId: string;
let workId: string;

const TEST_CONFIG: GenerationRequestConfig = {
  modelId: "illustrious-xl",
  selections: { bodyType: "slender" },
  selectedPreset: "portrait-2-3",
  seed: "123",
  additionalTags: ["cinematic lighting"],
  additionalPrompt: "standing",
};

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

async function seedWork(ownerId: string): Promise<string> {
  const id = createId();
  const now = new Date();
  await db.insert(works).values({
    id,
    userId: ownerId,
    name: "Work 1",
    config: {},
    activeGenerationId: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

beforeEach(async () => {
  const { db: testDb } = await import("../db/index.js");
  db = testDb;
  tokenStore.clear();
  generationEmitter.removeAllListeners(GENERATION_UPDATE_EVENT);
  userId = await seedUser(`user_${createId()}`);
  workId = await seedWork(userId);
});

afterEach(async () => {
  vi.useRealTimers();
  generationEmitter.removeAllListeners(GENERATION_UPDATE_EVENT);
  await db.delete(users);
  tokenStore.clear();
});

describe("generation job service", () => {
  it("creates queued generations with immutable request snapshots", async () => {
    const generation = await createQueuedGeneration({
      workId,
      userId,
      config: TEST_CONFIG,
    });

    expect(generation.status).toBe("queued");
    expect(generation.workId).toBe(workId);
    expect(generation.userId).toBe(userId);
    expect(generation.config).toEqual(TEST_CONFIG);
    expect(generation.workflowSnapshot).toEqual({});
  });

  it("counts queued and running generations only", async () => {
    const queued = await createQueuedGeneration({ workId, userId, config: TEST_CONFIG });
    const running = await createQueuedGeneration({ workId, userId, config: TEST_CONFIG });
    const completed = await createQueuedGeneration({ workId, userId, config: TEST_CONFIG });

    await updateGenerationStatus({
      generationId: running.id,
      status: "running",
      progress: 10,
    });
    await updateGenerationStatus({
      generationId: completed.id,
      status: "completed",
      progress: 100,
    });

    expect(queued.status).toBe("queued");
    expect(await countInFlightGenerations(userId)).toBe(2);
  });

  it("updates the database before emitting status events", async () => {
    const generation = await createQueuedGeneration({ workId, userId, config: TEST_CONFIG });

    generationEmitter.once(
      GENERATION_UPDATE_EVENT,
      async (event: GenerationUpdateEvent) => {
        const [row] = await db
          .select()
          .from(generations)
          .where(eq(generations.id, event.generationId));
        expect(row.status).toBe(event.status);
      }
    );

    await updateGenerationStatus({
      generationId: generation.id,
      status: "running",
      progress: 10,
    });
  });

  it("runs the stub worker through progress events and completes the row", async () => {
    vi.useFakeTimers();
    const generation = await createQueuedGeneration({ workId, userId, config: TEST_CONFIG });
    const events: GenerationUpdateEvent[] = [];

    generationEmitter.on(GENERATION_UPDATE_EVENT, (event: GenerationUpdateEvent) => {
      events.push(event);
    });

    const worker = runStubGeneration(generation.id);
    await vi.runAllTimersAsync();
    await worker;

    const [row] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, generation.id));

    expect(row.status).toBe("completed");
    expect(row.completedAt).toBeInstanceOf(Date);
    expect(events.map((event) => event.progress)).toEqual([10, 30, 60, 90, 100]);
    expect(events.at(-1)?.status).toBe("completed");
  });
});
