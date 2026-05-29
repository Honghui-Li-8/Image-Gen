import bcrypt from "bcrypt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { users } from "./db/schema.js";

// mock db so seed uses our in-memory instance
vi.mock("./db/index.js", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("./db/schema.js");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return { db };
});

const { seed } = await import("./seed.js");
const { db } = await import("./db/index.js");

function withEnv(vars: Record<string, string>, fn: () => Promise<void>) {
  return async () => {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(vars)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

function clearSeedEnv() {
  for (let n = 1; n <= 10; n++) {
    delete process.env[`SEED_USER_${n}_NAME`];
    delete process.env[`SEED_USER_${n}_PASSWORD`];
  }
}

beforeEach(async () => {
  clearSeedEnv();
  await db.delete(users);
});

afterEach(async () => {
  clearSeedEnv();
  await db.delete(users);
});

describe("seed()", () => {
  it(
    "inserts users from env vars with bcrypt-hashed passwords",
    withEnv(
      {
        SEED_USER_1_NAME: "alice",
        SEED_USER_1_PASSWORD: "pw1",
        SEED_USER_2_NAME: "bob",
        SEED_USER_2_PASSWORD: "pw2",
      },
      async () => {
        await seed();
        const rows = await db.select().from(users);
        expect(rows).toHaveLength(2);
        const names = rows.map((r) => r.name).sort();
        expect(names).toEqual(["alice", "bob"]);
      }
    )
  );

  it(
    "stores bcrypt hashes, not plaintext passwords",
    withEnv({ SEED_USER_1_NAME: "alice", SEED_USER_1_PASSWORD: "secret" }, async () => {
      await seed();
      const [row] = await db.select().from(users);
      expect(row.passwordHash).not.toBe("secret");
      expect(await bcrypt.compare("secret", row.passwordHash)).toBe(true);
    })
  );

  it(
    "is idempotent: running twice does not duplicate users",
    withEnv({ SEED_USER_1_NAME: "alice", SEED_USER_1_PASSWORD: "pw" }, async () => {
      await seed();
      await seed();
      const rows = await db.select().from(users);
      expect(rows).toHaveLength(1);
    })
  );

  it(
    "does not overwrite lastLoginAt or createdAt on re-seed",
    withEnv({ SEED_USER_1_NAME: "alice", SEED_USER_1_PASSWORD: "pw" }, async () => {
      await seed();
      const [before] = await db.select().from(users);
      await new Promise((r) => setTimeout(r, 20));
      await seed();
      const [after] = await db.select().from(users);
      expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
      expect(after.lastLoginAt.getTime()).toBe(before.lastLoginAt.getTime());
    })
  );

  it("throws when no SEED_USER_1_NAME is set", async () => {
    await expect(seed()).rejects.toThrow(/No seed users found/);
  });

  it(
    "throws when a pair is incomplete (name without password)",
    withEnv({ SEED_USER_1_NAME: "alice" }, async () => {
      await expect(seed()).rejects.toThrow(/Incomplete seed user pair/);
    })
  );
});
