import { sql } from "drizzle-orm";
import { pgTable, text, varchar, index, unique } from "drizzle-orm/pg-core";
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
  customer: text("customer").notNull(),
  status: text("status").notNull(),
  address: text("address").default(""),
  salesRep: text("sales_rep").default(""),
  supplierColor: text("supplier_color").default(""),
  trimColor: text("trim_color").default(""),
  accessoryColor: text("accessory_color").default(""),
  gutterType: text("gutter_type").default(""),
  sidingStyle: text("siding_style").default(""),
  workOrderLink: text("work_order_link").default(""),
  createdAt: text("created_at").default(sql`now()`),
  updatedAt: text("updated_at").default(sql`now()`),
}, (table) => ({
  statusIdx: index("projects_status_idx").on(table.status),
  customerIdx: index("projects_customer_idx").on(table.customer),
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
