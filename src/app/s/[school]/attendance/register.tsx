"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { OfflineShell } from "@/components/offline-shell";
import { schoolToday } from "@/lib/format";
import { ATTENDANCE_STATUSES, type AttendanceStatus, type SyncClass } from "@/lib/offline/protocol";
import type { OfflineDb } from "@/lib/offline/store";
import { submitRegister } from "@/lib/offline/sync";

const LABELS: Record<AttendanceStatus, { short: string; long: string; on: string }> = {
  present: { short: "P", long: "Present", on: "bg-green-600 text-white" },
  absent: { short: "A", long: "Absent", on: "bg-red-600 text-white" },
  late: { short: "L", long: "Late", on: "bg-amber-500 text-white" },
  excused: { short: "E", long: "Excused", on: "bg-slate-600 text-white" },
};

const LAST_CLASS_KEY = "schoolos-register-class";

export function Register(props: { schoolId: string; slug: string; timeZone: string; myStaffId: string | null }) {
  return (
    <OfflineShell schoolId={props.schoolId} slug={props.slug}>
      {(db, queued) => <RegisterForm {...props} db={db} onQueued={queued} />}
    </OfflineShell>
  );
}

type Mark = { status: AttendanceStatus; reason: string };

function RegisterForm({
  schoolId,
  timeZone,
  myStaffId,
  db,
  onQueued,
}: {
  schoolId: string;
  timeZone: string;
  myStaffId: string | null;
  db: OfflineDb;
  onQueued: () => void;
}) {
  const today = schoolToday(timeZone);
  const classes = useLiveQuery(() => db.classes.toArray(), [db]);
  const [chosenClassId, setChosenClassId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_CLASS_KEY);
    } catch {
      return null;
    }
  });
  const [date, setDate] = useState(today);

  // Default to the class you chose last time, then the class you teach.
  const klass: SyncClass | undefined = useMemo(() => {
    if (!classes?.length) return undefined;
    const sorted = [...classes].sort((a, b) => a.gradeSort - b.gradeSort || a.name.localeCompare(b.name));
    return (
      sorted.find((c) => c.id === chosenClassId) ??
      sorted.find((c) => myStaffId && c.teacherStaffId === myStaffId) ??
      sorted[0]
    );
  }, [classes, chosenClassId, myStaffId]);

  if (classes === undefined) return null;
  if (!klass) {
    return <p className="text-sm text-slate-600">No classes on this device yet. Sync once while online.</p>;
  }

  return (
    <div className="card space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="register-class" className="label">
            Class
          </label>
          <select
            id="register-class"
            className="input w-auto"
            value={klass.id}
            onChange={(e) => {
              setChosenClassId(e.target.value);
              try {
                localStorage.setItem(LAST_CLASS_KEY, e.target.value);
              } catch {}
            }}
          >
            {[...classes]
              .sort((a, b) => a.gradeSort - b.gradeSort || a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.gradeName})
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="register-date" className="label">
            Date
          </label>
          <input
            id="register-date"
            type="date"
            className="input w-auto"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value || today)}
          />
        </div>
      </div>
      {/* Remount per class and day so marks start from what's saved for it. */}
      <Marks
        key={`${klass.id}:${date}`}
        db={db}
        schoolId={schoolId}
        klass={klass}
        date={date}
        isToday={date === today}
        onQueued={onQueued}
      />
    </div>
  );
}

function Marks({
  db,
  schoolId,
  klass,
  date,
  isToday,
  onQueued,
}: {
  db: OfflineDb;
  schoolId: string;
  klass: SyncClass;
  date: string;
  isToday: boolean;
  onQueued: () => void;
}) {
  const data = useLiveQuery(async () => {
    const learners = await db.learners.where("classGroupId").equals(klass.id).toArray();
    learners.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    const saved = await db.attendance.where("date").equals(date).toArray();
    const register = await db.registers.where("[classGroupId+date]").equals([klass.id, date]).first();
    return { learners, saved: new Map(saved.map((s) => [s.learnerId, s])), register };
  }, [db, klass.id, date]);

  // Only what the teacher changed; everything else shows the saved mark or
  // "present".
  const [edits, setEdits] = useState<Record<string, Mark>>({});
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  if (!data) return null;
  const { learners, saved, register } = data;
  if (learners.length === 0) {
    return <p className="text-sm text-slate-600">No learners in {klass.name} on this device.</p>;
  }

  const markOf = (learnerId: string): Mark =>
    edits[learnerId] ?? {
      status: saved.get(learnerId)?.status ?? "present",
      reason: saved.get(learnerId)?.reason ?? "",
    };
  const set = (learnerId: string, patch: Partial<Mark>) => {
    setMessage(null);
    setEdits((prev) => ({ ...prev, [learnerId]: { ...markOf(learnerId), ...patch } }));
  };

  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const l of learners) counts[markOf(l.id).status]++;

  async function submit() {
    await submitRegister(
      schoolId,
      klass,
      date,
      learners.map((l) => {
        const m = markOf(l.id);
        return { learnerId: l.id, status: m.status, reason: m.status === "present" ? null : m.reason.trim() || null };
      }),
      isToday && notify,
    );
    setEdits({});
    setMessage(
      `Register for ${klass.name} saved${navigator.onLine ? " and sending" : " on this device. It will be sent when you're back online"}.`,
    );
    onQueued();
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          {register ? (
            <span className="text-green-800">
              Taken {new Date(register.takenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {Object.keys(edits).length ? " · unsaved changes" : ""}
            </span>
          ) : (
            <span className="text-amber-800">Not taken yet</span>
          )}
        </p>
        <button
          type="button"
          className="text-sm text-brand-700 hover:underline"
          onClick={() => setEdits(Object.fromEntries(learners.map((l) => [l.id, { status: "present", reason: "" }])))}
        >
          Mark everyone present
        </button>
      </div>

      <ul className="divide-y divide-slate-100">
        {learners.map((l) => {
          const mark = markOf(l.id);
          return (
            <li key={l.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {l.preferredName || l.firstName} {l.lastName}
                </span>
                <span className="inline-flex overflow-hidden rounded-md border border-slate-300" role="radiogroup">
                  {ATTENDANCE_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={mark.status === s}
                      aria-label={`${LABELS[s].long}: ${l.firstName} ${l.lastName}`}
                      title={LABELS[s].long}
                      onClick={() => set(l.id, { status: s })}
                      className={`h-10 w-10 text-sm font-semibold ${mark.status === s ? LABELS[s].on : "bg-white text-slate-600"}`}
                    >
                      {LABELS[s].short}
                    </button>
                  ))}
                </span>
              </div>
              {mark.status !== "present" ? (
                <input
                  className="input mt-2 text-sm"
                  placeholder="Reason (optional), e.g. sick, doctor's note"
                  value={mark.reason}
                  maxLength={200}
                  onChange={(e) => set(l.id, { reason: e.target.value })}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="space-y-3 border-t border-slate-200 pt-3">
        <p className="text-sm">
          {counts.present} present · {counts.absent} absent · {counts.late} late · {counts.excused} excused
        </p>
        {isToday ? (
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Tell parents of absent learners (WhatsApp or email; letters for the office)
          </label>
        ) : (
          <p className="text-xs text-slate-500">Parents are only told about absences on the day.</p>
        )}
        <button type="button" className="btn-primary" onClick={() => void submit()}>
          {register ? "Save changes" : "Submit register"}
        </button>
        {message ? (
          <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            {message}
          </p>
        ) : null}
      </div>
    </>
  );
}
