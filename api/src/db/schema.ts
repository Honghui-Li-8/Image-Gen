import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type User = typeof users.$inferSelect;

export const works = sqliteTable(
  "works",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    config: text("config", { mode: "json" }).notNull(),
    // no .references() — circular FK (works → generations → works) deadlocks on insert
    activeGenerationId: text("active_generation_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("works_user_id_idx").on(table.userId)]
);

export type Work = typeof works.$inferSelect;

export const generationStatusEnum = [
  "queued",
  "running",
  "completed",
  "failed",
] as const;
export type GenerationStatus = (typeof generationStatusEnum)[number];

export const generations = sqliteTable(
  "generations",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    // denormalized from work.userId to avoid a join on every SSE auth check
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status", { enum: generationStatusEnum }).notNull(),
    promptId: text("prompt_id"),
    config: text("config", { mode: "json" }).notNull(),
    workflowSnapshot: text("workflow_snapshot", { mode: "json" }).notNull(),
    imageUrl: text("image_url"),
    error: text("error"),
    scheduledAt: integer("scheduled_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => [index("generations_work_id_idx").on(table.workId)]
);

export type Generation = typeof generations.$inferSelect;
