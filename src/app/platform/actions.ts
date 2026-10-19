"use server";

import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { getDb, schema } from "@/db/client";
import { formToObject, toActionError, UserFacingError } from "@/lib/actions";
import { isPlatformAdmin, requireUser } from "@/lib/auth/context";
import { uuidv7 } from "@/lib/ids";

const input = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, "Lowercase letters, numbers and dashes"),
  ownerEmail: z.string().trim().toLowerCase().pipe(z.email()),
  timezone: z.string().default("Africa/Johannesburg"),
  saGrades: z.literal("on").optional(),
});

// South African grades, Grade R to Grade 12.
const SA_GRADES = ["Grade R", ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)];

// Creates a school and invites its first owner. The platform admin gets no
// membership in the school they create.
export async function createSchool(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    if (!(await isPlatformAdmin(user.id))) throw new UserFacingError("Only platform admins can add schools.");
    const data = input.parse(formToObject(form));
    const schoolId = uuidv7();
    const year = new Date().getFullYear();

    await getDb().transaction(async (tx) => {
      await tx.insert(schema.schools).values({
        id: schoolId,
        slug: data.slug,
        name: data.name,
        timezone: data.timezone,
      });
      await tx.insert(schema.academicYears).values({
        id: uuidv7(),
        schoolId,
        name: String(year),
        startsOn: `${year}-01-01`,
        endsOn: `${year}-12-31`,
        isCurrent: true,
      });
      if (data.saGrades) {
        await tx
          .insert(schema.grades)
          .values(SA_GRADES.map((name, i) => ({ id: uuidv7(), schoolId, name, sortOrder: i })));
      }
      await tx.insert(schema.invites).values({
        id: uuidv7(),
        schoolId,
        email: data.ownerEmail,
        role: "owner",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        invitedBy: user.id,
      });
      await tx.insert(schema.activityEvents).values({
        id: uuidv7(),
        schoolId,
        actorUserId: user.id,
        actorName: user.name ?? user.email,
        actorRole: "platform",
        action: "settings.school_created",
        area: "settings",
        entityType: "school",
        entityId: schoolId,
        subject: data.name,
        meta: { ownerInvited: true },
      });
    });
    return {
      ok: true,
      message: `Created ${data.name}. ${data.ownerEmail} becomes owner when they sign in with that email.`,
    };
  } catch (err) {
    return toActionError(err);
  }
}
