"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { formToObject, schoolAction } from "@/lib/actions";
import { recordActivity } from "@/lib/activity";
import { rollOver } from "@/server/rollover";

const input = z.object({
  name: z.string().trim().min(1, "Required").max(50),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  confirm: z.literal("on", { error: "Tick the box to confirm" }),
});
const action = z.enum(["promote", "repeat", "graduate", "skip"]);

export async function runRollover(slug: string, classIds: string[], _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "classes.manage", async (ctx) => {
    const raw = formToObject(form);
    const year = input.parse(raw);
    const plans = classIds.map((classId) => {
      const target = raw[`target:${classId}`];
      const [targetGradeId, targetName] = typeof target === "string" ? [target, raw[`name:${classId}`]] : [null, null];
      return {
        classId,
        action: action.parse(raw[`action:${classId}`]),
        targetGradeId,
        targetName: typeof targetName === "string" ? targetName : null,
      };
    });
    const repeaters = z.array(z.uuid()).parse(form.getAll("repeat[]"));
    const outcome = await rollOver(ctx, {
      newYear: { name: year.name, startsOn: year.startsOn, endsOn: year.endsOn },
      plans,
      repeaters,
    });
    await recordActivity(ctx, {
      action: "classes.rolled_over",
      entityType: "academic_year",
      entityId: outcome.yearId,
      subject: `Moved into ${year.name}`,
      meta: outcome,
    });
    return { year: year.name, ...outcome };
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}`, "layout");
  const r = result.data;
  return {
    ok: true,
    message:
      `Done. ${r.year} is now the current year: ${r.promoted} learners moved up, ${r.repeated} repeating, ` +
      `${r.graduated} graduated${r.unplaced ? `, ${r.unplaced} not placed in a class` : ""}. ` +
      `${r.classesCreated} classes created; give them class teachers on the Classes page.` +
      (r.booksStillOut ? ` ${r.booksStillOut} textbooks are still out with learners.` : ""),
  };
}
