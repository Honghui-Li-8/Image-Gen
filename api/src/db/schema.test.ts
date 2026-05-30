import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { generations, users, works } from "./schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

const now = new Date();

function makeUser(overrides?: Partial<typeof users.$inferInsert>) {
  return {
    id: createId(),
    name: `user_${createId()}`,
    passwordHash: "hash",
    lastLoginAt: now,
    createdAt: now,
    ...overrides,
  };
}

function makeWork(userId: string, overrides?: Partial<typeof works.$inferInsert>) {
  return {
    id: createId(),
    userId,
    name: "My Work",
    config: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeGeneration(
  workId: string,
  userId: string,
  overrides?: Partial<typeof generations.$inferInsert>
) {
  return {
    id: createId(),
    workId,
    userId,
    status: "queued" as const,
    config: {},
    workflowSnapshot: {},
    scheduledAt: now,
    createdAt: now,
    ...overrides,
  };
}

describe("schema constraints", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("enforces FK: inserting a work with a non-existent userId throws", () => {
    expect(() => db.insert(works).values(makeWork("nonexistent-user-id")).run()).toThrow();
  });

  it("enforces unique constraint: two users with the same name throw", () => {
    const user = makeUser({ name: "alice" });
    db.insert(users).values(user).run();
    expect(() =>
      db
        .insert(users)
        .values({ ...makeUser(), name: "alice" })
        .run()
    ).toThrow();
  });

  it("cascade deletes works when user is deleted", () => {
    const user = makeUser();
    db.insert(users).values(user).run();
    const work = makeWork(user.id);
    db.insert(works).values(work).run();

    db.delete(users).run();

    const remaining = db.select().from(works).all();
    expect(remaining).toHaveLength(0);
  });

  it("cascade deletes generations when user is deleted", () => {
    const user = makeUser();
    db.insert(users).values(user).run();
    const work = makeWork(user.id);
    db.insert(works).values(work).run();
    db.insert(generations).values(makeGeneration(work.id, user.id)).run();

    db.delete(users).run();

    const remaining = db.select().from(generations).all();
    expect(remaining).toHaveLength(0);
  });

  it("cascade deletes generations when work is deleted", () => {
    const user = makeUser();
    db.insert(users).values(user).run();
    const work = makeWork(user.id);
    db.insert(works).values(work).run();
    db.insert(generations).values(makeGeneration(work.id, user.id)).run();

    db.delete(works).run();

    const remaining = db.select().from(generations).all();
    expect(remaining).toHaveLength(0);
  });

  it("FK enforcement is active: cascade delete actually removes rows", () => {
    const user = makeUser();
    db.insert(users).values(user).run();
    db.insert(works).values(makeWork(user.id)).run();

    const beforeDelete = db.select().from(works).all();
    expect(beforeDelete).toHaveLength(1);

    db.delete(users).run();

    const afterDelete = db.select().from(works).all();
    expect(afterDelete).toHaveLength(0);
  });
});
