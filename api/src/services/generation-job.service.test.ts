import bcrypt from "bcrypt";
import Database from "better-sqlite3";
import { createId } from "@paralleldrive/cuid2";
import { EventEmitter } from "events";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generationEmitter } from "../db/emitter.js";
import { generations, users, works } from "../db/schema.js";
import type { Generation } from "../db/schema.js";
import { tokenStore } from "../db/token-store.js";
import type { GenerationRequestConfig, GenerationUpdateEvent } from "./generation-job.service.js";

vi.mock("./comfyui.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./comfyui.service.js")>();
  return {
    ...actual,
    connectComfyWebSocket: vi.fn(),
    fetchComfyHistory: vi.fn(),
    loadComfyWorkflow: vi.fn(),
    patchComfyWorkflow: vi.fn(),
    submitComfyWorkflow: vi.fn(),
  };
});

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
  failInterruptedGenerations,
  runComfyGeneration,
  runStubGeneration,
  updateGenerationStatus,
} = await import("./generation-job.service.js");
const comfyui = await import("./comfyui.service.js");

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

const TEST_WORKFLOW = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: {}, _meta: { title: "Load model" } },
  "7": { class_type: "KSampler", inputs: { seed: 123 }, _meta: { title: "KSampler" } },
  "9": { class_type: "SaveImage", inputs: {}, _meta: { title: "Save image" } },
};

class FakeWebSocket extends EventEmitter {
  close = vi.fn(() => {
    this.emit("close");
  });
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
  vi.mocked(comfyui.connectComfyWebSocket).mockReset();
  vi.mocked(comfyui.fetchComfyHistory).mockReset();
  vi.mocked(comfyui.loadComfyWorkflow).mockReset();
  vi.mocked(comfyui.patchComfyWorkflow).mockReset();
  vi.mocked(comfyui.submitComfyWorkflow).mockReset();
  userId = await seedUser(`user_${createId()}`);
  workId = await seedWork(userId);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
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

  it("fails queued and running generations after an API restart", async () => {
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

    await expect(failInterruptedGenerations()).resolves.toBe(2);
    await expect(countInFlightGenerations(userId)).resolves.toBe(0);

    const rows = (await db
      .select()
      .from(generations)
      .where(inArray(generations.id, [queued.id, running.id, completed.id]))) as Generation[];
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(queued.id)?.status).toBe("failed");
    expect(byId.get(running.id)?.status).toBe("failed");
    expect(byId.get(completed.id)?.status).toBe("completed");
    expect(byId.get(queued.id)?.error).toBe("Generation interrupted by API restart");
  });

  it("updates the database before emitting status events", async () => {
    const generation = await createQueuedGeneration({ workId, userId, config: TEST_CONFIG });

    generationEmitter.once(GENERATION_UPDATE_EVENT, async (event: GenerationUpdateEvent) => {
      const [row] = await db
        .select()
        .from(generations)
        .where(eq(generations.id, event.generationId));
      expect(row.status).toBe(event.status);
    });

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

    const [row] = await db.select().from(generations).where(eq(generations.id, generation.id));

    expect(row.status).toBe("completed");
    expect(row.completedAt).toBeInstanceOf(Date);
    expect(events.map((event) => event.progress)).toEqual([10, 30, 60, 90, 100]);
    expect(events.at(-1)?.status).toBe("completed");
  });

  it("runs the ComfyUI worker through websocket progress and completes from history", async () => {
    vi.stubEnv("COMFYUI_POLL_INTERVAL_MS", "5");
    vi.stubEnv("COMFYUI_TIMEOUT_MS", "1000");
    const generation = await createQueuedGeneration({ workId, userId, config: TEST_CONFIG });
    const socket = new FakeWebSocket();
    const events: GenerationUpdateEvent[] = [];

    vi.mocked(comfyui.connectComfyWebSocket).mockReturnValue(socket as never);
    vi.mocked(comfyui.loadComfyWorkflow).mockResolvedValue(TEST_WORKFLOW);
    vi.mocked(comfyui.patchComfyWorkflow).mockReturnValue(TEST_WORKFLOW);
    vi.mocked(comfyui.submitComfyWorkflow).mockResolvedValue("prompt-1");
    vi.mocked(comfyui.fetchComfyHistory).mockResolvedValue({
      "prompt-1": {
        outputs: {
          "9": { images: [{ filename: "ComfyUI_00001_.png", type: "output" }] },
        },
      },
    });

    generationEmitter.on(GENERATION_UPDATE_EVENT, (event: GenerationUpdateEvent) => {
      events.push(event);
    });

    const worker = runComfyGeneration(generation.id);
    await vi.waitFor(() => expect(comfyui.submitComfyWorkflow).toHaveBeenCalled());

    socket.emit(
      "message",
      JSON.stringify({
        type: "progress",
        data: { prompt_id: "prompt-1", node: "7", value: 14, max: 28 },
      }),
      false
    );
    socket.emit(
      "message",
      JSON.stringify({ type: "execution_success", data: { prompt_id: "prompt-1" } }),
      false
    );
    await worker;

    const [row] = await db.select().from(generations).where(eq(generations.id, generation.id));
    const sampling = events.find((event) => event.detail?.stage === "sampling");

    expect(row.status).toBe("completed");
    expect(row.imageUrl).toBe("ComfyUI_00001_.png");
    expect(sampling).toEqual(
      expect.objectContaining({
        progress: expect.any(Number),
        detail: expect.objectContaining({ step: 14, totalSteps: 28 }),
      })
    );
    expect(socket.close).toHaveBeenCalled();
  });

  it("fails promptly when ComfyUI emits an execution error", async () => {
    vi.stubEnv("COMFYUI_POLL_INTERVAL_MS", "5");
    vi.stubEnv("COMFYUI_TIMEOUT_MS", "1000");
    const generation = await createQueuedGeneration({ workId, userId, config: TEST_CONFIG });
    const socket = new FakeWebSocket();

    vi.mocked(comfyui.connectComfyWebSocket).mockReturnValue(socket as never);
    vi.mocked(comfyui.loadComfyWorkflow).mockResolvedValue(TEST_WORKFLOW);
    vi.mocked(comfyui.patchComfyWorkflow).mockReturnValue(TEST_WORKFLOW);
    vi.mocked(comfyui.submitComfyWorkflow).mockResolvedValue("prompt-1");
    vi.mocked(comfyui.fetchComfyHistory).mockResolvedValue({});

    const worker = runComfyGeneration(generation.id);
    await vi.waitFor(() => expect(comfyui.submitComfyWorkflow).toHaveBeenCalled());

    socket.emit(
      "message",
      JSON.stringify({
        type: "execution_error",
        data: { prompt_id: "prompt-1", exception_message: "CUDA out of memory" },
      }),
      false
    );
    await worker;

    const [row] = await db.select().from(generations).where(eq(generations.id, generation.id));

    expect(row.status).toBe("failed");
    expect(row.error).toBe("CUDA out of memory");
    expect(socket.close).toHaveBeenCalled();
  });
});
