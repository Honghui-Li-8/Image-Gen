import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { createId } from "@paralleldrive/cuid2";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { tokenStore } from "../db/token-store.js";

export const authRouter = Router();

authRouter.post("/auth/login", async (req, res) => {
  const { name, password } = req.body as { name?: string; password?: string };

  if (!name || !password) {
    res.status(400).json({ error: "name and password are required" });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.name, name));

  const valid = user !== undefined && (await bcrypt.compare(password, user.passwordHash));

  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = createId();
  tokenStore.set(token, { token, userId: user.id, createdAt: new Date() });

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  res.json({ token, userId: user.id, name: user.name });
});
