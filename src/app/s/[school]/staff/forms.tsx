"use client";

import { useState } from "react";
import { ActionForm, Field, SubmitButton, type FormState } from "@/components/action-form";
import {
  CAPABILITIES,
  NOT_GRANTABLE,
  STAFF_PRESETS,
  STAFF_PRESET_LABELS,
  type Capability,
  type Role,
  type StaffPreset,
} from "@/lib/permissions";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

type Staff = {
  title: string | null;
  firstName: string;
  lastName: string;
  staffNumber: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  status: string;
};

export function StaffForm({ action, staff }: { action: Action; staff?: Staff }) {
  return (
    <ActionForm action={action} className="card space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-[6rem_1fr_1fr]">
        <Field name="title" label="Title">
          <input id="title" name="title" className="input" placeholder="Mr" defaultValue={staff?.title ?? ""} />
        </Field>
        <Field name="firstName" label="First name">
          <input id="firstName" name="firstName" className="input" required defaultValue={staff?.firstName} />
        </Field>
        <Field name="lastName" label="Surname">
          <input id="lastName" name="lastName" className="input" required defaultValue={staff?.lastName} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="position" label="Position">
          <input id="position" name="position" className="input" placeholder="Grade 8 Maths teacher" defaultValue={staff?.position ?? ""} />
        </Field>
        <Field name="staffNumber" label="Staff number">
          <input id="staffNumber" name="staffNumber" className="input" defaultValue={staff?.staffNumber ?? ""} />
        </Field>
        <Field name="status" label="Status">
          <select id="status" name="status" className="input" defaultValue={staff?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="on_leave">On leave</option>
            <option value="left">Left the school</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="phone" label="Phone">
          <input id="phone" name="phone" type="tel" className="input" defaultValue={staff?.phone ?? ""} />
        </Field>
        <Field name="email" label="Email">
          <input id="email" name="email" type="email" className="input" defaultValue={staff?.email ?? ""} />
        </Field>
      </div>
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}

const CAPABILITY_GROUPS = Array.from(new Set(CAPABILITIES.map((c) => c.split(".")[0])));

function AccessFields({
  actorRole,
  role: initialRole = "staff",
  preset: initialPreset = "teacher",
  capabilities,
}: {
  actorRole: Role;
  role?: Role;
  preset?: StaffPreset;
  capabilities?: readonly Capability[];
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const [ticked, setTicked] = useState<Set<Capability>>(
    new Set(capabilities ?? STAFF_PRESETS[initialPreset]),
  );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="role" label="Role">
          <select id="role" name="role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="staff">Staff — access from their preset below</option>
            <option value="admin">Admin — everything, manages staff</option>
            {actorRole === "owner" ? <option value="owner">Owner — everything</option> : null}
          </select>
        </Field>
        <Field name="preset" label="Starting point">
          <select
            id="preset"
            name="preset"
            className="input"
            defaultValue={initialPreset}
            disabled={role !== "staff"}
            onChange={(e) => setTicked(new Set(STAFF_PRESETS[e.target.value as StaffPreset]))}
          >
            {(Object.keys(STAFF_PRESETS) as StaffPreset[]).map((p) => (
              <option key={p} value={p}>
                {STAFF_PRESET_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {/* A disabled select isn't submitted; keep the preset for admins too. */}
      {role !== "staff" ? <input type="hidden" name="preset" value={initialPreset} /> : null}
      {role === "staff" ? (
        <fieldset>
          <legend className="label">Can do</legend>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            {CAPABILITY_GROUPS.map((group) => (
              <div key={group}>
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{group}</p>
                {CAPABILITIES.filter((c) => c.startsWith(`${group}.`)).map((c) => {
                  const locked = NOT_GRANTABLE.includes(c);
                  return (
                    <label key={c} className={`flex items-center gap-1.5 text-sm ${locked ? "text-slate-400" : ""}`}>
                      <input
                        type="checkbox"
                        name="cap[]"
                        value={c}
                        disabled={locked}
                        checked={!locked && ticked.has(c)}
                        onChange={(e) => {
                          const next = new Set(ticked);
                          if (e.target.checked) next.add(c);
                          else next.delete(c);
                          setTicked(next);
                        }}
                      />
                      {c.split(".")[1]}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Managing staff and school settings needs the Admin role.</p>
        </fieldset>
      ) : null}
    </>
  );
}

export function InviteForm({ action, email, actorRole }: { action: Action; email: string | null; actorRole: Role }) {
  return (
    <ActionForm action={action} className="space-y-4">
      <Field name="email" label="Email they'll sign in with">
        <input id="email" name="email" type="email" className="input" required defaultValue={email ?? ""} />
      </Field>
      <AccessFields actorRole={actorRole} />
      <SubmitButton>Send invitation</SubmitButton>
    </ActionForm>
  );
}

export function AccessForm({
  action,
  actorRole,
  role,
  preset,
  capabilities,
}: {
  action: Action;
  actorRole: Role;
  role: Role;
  preset: StaffPreset;
  capabilities: readonly Capability[];
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      <AccessFields actorRole={actorRole} role={role} preset={preset} capabilities={capabilities} />
      <SubmitButton>Save access</SubmitButton>
    </ActionForm>
  );
}
