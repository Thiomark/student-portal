"use client";

import { useState } from "react";
import { ActionForm, Field, SubmitButton, type FormState } from "@/components/action-form";
import type { ClassPlan, RolloverAction } from "@/lib/rollover";

type ClassRow = {
  id: string;
  name: string;
  gradeName: string;
  plan: ClassPlan;
  learners: { id: string; name: string }[];
};

const ACTION_LABELS: Record<RolloverAction, string> = {
  promote: "Move up to",
  repeat: "Repeat the same grade",
  graduate: "Graduate / leave school",
  skip: "Don't place (sort out later)",
};

export function RolloverForm({
  action,
  currentYear,
  defaults,
  grades,
  classes,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  currentYear: string;
  defaults: { name: string; startsOn: string; endsOn: string };
  grades: { id: string; name: string }[];
  classes: ClassRow[];
}) {
  return (
    <ActionForm action={action} className="space-y-6">
      <div className="card space-y-4 p-4">
        <h2 className="font-semibold">Next academic year</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="name" label="Name">
            <input id="name" name="name" className="input" defaultValue={defaults.name} required />
          </Field>
          <Field name="startsOn" label="Starts">
            <input id="startsOn" name="startsOn" type="date" className="input" defaultValue={defaults.startsOn} required />
          </Field>
          <Field name="endsOn" label="Ends">
            <input id="endsOn" name="endsOn" type="date" className="input" defaultValue={defaults.endsOn} required />
          </Field>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{currentYear} class</th>
              <th>Next year</th>
              <th>Learners held back</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <ClassPlanRow key={c.id} row={c} grades={grades} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="card space-y-3 p-4 text-sm">
        <p>
          This closes every {currentYear} class, places learners in next year&apos;s classes (creating them), marks the
          graduating classes as graduated, and makes the new year current. Registers, textbook loans and history stay
          as they are. It can&apos;t be undone in one click, so check the plan above.
        </p>
        <Field name="confirm" label="">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="confirm" /> I&apos;ve checked the plan. Move the school into the new year.
          </label>
        </Field>
        <SubmitButton>Roll over</SubmitButton>
      </div>
    </ActionForm>
  );
}

function ClassPlanRow({ row, grades }: { row: ClassRow; grades: { id: string; name: string }[] }) {
  const [action, setAction] = useState<RolloverAction>(row.plan.action);
  return (
    <tr>
      <td>
        <span className="font-medium">{row.name}</span>
        <div className="text-xs text-slate-500">
          {row.gradeName} · {row.learners.length} learners
        </div>
      </td>
      <td className="space-y-2">
        <select
          name={`action:${row.id}`}
          className="input"
          value={action}
          onChange={(e) => setAction(e.target.value as RolloverAction)}
          aria-label={`Plan for ${row.name}`}
        >
          {(Object.keys(ACTION_LABELS) as RolloverAction[]).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        {action === "promote" ? (
          <div className="flex gap-2">
            <select
              name={`target:${row.id}`}
              className="input"
              defaultValue={row.plan.targetGradeId ?? grades[0]?.id}
              aria-label={`Next year's grade for ${row.name}`}
            >
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <input
              name={`name:${row.id}`}
              className="input w-28"
              defaultValue={row.plan.targetName ?? row.name}
              aria-label={`Next year's class name for ${row.name}`}
              required
            />
          </div>
        ) : null}
      </td>
      <td>
        {row.learners.length && action !== "repeat" ? (
          <details>
            <summary className="cursor-pointer text-sm text-brand-700">Choose learners who repeat</summary>
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {row.learners.map((l) => (
                <li key={l.id}>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="repeat[]" value={l.id} /> {l.name}
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-500">They go to {row.name} again next year.</p>
          </details>
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}
