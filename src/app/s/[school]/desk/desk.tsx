"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteDeskDb, deskDb } from "@/lib/offline/db";
import { BOOK_CONDITIONS, type BookCondition, type SyncCopy, type SyncLearner } from "@/lib/offline/protocol";
import { dismissRejected, issueBook, returnBook, syncNow, type SyncStatus } from "@/lib/offline/sync";

// The textbook desk works entirely from this device's copy of the data, so a
// queue of learners can be served with no connection at all. Changes are
// queued and sent when the connection comes back.

const AUTO_SYNC_MS = 60_000;

export function TextbookDesk({ schoolId, slug }: { schoolId: string; slug: string }) {
  const db = useMemo(() => deskDb(schoolId), [schoolId]);
  const [status, setStatus] = useState<SyncStatus>({ state: "idle", lastSyncedAt: null });
  const [mode, setMode] = useState<"issue" | "return">("issue");

  const sync = useCallback(async () => {
    setStatus({ state: "syncing" });
    setStatus(await syncNow(schoolId, slug));
  }, [schoolId, slug]);

  useEffect(() => {
    // Ask the service worker to keep this page (and its scripts) on the
    // device, so the desk opens next time even without a connection.
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

  const counts = useLiveQuery(async () => ({
    learners: await db.learners.count(),
    copies: await db.copies.count(),
    pending: await db.outbox.where("status").equals("pending").count(),
  }), [db]);
  const rejected = useLiveQuery(() => db.outbox.where("status").equals("rejected").toArray(), [db]) ?? [];

  // Push a freshly queued action soon, without waiting for the timer.
  const queued = useCallback(() => {
    if (navigator.onLine) setTimeout(() => void sync(), 1000);
  }, [sync]);

  const emptyDevice = counts && counts.learners === 0 && counts.copies === 0;

  return (
    <div className="space-y-4">
      <StatusBar status={status} pending={counts?.pending ?? 0} onSync={sync} />

      {emptyDevice && status.state !== "syncing" ? (
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

      <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5" role="tablist">
        {(["issue", "return"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded px-4 py-1.5 text-sm font-medium ${mode === m ? "bg-brand-600 text-white" : "text-slate-700"}`}
          >
            {m === "issue" ? "Issue books" : "Return books"}
          </button>
        ))}
      </div>

      {mode === "issue" ? (
        <IssuePanel schoolId={schoolId} onQueued={queued} />
      ) : (
        <ReturnPanel schoolId={schoolId} onQueued={queued} />
      )}

      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer">This device</summary>
        <p className="mt-2">
          {counts?.learners ?? 0} learners and {counts?.copies ?? 0} books saved for offline use.
        </p>
        <button
          className="btn-secondary mt-2"
          disabled={(counts?.pending ?? 0) > 0}
          onClick={async () => {
            if (!confirm("Remove this school's data from this device? You'll need a connection to use the desk again."))
              return;
            await deleteDeskDb(schoolId);
            navigator.serviceWorker?.controller?.postMessage("clear-shells");
            location.reload();
          }}
        >
          Remove school data from this device
        </button>
        {(counts?.pending ?? 0) > 0 ? <p className="mt-1 text-xs">Sync waiting changes first.</p> : null}
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

function learnerLabel(l: SyncLearner) {
  return `${l.preferredName || l.firstName} ${l.lastName}`;
}

function IssuePanel({ schoolId, onQueued }: { schoolId: string; onQueued: () => void }) {
  const db = useMemo(() => deskDb(schoolId), [schoolId]);
  const [query, setQuery] = useState("");
  const [learner, setLearner] = useState<SyncLearner | null>(null);

  const matches = useLiveQuery(async () => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const terms = q.split(/\s+/);
    return db.learners
      .filter((l) => terms.every((t) => l.search.includes(t)))
      .limit(12)
      .toArray();
  }, [db, query]);

  if (!learner) {
    return (
      <div className="card space-y-2 p-4">
        <label htmlFor="learner-search" className="label">
          Find learner
        </label>
        <input
          id="learner-search"
          className="input text-base"
          placeholder="Name or admission number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          autoComplete="off"
        />
        <ul className="divide-y divide-slate-100">
          {matches?.map((l) => (
            <li key={l.id}>
              <button
                className="w-full px-1 py-2 text-left hover:bg-slate-50"
                onClick={() => {
                  setLearner(l);
                  setQuery("");
                }}
              >
                <span className="font-medium">{learnerLabel(l)}</span>{" "}
                <span className="text-sm text-slate-500">
                  {[l.className, l.admissionNumber].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return <IssueToLearner schoolId={schoolId} learner={learner} onDone={() => setLearner(null)} onQueued={onQueued} />;
}

function IssueToLearner({
  schoolId,
  learner,
  onDone,
  onQueued,
}: {
  schoolId: string;
  learner: SyncLearner;
  onDone: () => void;
  onQueued: () => void;
}) {
  const db = useMemo(() => deskDb(schoolId), [schoolId]);
  const [number, setNumber] = useState("");
  const [condition, setCondition] = useState<BookCondition | "">("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const books = useLiveQuery(async () => {
    const loans = await db.loans.where("learnerId").equals(learner.id).toArray();
    const copies = await db.copies.bulkGet(loans.map((l) => l.copyId));
    return loans.map((loan, i) => ({ loan, copy: copies[i] }));
  }, [db, learner.id]);

  const found = useLiveQuery(
    async () => (number.trim() ? db.copies.where("key").equals(number.trim().toUpperCase()).first() : undefined),
    [db, number],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const copy = await db.copies.where("key").equals(number.trim().toUpperCase()).first();
    if (!copy) return setMessage({ tone: "error", text: `No book numbered "${number}". Check the number.` });
    if (copy.status === "issued") {
      const loan = await db.loans.where("copyId").equals(copy.id).first();
      const holder = loan ? await db.learners.get(loan.learnerId) : undefined;
      return setMessage({
        tone: "error",
        text: `#${copy.copyNumber} is already out with ${holder ? learnerLabel(holder) : "another learner"}. Return it first.`,
      });
    }
    if (copy.status !== "available") {
      return setMessage({ tone: "error", text: `#${copy.copyNumber} is marked ${copy.status.replace("_", " ")}.` });
    }
    await issueBook(schoolId, learner, copy, condition || copy.condition);
    setMessage({ tone: "ok", text: `Issued ${copy.title} #${copy.copyNumber}` });
    setNumber("");
    setCondition("");
    onQueued();
    inputRef.current?.focus();
  }

  return (
    <div className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{learnerLabel(learner)}</p>
          <p className="text-sm text-slate-500">{[learner.className, learner.admissionNumber].filter(Boolean).join(" · ")}</p>
        </div>
        <button className="btn-secondary" onClick={onDone}>
          Next learner
        </button>
      </div>

      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <div>
          <label htmlFor="copy-number" className="label">
            Book number
          </label>
          <input
            id="copy-number"
            ref={inputRef}
            className="input font-mono text-base"
            placeholder="Type or scan"
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
              setMessage(null);
            }}
            autoFocus
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="condition-out" className="label">
            Condition
          </label>
          <select
            id="condition-out"
            className="input"
            value={condition}
            onChange={(e) => setCondition(e.target.value as BookCondition | "")}
          >
            <option value="">{found ? `As recorded (${found.condition})` : "As recorded"}</option>
            {BOOK_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" disabled={!number.trim()}>
          Issue
        </button>
      </form>
      {found ? <p className="-mt-2 text-sm text-slate-600">{found.title}</p> : null}
      {message ? <Notice {...message} /> : null}

      <div>
        <p className="mb-1 text-sm font-medium">Books this learner has ({books?.length ?? 0})</p>
        <ul className="space-y-1 text-sm">
          {books?.map(({ loan, copy }) => (
            <li key={loan.id}>
              {copy?.title ?? "Unknown book"} <span className="font-mono text-slate-500">#{copy?.copyNumber}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ReturnPanel({ schoolId, onQueued }: { schoolId: string; onQueued: () => void }) {
  const db = useMemo(() => deskDb(schoolId), [schoolId]);
  const [number, setNumber] = useState("");
  const [copy, setCopy] = useState<SyncCopy | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const holder = useLiveQuery(async () => {
    if (!copy) return null;
    const loan = await db.loans.where("copyId").equals(copy.id).first();
    return loan ? { loan, learner: await db.learners.get(loan.learnerId) } : null;
  }, [db, copy]);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const found = await db.copies.where("key").equals(number.trim().toUpperCase()).first();
    if (!found) return setMessage({ tone: "error", text: `No book numbered "${number}".` });
    if (found.status !== "issued") {
      return setMessage({ tone: "error", text: `#${found.copyNumber} isn't out with anyone (${found.status.replace("_", " ")}).` });
    }
    setMessage(null);
    setCopy(found);
  }

  async function record(conditionIn: BookCondition, outcome: "returned" | "lost" | "damaged") {
    if (!copy) return;
    await returnBook(schoolId, copy, conditionIn, outcome);
    setMessage({
      tone: "ok",
      text: outcome === "lost" ? `#${copy.copyNumber} recorded as lost` : `Returned #${copy.copyNumber} (${conditionIn})`,
    });
    setCopy(null);
    setNumber("");
    onQueued();
    setTimeout(() => inputRef.current?.focus());
  }

  return (
    <div className="card space-y-4 p-4">
      <form onSubmit={lookup} className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="return-number" className="label">
            Book number
          </label>
          <input
            id="return-number"
            ref={inputRef}
            className="input font-mono text-base"
            placeholder="Type or scan"
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
              setCopy(null);
            }}
            autoFocus
            autoComplete="off"
          />
        </div>
        <button className="btn-secondary" disabled={!number.trim()}>
          Find
        </button>
      </form>
      {message ? <Notice {...message} /> : null}

      {copy ? (
        <div className="space-y-3 rounded-md border border-slate-200 p-3">
          <p>
            <span className="font-medium">{copy.title}</span>{" "}
            <span className="font-mono text-slate-500">#{copy.copyNumber}</span>
            <br />
            <span className="text-sm text-slate-600">
              Out with {holder?.learner ? learnerLabel(holder.learner) : "a learner"} · issued in{" "}
              {holder?.loan.conditionOut ?? copy.condition} condition
            </span>
          </p>
          <p className="text-sm font-medium">What condition is it in now?</p>
          <div className="flex flex-wrap gap-2">
            {BOOK_CONDITIONS.filter((c) => c !== "new").map((c) => (
              <button
                key={c}
                className={c === "damaged" ? "btn-danger" : "btn-secondary"}
                onClick={() => void record(c, c === "damaged" ? "damaged" : "returned")}
              >
                {c}
              </button>
            ))}
            <button className="btn-danger" onClick={() => void record(copy.condition, "lost")}>
              Lost
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Notice({ tone, text }: { tone: "ok" | "error"; text: string }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md px-3 py-2 text-sm ${tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
    >
      {text}
    </p>
  );
}
