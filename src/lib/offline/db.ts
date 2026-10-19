"use client";

import Dexie, { type EntityTable } from "dexie";
import type { Mutation, SyncCopy, SyncLearner, SyncLoan } from "./protocol";

export type OutboxItem = {
  mutation: Mutation;
  // Shown in the queue: "Maths Gr 8 #MATH8-014 → Thabo".
  label: string;
  status: "pending" | "rejected";
  error?: string;
};

export type MetaRow = { key: string; value: string };

export type DeskDb = Dexie & {
  learners: EntityTable<SyncLearner, "id">;
  copies: EntityTable<SyncCopy, "id">;
  loans: EntityTable<SyncLoan, "id">;
  outbox: EntityTable<OutboxItem & { id: string }, "id">;
  meta: EntityTable<MetaRow, "key">;
};

const open = new Map<string, DeskDb>();

// One IndexedDB database per school, so a teacher at two schools never mixes
// their data on one laptop.
export function deskDb(schoolId: string): DeskDb {
  let db = open.get(schoolId);
  if (!db) {
    db = new Dexie(`schoolos-desk-${schoolId}`) as DeskDb;
    db.version(1).stores({
      learners: "id, lastName, admissionNumber",
      copies: "id, &key, titleId, status",
      loans: "id, copyId, learnerId",
      outbox: "id, status",
      meta: "key",
    });
    open.set(schoolId, db);
  }
  return db;
}

export async function deleteDeskDb(schoolId: string): Promise<void> {
  open.get(schoolId)?.close();
  open.delete(schoolId);
  await Dexie.delete(`schoolos-desk-${schoolId}`);
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
