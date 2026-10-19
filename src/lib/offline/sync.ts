"use client";

import { uuidv7 } from "@/lib/ids";
import { deskDb, deviceId, type DeskDb } from "./db";
import type { BookCondition, Mutation, PullResponse, PushResponse, SyncCopy, SyncLearner } from "./protocol";
import { MAX_PUSH } from "./protocol";

export type SyncStatus =
  | { state: "idle"; lastSyncedAt: string | null }
  | { state: "syncing" }
  | { state: "offline"; lastSyncedAt: string | null }
  | { state: "signed-out" }
  | { state: "error"; message: string; lastSyncedAt: string | null };

class SignedOut extends Error {}

// Push queued desk actions, then pull what changed. Safe to call often: only
// one run happens at a time per school.
const running = new Map<string, Promise<SyncStatus>>();

export function syncNow(schoolId: string, slug: string): Promise<SyncStatus> {
  let run = running.get(schoolId);
  if (!run) {
    run = doSync(deskDb(schoolId), slug).finally(() => running.delete(schoolId));
    running.set(schoolId, run);
  }
  return run;
}

async function doSync(db: DeskDb, slug: string): Promise<SyncStatus> {
  const lastSyncedAt = (await db.meta.get("lastSyncedAt"))?.value ?? null;
  if (!navigator.onLine) return { state: "offline", lastSyncedAt };
  try {
    const hadRejections = await pushOutbox(db, slug);
    // A rejected action means our optimistic local state is wrong somewhere;
    // start over from a full snapshot rather than guess what to undo.
    await pullChanges(db, slug, hadRejections);
    const now = new Date().toISOString();
    await db.meta.put({ key: "lastSyncedAt", value: now });
    return { state: "idle", lastSyncedAt: now };
  } catch (err) {
    if (err instanceof SignedOut) return { state: "signed-out" };
    if (err instanceof TypeError) return { state: "offline", lastSyncedAt };
    return { state: "error", message: err instanceof Error ? err.message : "Sync failed", lastSyncedAt };
  }
}

async function pushOutbox(db: DeskDb, slug: string): Promise<boolean> {
  let rejected = false;
  for (;;) {
    // Ids are UUIDv7, so id order is the order things happened at the desk.
    const batch = await db.outbox.where("status").equals("pending").sortBy("id");
    if (batch.length === 0) return rejected;
    const chunk = batch.slice(0, MAX_PUSH);
    const response = await fetch(`/api/s/${slug}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: deviceId(), mutations: chunk.map((i) => i.mutation) }),
    });
    await assertOk(response);
    const { results } = (await response.json()) as PushResponse;
    await db.transaction("rw", db.outbox, async () => {
      for (const r of results) {
        if (r.status === "rejected") {
          rejected = true;
          await db.outbox.update(r.id, { status: "rejected", error: r.error });
        } else {
          await db.outbox.delete(r.id);
        }
      }
    });
    if (chunk.length < MAX_PUSH) return rejected;
  }
}

async function pullChanges(db: DeskDb, slug: string, forceFull: boolean): Promise<void> {
  const cursor = forceFull ? null : ((await db.meta.get("cursor"))?.value ?? null);
  const response = await fetch(`/api/s/${slug}/sync${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
  await assertOk(response);
  const data = (await response.json()) as PullResponse;

  await db.transaction("rw", [db.learners, db.copies, db.loans, db.meta, db.outbox], async () => {
    if (data.full) {
      await Promise.all([db.learners.clear(), db.copies.clear(), db.loans.clear()]);
    }
    await db.learners.bulkPut(data.learners);
    await db.learners.bulkDelete(data.removedLearnerIds);
    await db.copies.bulkPut(data.copies);
    await db.copies.bulkDelete(data.removedCopyIds);
    await db.loans.bulkPut(data.loans);
    await db.loans.bulkDelete(data.closedLoanIds);
    // Re-apply actions still waiting to be pushed on top of server state, so a
    // pull never makes a just-issued book look available again.
    const pending = await db.outbox.where("status").equals("pending").sortBy("id");
    for (const item of pending) await applyLocally(db, item.mutation);
    await db.meta.put({ key: "cursor", value: data.cursor });
  });
}

async function assertOk(response: Response) {
  if (response.status === 401) throw new SignedOut();
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
}

// ── Desk actions: write locally first, queue for the server ─────────────────

export async function issueBook(
  schoolId: string,
  learner: SyncLearner,
  copy: SyncCopy,
  conditionOut: BookCondition,
): Promise<void> {
  const db = deskDb(schoolId);
  const mutation: Mutation = {
    id: uuidv7(),
    kind: "loan.issue",
    at: new Date().toISOString(),
    payload: { loanId: uuidv7(), copyId: copy.id, learnerId: learner.id, conditionOut },
  };
  await db.transaction("rw", [db.outbox, db.copies, db.loans], async () => {
    await db.outbox.add({
      id: mutation.id,
      mutation,
      label: `Issue ${copy.title} #${copy.copyNumber} → ${learner.preferredName || learner.firstName} ${learner.lastName}`,
      status: "pending",
    });
    await applyLocally(db, mutation);
  });
}

export async function returnBook(
  schoolId: string,
  copy: SyncCopy,
  conditionIn: BookCondition,
  outcome: "returned" | "lost" | "damaged",
): Promise<void> {
  const db = deskDb(schoolId);
  const mutation: Mutation = {
    id: uuidv7(),
    kind: "loan.return",
    at: new Date().toISOString(),
    payload: { copyId: copy.id, conditionIn, outcome },
  };
  await db.transaction("rw", [db.outbox, db.copies, db.loans], async () => {
    await db.outbox.add({
      id: mutation.id,
      mutation,
      label: `${outcome === "lost" ? "Lost" : "Return"} ${copy.title} #${copy.copyNumber}`,
      status: "pending",
    });
    await applyLocally(db, mutation);
  });
}

async function applyLocally(db: DeskDb, m: Mutation): Promise<void> {
  if (m.kind === "loan.issue") {
    await db.loans.where("copyId").equals(m.payload.copyId).delete();
    await db.loans.put({
      id: m.payload.loanId,
      copyId: m.payload.copyId,
      learnerId: m.payload.learnerId,
      issuedAt: m.at,
      conditionOut: m.payload.conditionOut,
    });
    await db.copies.update(m.payload.copyId, { status: "issued", condition: m.payload.conditionOut });
  } else {
    await db.loans.where("copyId").equals(m.payload.copyId).delete();
    await db.copies.update(
      m.payload.copyId,
      m.payload.outcome === "lost" ? { status: "lost" } : { status: "available", condition: m.payload.conditionIn },
    );
  }
}

export async function dismissRejected(schoolId: string, id: string): Promise<void> {
  await deskDb(schoolId).outbox.delete(id);
}
