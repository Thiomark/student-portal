import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_columns";

// A school is the tenant. Every school-owned row carries school_id and every
// query filters on it; there is no cross-school read path.
export const schools = pgTable("schools", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // Department of Education number (EMIS in South Africa); optional elsewhere.
  registrationNumber: text("registration_number"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  timezone: text("timezone").notNull().default("Africa/Johannesburg"),
  currency: text("currency").notNull().default("ZAR"),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  ...timestamps,
});

// Provider secrets per school, AES-256-GCM encrypted (lib/crypto). A Whaple key
// is bound to one WhatsApp number, so each school brings its own.
export const schoolSecrets = pgTable("school_secrets", {
  schoolId: uuid("school_id")
    .primaryKey()
    .references(() => schools.id, { onDelete: "cascade" }),
  whapleApiKey: text("whaple_api_key"),
  resendApiKey: text("resend_api_key"),
  resendFromEmail: text("resend_from_email"),
  ...timestamps,
});

// One row per Clerk identity, created lazily on first sign-in. Clerk proves who
// someone is; memberships and guardian links decide what they can see.
export const users = pgTable("users", {
  id: id(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  // Only stored when Clerk marks them verified; used to claim invites and
  // guardian records.
  email: text("email"),
  phone: text("phone"),
  name: text("name"),
  imageUrl: text("image_url"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  ...timestamps,
});

// Platform operators can create schools and seat their first owner. They get
// no read access to school data from this alone.
export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamps.createdAt,
});

export const membershipRole = pgEnum("membership_role", ["owner", "admin", "staff"]);

export type PermissionAdjustments = {
  preset?: string;
  grant?: string[];
  revoke?: string[];
};

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    permissions: jsonb("permissions").$type<PermissionAdjustments>().notNull().default({}),
    // Links the login to the staff record (teacher, clerk, ...) when there is one.
    staffId: uuid("staff_id"),
    status: text("status", { enum: ["active", "revoked"] }).notNull().default("active"),
    grantedBy: uuid("granted_by"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("memberships_user_school_uq").on(t.userId, t.schoolId)],
);

// Accepted by signing in with the invited email once Clerk has verified it;
// there is no token to forward or leak.
export const invites = pgTable(
  "invites",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: membershipRole("role").notNull(),
    permissions: jsonb("permissions").$type<PermissionAdjustments>().notNull().default({}),
    staffId: uuid("staff_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    invitedBy: uuid("invited_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invites_open_email_uq")
      .on(t.schoolId, sql`lower(${t.email})`)
      .where(sql`${t.acceptedAt} is null`),
  ],
);

// Who changed what. No foreign keys so the trail outlives the rows it
// describes. Never store contact details or secret values in subject/changes.
export const activityEvents = pgTable(
  "activity_events",
  {
    id: id(),
    schoolId: uuid("school_id").notNull(),
    actorUserId: uuid("actor_user_id"),
    actorName: text("actor_name"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    area: text("area").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    subject: text("subject"),
    changes: jsonb("changes").$type<{ field: string; before: unknown; after: unknown }[]>(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    deviceId: text("device_id"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("activity_school_created_idx").on(t.schoolId, t.createdAt),
    index("activity_entity_idx").on(t.schoolId, t.entityType, t.entityId, t.createdAt),
    index("activity_area_idx").on(t.schoolId, t.area, t.createdAt),
  ],
);
