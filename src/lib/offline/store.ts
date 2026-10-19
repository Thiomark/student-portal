"use client";

import Dexie, { type EntityTable } from "dexie";
import type { Mutation, SyncAttendance, SyncClass, SyncCopy, SyncLearner, SyncLoan, SyncRegister } from "./protocol";

export type OutboxItem = {
  mutation: Mutation;
  // Shown in the queue: "Maths Gr 8 #MATH8-014 → Thabo", "Register 8A".
  label: string;
  status: "pending" | "rejected";
  error?: string;
};

export type MetaRow = { key: string; value: string };

export type OfflineDb = Dexie & {
  learners: EntityTable<SyncLearner, "id">;
  classes: EntityTable<SyncClass, "id">;
  copies: EntityTable<SyncCopy, "id">;
  loans: EntityTable<SyncLoan, "id">;
  registers: EntityTable<SyncRegister, "id">;
  attendance: EntityTable<SyncAttendance, "key">;
  outbox: EntityTable<OutboxItem & { id: string }, "id">;
  meta: EntityTable<MetaRow, "key">;
};

const open = new Map<string, OfflineDb>();

function dbName(schoolId: string) {
  return `schoolos-${schoolId}`;
}

// One IndexedDB database per school, so a teacher at two schools never mixes
// their data on one laptop. Holds everything the offline pages (textbook
// desk, attendance register) work from.
export function offlineDb(schoolId: string): OfflineDb {
  let db = open.get(schoolId);
  if (!db) {
    db = new Dexie(dbName(schoolId)) as OfflineDb;
    db.version(1).stores({
      learners: "id, lastName, admissionNumber, classGroupId",
      classes: "id",
      copies: "id, &key, titleId, status",
      loans: "id, copyId, learnerId",
      registers: "id, &[classGroupId+date], date",
      attendance: "key, learnerId, date",
      outbox: "id, status",
      meta: "key",
    });
    open.set(schoolId, db);
  }
  return db;
}

export async function deleteOfflineDb(schoolId: string): Promise<void> {
  open.get(schoolId)?.close();
  open.delete(schoolId);
  await Dexie.delete(dbName(schoolId));
}

export function deviceId(): string {
  const key = "schoolos-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
