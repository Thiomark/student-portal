import "server-only";
import { z } from "zod";
import { ForbiddenError, getSchoolContext, requireCapability, type SchoolContext } from "@/lib/auth/context";
import type { Capability } from "@/lib/permissions";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export class UserFacingError extends Error {}

// Wraps a server action for a school: resolves the tenant from the slug,
// checks the capability, and turns expected failures into a result the form
// can show instead of an error page.
export async function schoolAction<T>(
  slug: string,
  capability: Capability,
  run: (ctx: SchoolContext) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await getSchoolContext(slug);
    requireCapability(ctx, capability);
    return { ok: true, data: await run(ctx) };
  } catch (err) {
    return toActionError(err);
  }
}

export function toActionError(err: unknown): { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> } {
  if (err instanceof ForbiddenError) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  if (err instanceof z.ZodError) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: z.flattenError(err).fieldErrors };
  }
  if (err instanceof UserFacingError) return { ok: false, error: err.message };
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505") return { ok: false, error: "That already exists. Check for a duplicate number or name." };
  // Next.js uses thrown errors for redirect() and notFound(); let them through.
  if (err && typeof err === "object" && "digest" in err) throw err;
  console.error("[action] unexpected error", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

// FormData → plain object; empty strings become undefined so optional fields
// validate cleanly.
export function formToObject(form: FormData): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key).filter((v): v is string => typeof v === "string");
    const cleaned = values.map((v) => v.trim()).filter((v) => v !== "");
    out[key] = key.endsWith("[]") ? cleaned : cleaned[0];
  }
  return out;
}
