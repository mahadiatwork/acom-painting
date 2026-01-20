import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  zohoId: varchar("zoho_id"),
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  zohoIdIdx: index("users_zoho_id_idx").on(table.zohoId),
}));

export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
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
  synced: boolean("synced").default(false).notNull(),
  createdAt: text("created_at").default(sql`now()`),
}, (table) => ({
  userIdIdx: index("user_id_idx").on(table.userId),
  dateIdx: index("date_idx").on(table.date),
  jobIdIdx: index("job_id_idx").on(table.jobId),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTimeEntrySchema = createInsertSchema(timeEntries).extend({
  synced: z.boolean().optional().default(false),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey(), // Zoho Deal ID
  name: text("name").notNull(),
  status: text("status").notNull().default("Project Accepted"),
  date: text("date").default(""), // Project date (Closing_Date or Project_Start_Date from Zoho)
  address: text("address").default(""),
  createdAt: text("created_at").default(sql`now()`),
  updatedAt: text("updated_at").default(sql`now()`),
}, (table) => ({
  statusIdx: index("projects_status_idx").on(table.status),
  nameIdx: index("projects_name_idx").on(table.name),
}));

export const userProjects = pgTable("user_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userEmail: text("user_email").notNull(),
  projectId: varchar("project_id").notNull(),
  createdAt: text("created_at").default(sql`now()`),
}, (table) => ({
  userEmailIdx: index("user_projects_user_email_idx").on(table.userEmail),
  projectIdIdx: index("user_projects_project_id_idx").on(table.projectId),
  userProjectUnique: unique("user_projects_user_email_project_id_unique").on(table.userEmail, table.projectId),
}));

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type UserProject = typeof userProjects.$inferSelect;
