"use client";

import { ActionForm, Field, SubmitButton, type FormState } from "@/components/action-form";
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TRANSITIONS,
  type MaintenanceStatus,
} from "@/lib/validation/maintenance";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

function CategoryPriority({ category, priority }: { category?: string; priority?: string }) {
  return (
    <>
      <Field name="category" label="Category">
        <select id="category" name="category" className="input" defaultValue={category ?? ""} required>
          <option value="" disabled>
            Choose…
          </option>
          {MAINTENANCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {MAINTENANCE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field name="priority" label="Priority">
        <select id="priority" name="priority" className="input" defaultValue={priority ?? "normal"}>
          {MAINTENANCE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

export function NewRequestForm({ action, resetOnSuccess }: { action: Action; resetOnSuccess: boolean }) {
  return (
    <ActionForm action={action} className="card space-y-4 p-4" resetOnSuccess={resetOnSuccess}>
      <Field name="title" label="What's wrong?" hint="e.g. Broken window, tap leaking, projector not working">
        <input id="title" name="title" className="input" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="location" label="Where">
          <input id="location" name="location" className="input" placeholder="Room 12, main block" />
        </Field>
        <CategoryPriority />
      </div>
      <Field name="description" label="Details">
        <textarea id="description" name="description" rows={4} className="input" />
      </Field>
      <SubmitButton>Submit request</SubmitButton>
    </ActionForm>
  );
}

export function ManageRequestForm({
  action,
  request,
}: {
  action: Action;
  request: {
    status: MaintenanceStatus;
    category: string;
    priority: string;
    assignedTo: string | null;
    vendor: string | null;
    cost: string;
  };
}) {
  const options = [request.status, ...MAINTENANCE_TRANSITIONS[request.status]];
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="status" label="Status">
          <select id="status" name="status" className="input" defaultValue={request.status}>
            {options.map((s) => (
              <option key={s} value={s}>
                {MAINTENANCE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <CategoryPriority category={request.category} priority={request.priority} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="assignedTo" label="Assigned to">
          <input id="assignedTo" name="assignedTo" className="input" defaultValue={request.assignedTo ?? ""} />
        </Field>
        <Field name="vendor" label="Vendor / contractor">
          <input id="vendor" name="vendor" className="input" defaultValue={request.vendor ?? ""} />
        </Field>
        <Field name="cost" label="Cost (R)">
          <input id="cost" name="cost" inputMode="decimal" className="input" defaultValue={request.cost} />
        </Field>
      </div>
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}
