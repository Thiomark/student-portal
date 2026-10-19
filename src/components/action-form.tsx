"use client";

import { useRouter } from "next/navigation";
import { createContext, useActionState, useContext, useEffect, type ReactNode } from "react";

export type FormState =
  | { ok: true; message?: string; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> }
  | null;

const FieldErrors = createContext<Record<string, string[] | undefined>>({});

// Progressive-enhancement form around a server action: works without JS,
// shows field errors and a pending state with it.
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form
      action={formAction}
      className={className}
      aria-busy={pending}
      key={resetOnSuccess && state?.ok ? JSON.stringify(state) : undefined}
    >
      <FieldErrors value={state && !state.ok ? (state.fieldErrors ?? {}) : {}}>
        <fieldset disabled={pending} className="contents">
          {children}
        </fieldset>
      </FieldErrors>
      {state && !state.ok ? (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state?.ok && state.message ? (
        <p role="status" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function Field({
  name,
  label,
  hint,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const errors = useContext(FieldErrors)[name];
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      {children}
      {hint && !errors ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {errors ? <p className="mt-1 text-xs text-red-700">{errors.join(" ")}</p> : null}
    </div>
  );
}

export function SubmitButton({ children, className = "btn-primary" }: { children: ReactNode; className?: string }) {
  return (
    <button type="submit" className={className}>
      {children}
    </button>
  );
}
