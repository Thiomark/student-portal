"use client";

import { useState } from "react";
import { ActionForm, Field, SubmitButton, type FormState } from "@/components/action-form";

// Mirrors lib/validation/textbooks without importing it, so zod stays out of
// the client bundle. The server re-validates everything.
const BOOK_CONDITIONS = ["new", "good", "fair", "poor", "damaged"] as const;
const MAX_COPIES_PER_BATCH = 1000;
const copyLabel = (prefix: string, n: number, width: number) =>
  `${prefix.trim().toUpperCase()}${String(n).padStart(width, "0")}`;

type Action = (state: FormState, form: FormData) => Promise<FormState>;
type Option = { id: string; name: string };

type Title = {
  title: string;
  subjectId: string | null;
  gradeId: string | null;
  isbn: string | null;
  publisher: string | null;
  edition: string | null;
};

export function TitleForm({
  action,
  title,
  grades,
  subjects,
  submitLabel,
}: {
  action: Action;
  title?: Title;
  grades: Option[];
  subjects: Option[];
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="card space-y-4 p-4">
      <Field name="title" label="Title" hint='As printed on the cover, e.g. "Platinum Mathematics Grade 8".'>
        <input id="title" name="title" className="input" required defaultValue={title?.title} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="subjectId" label="Subject">
          <select id="subjectId" name="subjectId" className="input" defaultValue={title?.subjectId ?? ""}>
            <option value="">—</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="gradeId" label="Grade">
          <select id="gradeId" name="gradeId" className="input" defaultValue={title?.gradeId ?? ""}>
            <option value="">—</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="isbn" label="ISBN">
          <input id="isbn" name="isbn" className="input" inputMode="numeric" defaultValue={title?.isbn ?? ""} />
        </Field>
        <Field name="publisher" label="Publisher">
          <input id="publisher" name="publisher" className="input" defaultValue={title?.publisher ?? ""} />
        </Field>
        <Field name="edition" label="Edition">
          <input id="edition" name="edition" className="input" defaultValue={title?.edition ?? ""} />
        </Field>
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

function ConditionSelect({ id, defaultValue = "new" }: { id: string; defaultValue?: string }) {
  return (
    <select id={id} name="condition" className="input" defaultValue={defaultValue}>
      {BOOK_CONDITIONS.map((c) => (
        <option key={c} value={c}>
          {c[0].toUpperCase() + c.slice(1)}
        </option>
      ))}
    </select>
  );
}

export function AddCopiesForm({ action, suggestedPrefix }: { action: Action; suggestedPrefix: string }) {
  const [mode, setMode] = useState<"range" | "single">("range");
  const [range, setRange] = useState({ prefix: suggestedPrefix, start: "1", end: "", width: "3" });
  const start = Number(range.start);
  const end = Number(range.end);
  const width = Number(range.width) || 0;
  const valid = range.end !== "" && Number.isInteger(start) && Number.isInteger(end) && end >= start;
  const count = valid ? end - start + 1 : 0;
  const preview =
    valid && count <= MAX_COPIES_PER_BATCH
      ? [copyLabel(range.prefix, start, width), copyLabel(range.prefix, end, width)]
      : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm" role="radiogroup" aria-label="How to add copies">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="mode-picker" checked={mode === "range"} onChange={() => setMode("range")} /> A
          numbered range
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="mode-picker" checked={mode === "single"} onChange={() => setMode("single")} /> One
          copy
        </label>
      </div>

      {mode === "range" ? (
        <ActionForm action={action} className="space-y-4" key="range">
          <input type="hidden" name="mode" value="range" />
          <div className="grid gap-4 sm:grid-cols-4">
            <Field name="prefix" label="Prefix" hint='e.g. "MATH8-". Optional.'>
              <input
                id="prefix"
                name="prefix"
                className="input font-mono"
                value={range.prefix}
                onChange={(e) => setRange({ ...range, prefix: e.target.value })}
              />
            </Field>
            <Field name="start" label="First number">
              <input
                id="start"
                name="start"
                type="number"
                min={0}
                className="input"
                required
                value={range.start}
                onChange={(e) => setRange({ ...range, start: e.target.value })}
              />
            </Field>
            <Field name="end" label="Last number">
              <input
                id="end"
                name="end"
                type="number"
                min={0}
                className="input"
                required
                value={range.end}
                onChange={(e) => setRange({ ...range, end: e.target.value })}
              />
            </Field>
            <Field name="width" label="Digits" hint="Pads with zeros: 3 → 001.">
              <input
                id="width"
                name="width"
                type="number"
                min={0}
                max={10}
                className="input"
                value={range.width}
                onChange={(e) => setRange({ ...range, width: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field name="condition" label="Condition">
              <ConditionSelect id="range-condition" />
            </Field>
            <Field name="acquiredOn" label="Received on">
              <input id="range-acquiredOn" name="acquiredOn" type="date" className="input" />
            </Field>
          </div>
          <p className="text-sm text-slate-600">
            {preview ? (
              <>
                Will add <strong>{count}</strong> {count === 1 ? "copy" : "copies"}:{" "}
                <span className="font-mono">{preview[0]}</span>
                {count > 1 ? (
                  <>
                    {" "}
                    to <span className="font-mono">{preview[1]}</span>
                  </>
                ) : null}
                . Numbers already in use are skipped.
              </>
            ) : count > MAX_COPIES_PER_BATCH ? (
              <span className="text-red-700">At most {MAX_COPIES_PER_BATCH} copies at a time.</span>
            ) : (
              "Enter the first and last number written in the books."
            )}
          </p>
          <SubmitButton>Add copies</SubmitButton>
        </ActionForm>
      ) : (
        <ActionForm action={action} className="space-y-4" key="single" resetOnSuccess>
          <input type="hidden" name="mode" value="single" />
          <div className="grid gap-4 sm:grid-cols-4">
            <Field name="copyNumber" label="Copy number">
              <input id="copyNumber" name="copyNumber" className="input font-mono" required />
            </Field>
            <Field name="condition" label="Condition">
              <ConditionSelect id="single-condition" />
            </Field>
            <Field name="acquiredOn" label="Received on">
              <input id="single-acquiredOn" name="acquiredOn" type="date" className="input" />
            </Field>
          </div>
          <SubmitButton>Add copy</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function CopyEditForm({
  action,
  copy,
}: {
  action: Action;
  copy: { condition: string; acquiredOn: string | null; notes: string | null };
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="condition" label="Condition">
          <ConditionSelect id="condition" defaultValue={copy.condition} />
        </Field>
        <Field name="acquiredOn" label="Received on">
          <input id="acquiredOn" name="acquiredOn" type="date" className="input" defaultValue={copy.acquiredOn ?? ""} />
        </Field>
      </div>
      <Field name="notes" label="Notes">
        <textarea id="notes" name="notes" rows={2} className="input" defaultValue={copy.notes ?? ""} />
      </Field>
      <SubmitButton>Save copy</SubmitButton>
    </ActionForm>
  );
}

export function CopyStatusForm({
  action,
  status,
  label,
  className = "btn-secondary",
  confirmText,
}: {
  action: Action;
  status: "lost" | "written_off" | "available";
  label: string;
  className?: string;
  confirmText?: string;
}) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={className}
        onClick={(e) => {
          if (confirmText && !confirm(confirmText)) e.preventDefault();
        }}
      >
        {label}
      </button>
    </ActionForm>
  );
}
