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
  // Deprecated: per-painter fields (kept for backward compatibility; new flow uses timesheet_painters)
  startTime: text("start_time").notNull().default(""),
  endTime: text("end_time").notNull().default(""),
  lunchStart: text("lunch_start").notNull().default(""),
  lunchEnd: text("lunch_end").notNull().default(""),
  totalHours: text("total_hours").notNull().default("0"),
  notes: text("notes").default(""),
  changeOrder: text("change_order").default(""),
  synced: boolean("synced").default(false).notNull(),
  createdAt: text("created_at").default(sql`now()`),
  zohoTimeEntryId: varchar("zoho_time_entry_id"),
  totalCrewHours: text("total_crew_hours").default("0"),
  // Sundry Items (all Number type in Zoho)
  maskingPaperRoll: text("masking_paper_roll").default("0"),
  plasticRoll: text("plastic_roll").default("0"),
  puttySpackleTub: text("putty_spackle_tub").default("0"),
  caulkTube: text("caulk_tube").default("0"),
  whiteTapeRoll: text("white_tape_roll").default("0"),
  orangeTapeRoll: text("orange_tape_roll").default("0"),
  floorPaperRoll: text("floor_paper_roll").default("0"),
  tip: text("tip").default("0"),
  sandingSponge: text("sanding_sponge").default("0"),
  inchRollerCover18: text("inch_roller_cover_18").default("0"), // 18" Roller Cover
  inchRollerCover9: text("inch_roller_cover_9").default("0"),  // 9" Roller Cover
  miniCover: text("mini_cover").default("0"),
  masks: text("masks").default("0"),
  brickTapeRoll: text("brick_tape_roll").default("0"),
}, (table) => ({
  userIdIdx: index("user_id_idx").on(table.userId),
  dateIdx: index("date_idx").on(table.date),
  jobIdIdx: index("job_id_idx").on(table.jobId),
}));

export const painters = pgTable("painters", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
  createdAt: text("created_at").default(sql`now()`),
  updatedAt: text("updated_at").default(sql`now()`),
}, (table) => ({
  nameIdx: index("painters_name_idx").on(table.name),
  activeIdx: index("painters_active_idx").on(table.active),
}));

export const timesheetPainters = pgTable("timesheet_painters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timesheetId: varchar("timesheet_id").notNull(),
  painterId: varchar("painter_id").notNull(),
  painterName: text("painter_name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  lunchStart: text("lunch_start").notNull().default(""),
  lunchEnd: text("lunch_end").notNull().default(""),
  totalHours: text("total_hours").notNull(),
  zohoJunctionId: varchar("zoho_junction_id"),
  createdAt: text("created_at").default(sql`now()`),
}, (table) => ({
  timesheetIdx: index("tp_timesheet_id_idx").on(table.timesheetId),
  painterIdx: index("tp_painter_id_idx").on(table.painterId),
  uniquePainter: unique("tp_timesheet_painter_unique").on(table.timesheetId, table.painterId),
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
export type Painter = typeof painters.$inferSelect;
export type TimesheetPainter = typeof timesheetPainters.$inferSelect;
