import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

// Ids are UUIDv7 minted by whoever creates the row (server or an offline
// device), so a record created offline keeps its id when it syncs.
export const id = () => uuid("id").primaryKey();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Sync cursors read updated_at, so every write must bump it (see db/sync).
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
};

// Synced tables soft-delete so devices learn about removals on their next pull.
export const deletedAt = () => timestamp("deleted_at", { withTimezone: true });
