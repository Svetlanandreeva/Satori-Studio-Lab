import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const contacts = sqliteTable("contacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  source: text("source").notNull().default("otro"),
  temperature: text("temperature").notNull().default("cold"),
  qualification: text("qualification").notNull().default("new"),
  score: integer("score").notNull().default(0),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const teamMembers = sqliteTable("team_members", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  login: text("login").unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("manager"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const pipelineStages = sqliteTable("pipeline_stages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  color: text("color").notNull().default("#64748b"),
  isWon: integer("is_won", { mode: "boolean" }).notNull().default(false),
  isLost: integer("is_lost", { mode: "boolean" }).notNull().default(false),
});

export const deals = sqliteTable("deals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  value: integer("value").notNull().default(0),
  stageId: text("stage_id")
    .notNull()
    .references(() => pipelineStages.id),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id),
  ownerId: text("owner_id").references(() => teamMembers.id),
  lossReason: text("loss_reason"),
  expectedClose: integer("expected_close", { mode: "timestamp" }),
  probability: integer("probability").notNull().default(0),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dealStageHistory = sqliteTable("deal_stage_history", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dealId: text("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  fromStageId: text("from_stage_id").references(() => pipelineStages.id),
  toStageId: text("to_stage_id")
    .notNull()
    .references(() => pipelineStages.id),
  reason: text("reason"),
  changedBy: text("changed_by").references(() => teamMembers.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dealEconomics = sqliteTable("deal_economics", {
  dealId: text("deal_id")
    .primaryKey()
    .references(() => deals.id, { onDelete: "cascade" }),
  receivedAmount: integer("received_amount").notNull().default(0),
  productionCost: integer("production_cost").notNull().default(0),
  paymentCommission: integer("payment_commission").notNull().default(0),
  deliveryCost: integer("delivery_cost").notNull().default(0),
  packagingCost: integer("packaging_cost").notNull().default(0),
  contractorCost: integer("contractor_cost").notNull().default(0),
  taxCost: integer("tax_cost").notNull().default(0),
  otherCost: integer("other_cost").notNull().default(0),
  notes: text("notes"),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const businessExpenses = sqliteTable("business_expenses", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  month: text("month").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  amount: integer("amount").notNull().default(0),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const activities = sqliteTable("activities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(),
  description: text("description").notNull(),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id),
  dealId: text("deal_id").references(() => deals.id),
  ownerId: text("owner_id").references(() => teamMembers.id),
  priority: text("priority").notNull().default("normal"),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messageTemplates = sqliteTable("message_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  channel: text("channel").notNull().default("all"),
  body: text("body").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const projectChecklist = sqliteTable("project_checklist", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dealId: text("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  title: text("title").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  actorId: text("actor_id"),
  actorName: text("actor_name"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  details: text("details"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const crmSettings = sqliteTable("crm_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const emailThreads = sqliteTable("email_threads", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  threadKey: text("thread_key").notNull().unique(),
  subject: text("subject").notNull().default("Без темы"),
  remoteEmail: text("remote_email").notNull(),
  remoteName: text("remote_name"),
  contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  isService: integer("is_service", { mode: "boolean" }).notNull().default(false),
  unreadCount: integer("unread_count").notNull().default(0),
  lastMessageAt: integer("last_message_at", { mode: "timestamp" }).notNull(),
  lastSnippet: text("last_snippet"),
  lastDirection: text("last_direction").notNull().default("incoming"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const emailMessages = sqliteTable("email_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  threadId: text("thread_id")
    .notNull()
    .references(() => emailThreads.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull().unique(),
  inReplyTo: text("in_reply_to"),
  references: text("references"),
  direction: text("direction").notNull(),
  folder: text("folder"),
  remoteUid: integer("remote_uid"),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull().default("Без темы"),
  bodyText: text("body_text").notNull().default(""),
  isService: integer("is_service", { mode: "boolean" }).notNull().default(false),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  receivedAt: integer("received_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
