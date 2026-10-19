import "server-only";
import type { getDb } from "@/db/client";
import type { ActivityInput } from "@/lib/activity";

export type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

// A change the server refuses, with a reason the person at the device can act on.
export class Rejected extends Error {}

export type Applied = {
  activity?: ActivityInput;
  // Runs after the transaction commits, e.g. telling parents.
  afterCommit?: () => Promise<void>;
} | null;
