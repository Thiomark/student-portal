"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { deleteOfflineDb, offlineDb, type OfflineDb } from "@/lib/offline/store";
import { dismissRejected, syncNow, type SyncStatus } from "@/lib/offline/sync";

// Shared frame for pages that work offline (textbook desk, attendance):
// keeps the device in sync, shows connection state and changes waiting to be
// sent, lists changes the server refused, and lets a shared laptop be cleared.

const AUTO_SYNC_MS = 60_000;

export function OfflineShell({
  schoolId,
  slug,
  children,
}: {
  schoolId: string;
  slug: string;
  // Gets the device database and a callback to call after queuing a change.
  children: (db: OfflineDb, queued: () => void) => ReactNode;
}) {
  const db = useMemo(() => offlineDb(schoolId), [schoolId]);
  const [status, setStatus] = useState<SyncStatus>({ state: "idle", lastSyncedAt: null });

  const sync = useCallback(async () => {
    setStatus({ state: "syncing" });
    setStatus(await syncNow(schoolId, slug));
  }, [schoolId, slug]);

  useEffect(() => {
    // Ask the service worker to keep this page (and its scripts) on the
    // device, so it opens next time even without a connection.
    navigator.serviceWorker?.controller?.postMessage({ type: "cache-page", url: location.pathname });
    const first = setTimeout(() => void sync(), 0);
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => {
      if (navigator.onLine) void sync();
    }, AUTO_SYNC_MS);
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [sync]);

  const counts = useLiveQuery(
    async () => ({
      learners: await db.learners.count(),
      copies: await db.copies.count(),
      pending: await db.outbox.where("status").equals("pending").count(),
    }),
    [db],
  );
  const rejected = useLiveQuery(() => db.outbox.where("status").equals("rejected").toArray(), [db]) ?? [];

  // Push a freshly queued change soon, without waiting for the timer.
  const queued = useCallback(() => {
    if (navigator.onLine) setTimeout(() => void sync(), 1000);
  }, [sync]);

  const pending = counts?.pending ?? 0;

  return (
    <div className="space-y-4">
      <StatusBar status={status} pending={pending} onSync={sync} />

      {counts && counts.learners === 0 && status.state !== "syncing" ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This device has no school data yet. Connect to the internet once and press <strong>Sync now</strong>.
        </p>
      ) : null}

      {rejected.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-medium text-red-900">These couldn&apos;t be saved and need checking:</p>
          <ul className="mt-2 space-y-1">
            {rejected.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {r.label} — <span className="text-red-800">{r.error}</span>
                </span>
                <button className="text-xs underline" onClick={() => void dismissRejected(schoolId, r.id)}>
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {children(db, queued)}

      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer">This device</summary>
        <p className="mt-2">
          {counts?.learners ?? 0} learners and {counts?.copies ?? 0} books saved for offline use.
        </p>
        <button
          className="btn-secondary mt-2"
          disabled={pending > 0}
          onClick={async () => {
            if (!confirm("Remove this school's data from this device? You'll need a connection to use it again."))
              return;
            await deleteOfflineDb(schoolId);
            navigator.serviceWorker?.controller?.postMessage("clear-shells");
            location.reload();
          }}
        >
          Remove school data from this device
        </button>
        {pending > 0 ? <p className="mt-1 text-xs">Sync waiting changes first.</p> : null}
      </details>
    </div>
  );
}

function StatusBar({ status, pending, onSync }: { status: SyncStatus; pending: number; onSync: () => void }) {
  const last = "lastSyncedAt" in status && status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleTimeString() : null;
  const text =
    status.state === "syncing"
      ? "Syncing…"
      : status.state === "offline"
        ? "Offline — working from this device"
        : status.state === "signed-out"
          ? "Signed out — sign in again to send changes"
          : status.state === "error"
            ? `Sync problem: ${status.message}`
            : "Online";
  const tone =
    status.state === "idle" ? "bg-green-500" : status.state === "syncing" ? "bg-brand-600" : "bg-amber-500";
  return (
    <div className="card flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${tone}`} aria-hidden />
        {text}
        {last ? <span className="text-slate-500">· last synced {last}</span> : null}
      </span>
      <span className="flex items-center gap-3">
        {pending > 0 ? <span className="badge bg-amber-100 text-amber-800">{pending} waiting to send</span> : null}
        <button className="btn-secondary py-1" onClick={onSync} disabled={status.state === "syncing"}>
          Sync now
        </button>
      </span>
    </div>
  );
}
