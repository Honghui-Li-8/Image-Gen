import bcrypt from "bcrypt";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { users } from "./db/schema.js";

export async function seed() {
  const presetUsers: Array<{ name: string; password: string }> = [];

  for (let n = 1; ; n++) {
    const name = process.env[`SEED_USER_${n}_NAME`];
    const password = process.env[`SEED_USER_${n}_PASSWORD`];
    if (!name && !password) break;
    if (!name || !password) {
      throw new Error(
        `Incomplete seed user pair at SEED_USER_${n}_*: both NAME and PASSWORD are required`
      );
    }
    presetUsers.push({ name, password });
  }

  if (presetUsers.length === 0) {
    throw new Error(
      "No seed users found. Set SEED_USER_1_NAME and SEED_USER_1_PASSWORD in your .env file."
    );
  }

  const now = new Date();

  for (const { name, password } of presetUsers) {
    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await db.select().from(users).where(eq(users.name, name));

    if (existing.length > 0) {
      // update password hash only — preserve lastLoginAt and createdAt
      await db.update(users).set({ passwordHash }).where(eq(users.name, name));
    } else {
      await db.insert(users).values({
        id: createId(),
        name,
        passwordHash,
        lastLoginAt: now,
        createdAt: now,
      });
    }
  }
}
