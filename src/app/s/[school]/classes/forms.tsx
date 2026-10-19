"use client";

import type { ReactNode } from "react";
import { ActionForm, Field, SubmitButton, type FormState } from "@/components/action-form";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

// A single button that runs a bound action and shows its result inline.
export function ActionButton({
  action,
  children,
  className = "btn-secondary",
  confirmText,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  confirmText?: string;
}) {
  return (
    <ActionForm action={action}>
      <button
        type="submit"
        className={className}
        onClick={(e) => {
          if (confirmText && !confirm(confirmText)) e.preventDefault();
        }}
      >
        {children}
      </button>
    </ActionForm>
  );
}

export function AcademicYearForm({ action, hasCurrent }: { action: Action; hasCurrent: boolean }) {
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="name" label="Name" hint='Usually the year, e.g. "2027".'>
          <input id="name" name="name" className="input" required />
        </Field>
        <Field name="startsOn" label="Starts on">
          <input id="startsOn" name="startsOn" type="date" className="input" required />
        </Field>
        <Field name="endsOn" label="Ends on">
          <input id="endsOn" name="endsOn" type="date" className="input" required />
        </Field>
      </div>
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" name="isCurrent" defaultChecked={!hasCurrent} /> Make this the current year
      </label>
      <SubmitButton>Add year</SubmitButton>
    </ActionForm>
  );
}

export function GradeCreateForm({ action, nextSortOrder }: { action: Action; nextSortOrder: number }) {
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end" resetOnSuccess>
      <Field name="name" label="Grade name" hint='e.g. "Grade 8" or "Grade R".'>
        <input id="name" name="name" className="input" required />
      </Field>
      <Field name="sortOrder" label="Order">
        <input
          id="sortOrder"
          name="sortOrder"
          type="number"
          min={0}
          max={9999}
          className="input"
          defaultValue={nextSortOrder}
        />
      </Field>
      <div className="sm:pb-5">
        <SubmitButton>Add grade</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function GradeRow({
  grade,
  update,
  remove,
}: {
  grade: { id: string; name: string; sortOrder: number; classCount: number };
  update: Action;
  remove: Action | null;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3 py-3">
      <ActionForm action={update} className="flex flex-1 flex-wrap items-start gap-2">
        <label className="sr-only" htmlFor={`name-${grade.id}`}>
          Name
        </label>
        <input id={`name-${grade.id}`} name="name" className="input w-48" defaultValue={grade.name} required />
        <label className="sr-only" htmlFor={`order-${grade.id}`}>
          Order
        </label>
        <input
          id={`order-${grade.id}`}
          name="sortOrder"
          type="number"
          min={0}
          max={9999}
          className="input w-24"
          defaultValue={grade.sortOrder}
          title="Order"
        />
        <SubmitButton className="btn-secondary">Save</SubmitButton>
        <span className="self-center text-sm text-slate-500">
          {grade.classCount === 1 ? "1 class" : `${grade.classCount} classes`}
        </span>
      </ActionForm>
      {remove ? (
        <ActionButton action={remove} className="btn-secondary text-red-700" confirmText={`Remove ${grade.name}?`}>
          Remove
        </ActionButton>
      ) : null}
    </div>
  );
}

type ClassGroup = { name: string; gradeId: string; teacherId: string | null; room: string | null };

export function ClassForm({
  action,
  grades,
  teachers,
  classGroup,
  submitLabel,
}: {
  action: Action;
  grades: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  classGroup?: ClassGroup;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="card space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Class name" hint='e.g. "8A".'>
          <input id="name" name="name" className="input" required defaultValue={classGroup?.name} />
        </Field>
        <Field name="gradeId" label="Grade">
          <select id="gradeId" name="gradeId" className="input" required defaultValue={classGroup?.gradeId ?? ""}>
            <option value="" disabled>
              Pick a grade
            </option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="teacherId" label="Class teacher">
          <select id="teacherId" name="teacherId" className="input" defaultValue={classGroup?.teacherId ?? ""}>
            <option value="">No teacher yet</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="room" label="Room">
          <input id="room" name="room" className="input" defaultValue={classGroup?.room ?? ""} />
        </Field>
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

export function SubjectCreateForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end" resetOnSuccess>
      <Field name="name" label="Subject name" hint='e.g. "Mathematics".'>
        <input id="name" name="name" className="input" required />
      </Field>
      <Field name="code" label="Code" hint="Optional.">
        <input id="code" name="code" className="input" />
      </Field>
      <div className="sm:pb-5">
        <SubmitButton>Add subject</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function SubjectRow({
  subject,
  update,
}: {
  subject: { id: string; name: string; code: string | null; titleCount: number };
  update: Action;
}) {
  return (
    <ActionForm action={update} className="flex flex-wrap items-start gap-2 py-3">
      <label className="sr-only" htmlFor={`name-${subject.id}`}>
        Name
      </label>
      <input id={`name-${subject.id}`} name="name" className="input w-64" defaultValue={subject.name} required />
      <label className="sr-only" htmlFor={`code-${subject.id}`}>
        Code
      </label>
      <input
        id={`code-${subject.id}`}
        name="code"
        className="input w-32"
        defaultValue={subject.code ?? ""}
        placeholder="Code"
      />
      <SubmitButton className="btn-secondary">Save</SubmitButton>
      <span className="self-center text-sm text-slate-500">
        {subject.titleCount === 1 ? "1 textbook title" : `${subject.titleCount} textbook titles`}
      </span>
    </ActionForm>
  );
}
