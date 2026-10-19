import { uuid } from "drizzle-orm/pg-core";
import { schools } from "./tenancy";

// Tenant column for school-owned tables.
export const schoolRef = () =>
  uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "restrict" });
