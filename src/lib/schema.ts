import { sql } from "drizzle-orm";
import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: text("job_id").notNull(),
  jobName: text("job_name").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  lunchStart: text("lunch_start").notNull(),
  lunchEnd: text("lunch_end").notNull(),
  totalHours: text("total_hours").notNull(),
  notes: text("notes").default(""),
  changeOrder: text("change_order").default(""),
  createdAt: text("created_at").default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTimeEntrySchema = createInsertSchema(timeEntries).extend({
  synced: z.boolean().optional().default(false),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type User = typeof users.$inferSelect;

