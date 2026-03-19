import { relations, sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, index, unique, uuid, integer, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  zohoId: varchar("zoho_id"),
  name: text("name"),
  phone: text("phone"),
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  zohoIdIdx: index("users_zoho_id_idx").on(table.zohoId),
}));

/** Foremen synced from Zoho CRM Portal_Users. Used for "Select Foreman" and time entry ownership. */
export const foremen = pgTable("foremen", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  zohoId: varchar("zoho_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  createdAt: text("created_at").default(sql`now()`),
  updatedAt: text("updated_at").default(sql`now()`),
}, (table) => ({
  zohoIdIdx: index("foremen_zoho_id_idx").on(table.zohoId),
  emailIdx: index("foremen_email_idx").on(table.email),
}));

export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** Foreman who owns this timesheet (foremen.id). Prefer over userId. */
  foremanId: text("foreman_id"),
  /** @deprecated Use foremanId. Kept for backward compatibility. */
  userId: text("user_id"),
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
  painterAddress: text("painter_address").notNull().default(""),
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
  // Extra Work / T&M (tracked separately from base crew hours)
  extraHours: text("extra_hours").notNull().default("0"),
  extraWorkDescription: text("extra_work_description").default(""),
}, (table) => ({
  foremanIdIdx: index("time_entries_foreman_id_idx").on(table.foremanId),
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

export const workEntries = pgTable("work_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryType: text("entry_type").notNull().default("main"),
  parentEntryId: uuid("parent_entry_id"),
  foremanId: text("foreman_id").notNull(),
  jobId: text("job_id").notNull(),
  jobName: text("job_name").notNull(),
  entryDate: date("entry_date").notNull(),
  notes: text("notes").notNull().default(""),
  changeOrder: text("change_order").notNull().default(""),
  painterAddress: text("painter_address").notNull().default(""),
  status: text("status").notNull().default("draft"),
  tmSequence: integer("tm_sequence"),
  displayLabel: text("display_label"),
  totalCrewHours: numeric("total_crew_hours", { precision: 10, scale: 2 }).notNull().default("0"),
  tmCount: integer("tm_count").notNull().default(0),
  tmTotalHours: numeric("tm_total_hours", { precision: 10, scale: 2 }).notNull().default("0"),
  tmTotalLaborCost: numeric("tm_total_labor_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  grandTotalHours: numeric("grand_total_hours", { precision: 10, scale: 2 }).notNull().default("0"),
  tmSummaryText: text("tm_summary_text").notNull().default(""),
  zohoRecordId: text("zoho_record_id"),
  syncState: text("sync_state").notNull().default("pending"),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  foremanDateIdx: index("work_entries_foreman_date_idx").on(table.foremanId, table.entryDate),
  parentIdx: index("work_entries_parent_idx").on(table.parentEntryId),
  jobIdx: index("work_entries_job_idx").on(table.jobId),
  syncStateIdx: index("work_entries_sync_state_idx").on(table.syncState),
  entryTypeIdx: index("work_entries_entry_type_idx").on(table.entryType),
  tmSequenceUnique: unique("work_entries_tm_sequence_unique").on(table.parentEntryId, table.tmSequence),
}));

export const workEntryCrewRows = pgTable("work_entry_crew_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  workEntryId: uuid("work_entry_id").notNull(),
  painterId: varchar("painter_id").notNull(),
  painterName: text("painter_name").notNull(),
  startTime: text("start_time").notNull().default(""),
  endTime: text("end_time").notNull().default(""),
  lunchStart: text("lunch_start").notNull().default(""),
  lunchEnd: text("lunch_end").notNull().default(""),
  totalHours: numeric("total_hours", { precision: 10, scale: 2 }).notNull().default("0"),
  payRateType: text("pay_rate_type"),
  laborCost: numeric("labor_cost", { precision: 12, scale: 2 }),
  zohoRecordId: text("zoho_record_id"),
  syncState: text("sync_state").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workEntryIdx: index("work_entry_crew_rows_entry_idx").on(table.workEntryId),
  painterIdx: index("work_entry_crew_rows_painter_idx").on(table.painterId),
  syncStateIdx: index("work_entry_crew_rows_sync_state_idx").on(table.syncState),
}));

export const workEntrySundryRows = pgTable("work_entry_sundry_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  workEntryId: uuid("work_entry_id").notNull(),
  sundryName: text("sundry_name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("0"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }),
  zohoRecordId: text("zoho_record_id"),
  syncState: text("sync_state").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workEntryIdx: index("work_entry_sundry_rows_entry_idx").on(table.workEntryId),
  syncStateIdx: index("work_entry_sundry_rows_sync_state_idx").on(table.syncState),
}));

export const workEntryWorkRows = pgTable("work_entry_work_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  workEntryId: uuid("work_entry_id").notNull(),
  area: text("area").notNull(),
  groupCode: text("group_code").notNull(),
  groupLabel: text("group_label").notNull(),
  taskCode: text("task_code").notNull(),
  taskLabel: text("task_label").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("0"),
  laborHours: numeric("labor_hours", { precision: 12, scale: 2 }).notNull().default("0"),
  paintGallons: numeric("paint_gallons", { precision: 12, scale: 2 }).notNull().default("0"),
  primerGallons: numeric("primer_gallons", { precision: 12, scale: 2 }).notNull().default("0"),
  primerSource: text("primer_source").notNull().default("stock"),
  count: integer("count"),
  linearFeet: numeric("linear_feet", { precision: 12, scale: 2 }),
  stairFloors: integer("stair_floors"),
  doorCount: integer("door_count"),
  windowCount: integer("window_count"),
  handrailCount: integer("handrail_count"),
  sortOrder: integer("sort_order").notNull().default(0),
  zohoRecordId: text("zoho_record_id"),
  syncState: text("sync_state").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workEntryIdx: index("work_entry_work_rows_entry_idx").on(table.workEntryId),
  taskIdx: index("work_entry_work_rows_task_idx").on(table.taskCode),
  syncStateIdx: index("work_entry_work_rows_sync_state_idx").on(table.syncState),
}));

export const workEntriesRelations = relations(workEntries, ({ one, many }) => ({
  parent: one(workEntries, {
    fields: [workEntries.parentEntryId],
    references: [workEntries.id],
    relationName: "work_entries_parent",
  }),
  children: many(workEntries, { relationName: "work_entries_parent" }),
  crewRows: many(workEntryCrewRows),
  sundryRows: many(workEntrySundryRows),
  workRows: many(workEntryWorkRows),
}));

export const workEntryCrewRowsRelations = relations(workEntryCrewRows, ({ one }) => ({
  workEntry: one(workEntries, {
    fields: [workEntryCrewRows.workEntryId],
    references: [workEntries.id],
  }),
}));

export const workEntrySundryRowsRelations = relations(workEntrySundryRows, ({ one }) => ({
  workEntry: one(workEntries, {
    fields: [workEntrySundryRows.workEntryId],
    references: [workEntries.id],
  }),
}));

export const workEntryWorkRowsRelations = relations(workEntryWorkRows, ({ one }) => ({
  workEntry: one(workEntries, {
    fields: [workEntryWorkRows.workEntryId],
    references: [workEntries.id],
  }),
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
export type Foreman = typeof foremen.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type UserProject = typeof userProjects.$inferSelect;
export type Painter = typeof painters.$inferSelect;
export type TimesheetPainter = typeof timesheetPainters.$inferSelect;
export type WorkEntry = typeof workEntries.$inferSelect;
export type WorkEntryCrewRow = typeof workEntryCrewRows.$inferSelect;
export type WorkEntrySundryRow = typeof workEntrySundryRows.$inferSelect;
export type WorkEntryWorkRow = typeof workEntryWorkRows.$inferSelect;
