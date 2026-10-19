"use server";

import { revalidatePath } from "next/cache";
import { schoolAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { recordActivity } from "@/lib/activity";
import { requireCapability } from "@/lib/auth/context";
import { parseLearnerImport } from "@/lib/import/learners";
import { applyLearnerImport, previewMatches, type ImportSummary } from "@/server/import-learners";

// About 3,000 learners with two parents each. Stays under the server-action
// body limit in next.config.ts (1 MB).
const MAX_BYTES = 900_000;

export type ImportPreview = {
  total: number;
  valid: number;
  invalid: number;
  existing: number;
  withoutAdmissionNumber: number;
  parents: number;
  unknownClasses: string[];
  missingColumns: string[];
  ignoredColumns: string[];
  // Rows with problems first, then a sample of good ones.
  sample: { line: number; name: string; className: string | null; parents: number; errors: string[]; warnings: string[] }[];
};

function read(text: string) {
  if (typeof text !== "string" || text.length === 0) throw new UserFacingError("Choose a CSV file first.");
  if (text.length > MAX_BYTES) throw new UserFacingError("That file is too big. Split it by grade and import each part.");
  return parseLearnerImport(text);
}

export async function previewImport(slug: string, text: string): Promise<ActionResult<ImportPreview>> {
  return schoolAction(slug, "learners.manage", async (ctx) => {
    requireCapability(ctx, "guardians.manage");
    const parsed = read(text);
    const matches = await previewMatches(ctx.school.id, parsed.rows);
    const withProblems = parsed.rows.filter((r) => r.errors.length || r.warnings.length);
    const clean = parsed.rows.filter((r) => !r.errors.length && !r.warnings.length);
    return {
      total: parsed.rows.length,
      valid: parsed.rows.filter((r) => r.learner).length,
      invalid: parsed.rows.filter((r) => !r.learner).length,
      parents: parsed.rows.reduce((n, r) => n + (r.learner?.parents.length ?? 0), 0),
      missingColumns: parsed.missingColumns,
      ignoredColumns: parsed.ignoredColumns,
      ...matches,
      sample: [...withProblems.slice(0, 100), ...clean.slice(0, 10)].map((r) => ({
        line: r.line,
        name: r.learner ? `${r.learner.firstName} ${r.learner.lastName}` : "—",
        className: r.learner?.className ?? null,
        parents: r.learner?.parents.length ?? 0,
        errors: r.errors,
        warnings: r.warnings,
      })),
    };
  });
}

export async function importLearners(slug: string, text: string): Promise<ActionResult<ImportSummary>> {
  const result = await schoolAction(slug, "learners.manage", async (ctx) => {
    requireCapability(ctx, "guardians.manage");
    const parsed = read(text);
    if (parsed.missingColumns.length) {
      throw new UserFacingError(`The file needs these columns: ${parsed.missingColumns.join(", ")}.`);
    }
    const summary = await applyLearnerImport(ctx, parsed.rows);
    await recordActivity(ctx, {
      action: "learners.imported",
      entityType: "import",
      subject: `${summary.learnersCreated + summary.learnersUpdated} learners from a spreadsheet`,
      meta: { ...summary, notes: summary.notes.length },
    });
    return summary;
  });
  if (result.ok) revalidatePath(`/s/${slug}/learners`);
  return result;
}
