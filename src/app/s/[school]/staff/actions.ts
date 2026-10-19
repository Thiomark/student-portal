"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { getDb, schema } from "@/db/client";
import { formToObject, schoolAction, UserFacingError } from "@/lib/actions";
import { diffFields, recordActivity } from "@/lib/activity";
import { fullName } from "@/lib/format";
import { uuidv7 } from "@/lib/ids";
import { sendEmail } from "@/lib/messaging/email";
import { canManageRole, isCapability, NOT_GRANTABLE, STAFF_PRESETS } from "@/lib/permissions";

const { staff, memberships, invites } = schema;

const optional = (max: number) => z.string().trim().max(max).optional();

const staffInput = z.object({
  title: optional(20),
  firstName: z.string().trim().min(1, "Required").max(100),
  lastName: z.string().trim().min(1, "Required").max(100),
  staffNumber: optional(50),
  position: optional(100),
  phone: optional(30),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")).optional(),
  status: z.enum(["active", "on_leave", "left"]).default("active"),
});

const accessInput = z.object({
  role: z.enum(["owner", "admin", "staff"]),
  preset: z.enum(Object.keys(STAFF_PRESETS) as [keyof typeof STAFF_PRESETS, ...(keyof typeof STAFF_PRESETS)[]]),
  // The capabilities ticked on the form. Stored as a difference from the
  // preset, so improving a preset later reaches everyone on it.
  "cap[]": z.array(z.string()).default([]),
});

function permissionsFrom(input: z.infer<typeof accessInput>) {
  const preset = STAFF_PRESETS[input.preset] as readonly string[];
  const ticked = new Set(input["cap[]"].filter(isCapability));
  return {
    preset: input.preset,
    grant: [...ticked].filter((c) => !preset.includes(c) && !NOT_GRANTABLE.includes(c)),
    revoke: preset.filter((c) => !ticked.has(c as never)),
  };
}

function parseAccess(raw: Record<string, string | string[] | undefined>) {
  return accessInput.parse({ ...raw, "cap[]": raw["cap[]"] ?? [] });
}

export async function saveStaff(
  slug: string,
  staffId: string | null,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "staff.manage", async (ctx) => {
    const input = staffInput.parse(formToObject(form));
    const db = getDb();
    const values = {
      ...input,
      title: input.title ?? null,
      staffNumber: input.staffNumber ?? null,
      position: input.position ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
    };
    if (!staffId) {
      const id = uuidv7();
      await db.insert(staff).values({ id, schoolId: ctx.school.id, ...values });
      await recordActivity(ctx, { action: "staff.created", entityType: "staff", entityId: id, subject: fullName(input) });
      return id;
    }
    const [current] = await db
      .select()
      .from(staff)
      .where(and(eq(staff.schoolId, ctx.school.id), eq(staff.id, staffId), isNull(staff.deletedAt)));
    if (!current) throw new UserFacingError("Staff member not found.");
    await db.update(staff).set(values).where(eq(staff.id, staffId));
    await recordActivity(ctx, {
      action: "staff.updated",
      entityType: "staff",
      entityId: staffId,
      subject: fullName(input),
      changes: diffFields(current, values, ["phone", "email"]),
    });
    return staffId;
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/staff`);
  return { ok: true, redirectTo: `/s/${slug}/staff/${result.data}` };
}

// Invites a staff member to sign in. They accept by signing in with this email
// once Clerk has verified it (see server/claims.ts).
export async function inviteStaff(slug: string, staffId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "staff.manage", async (ctx) => {
    const raw = formToObject(form);
    const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")).parse(raw.email);
    const access = parseAccess(raw);
    if (!canManageRole(ctx.membership.role, access.role)) {
      throw new UserFacingError("Only an owner can invite another owner.");
    }
    const db = getDb();
    const [member] = await db
      .select()
      .from(staff)
      .where(and(eq(staff.schoolId, ctx.school.id), eq(staff.id, staffId), isNull(staff.deletedAt)));
    if (!member) throw new UserFacingError("Staff member not found.");

    const permissions = permissionsFrom(access);
    await db.transaction(async (tx) => {
      // Re-inviting replaces any open invite for the same email.
      await tx
        .delete(invites)
        .where(
          and(
            eq(invites.schoolId, ctx.school.id),
            sql`lower(${invites.email}) = ${email}`,
            isNull(invites.acceptedAt),
          ),
        );
      await tx.insert(invites).values({
        id: uuidv7(),
        schoolId: ctx.school.id,
        email,
        role: access.role,
        permissions,
        staffId,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        invitedBy: ctx.user.id,
      });
      if (!member.email) await tx.update(staff).set({ email }).where(eq(staff.id, staffId));
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const sent = await sendEmail({
      schoolName: ctx.school.name,
      replyTo: ctx.school.email,
      to: email,
      subject: `You've been invited to ${ctx.school.name} on SchoolOS`,
      text: [
        `Hello ${member.firstName},`,
        "",
        `${ctx.user.name ?? "Your school"} has invited you to ${ctx.school.name} on SchoolOS.`,
        "",
        `Sign in or create an account with this email address (${email}) at:`,
        `${appUrl}/sign-in`,
        "",
        "The invitation expires in 14 days.",
      ].join("\n"),
    });

    await recordActivity(ctx, {
      action: "staff.invited",
      entityType: "staff",
      entityId: staffId,
      subject: fullName(member),
      meta: { role: access.role, preset: access.preset, emailSent: sent.ok },
    });
    return sent.ok;
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/staff/${staffId}`);
  return {
    ok: true,
    message: result.data
      ? "Invitation sent."
      : "Invitation saved, but the email could not be sent. Ask them to sign in with that email address.",
  };
}

export async function updateAccess(
  slug: string,
  membershipId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "staff.manage", async (ctx) => {
    const raw = formToObject(form);
    const access = parseAccess(raw);
    if (membershipId === ctx.membership.id) throw new UserFacingError("You can't change your own access.");
    const db = getDb();
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.schoolId, ctx.school.id), eq(memberships.id, membershipId)))
        .for("update");
      const subject = await memberLabel(current?.userId);
      if (!current) throw new UserFacingError("Login not found.");
      if (!canManageRole(ctx.membership.role, current.role) || !canManageRole(ctx.membership.role, access.role)) {
        throw new UserFacingError("Only an owner can change an owner's access.");
      }
      const permissions = permissionsFrom(access);
      await tx.update(memberships).set({ role: access.role, permissions }).where(eq(memberships.id, membershipId));
      await recordActivity(ctx, {
        action: "staff.access_changed",
        entityType: "membership",
        entityId: membershipId,
        subject,
        changes: [
          { field: "role", before: current.role, after: access.role },
          { field: "permissions", before: current.permissions, after: permissions },
        ],
      });
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/staff`);
  return { ok: true, message: "Access updated." };
}

export async function revokeAccess(slug: string, membershipId: string): Promise<void> {
  await schoolAction(slug, "staff.manage", async (ctx) => {
    if (membershipId === ctx.membership.id) throw new UserFacingError("You can't remove your own access.");
    const db = getDb();
    const [current] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.schoolId, ctx.school.id), eq(memberships.id, membershipId)));
    if (!current || !canManageRole(ctx.membership.role, current.role)) return;
    await db
      .update(memberships)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(memberships.id, membershipId));
    await recordActivity(ctx, {
      action: "staff.access_revoked",
      entityType: "membership",
      entityId: membershipId,
      subject: await memberLabel(current.userId),
      meta: { role: current.role },
    });
  });
  revalidatePath(`/s/${slug}/staff`);
}

async function memberLabel(userId: string | undefined): Promise<string> {
  if (!userId) return "Unknown user";
  const [user] = await getDb()
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return user?.name ?? "Unnamed user";
}
