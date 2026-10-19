import "server-only";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AppUser } from "@/lib/auth/context";
import { uuidv7 } from "@/lib/ids";

const RANK = { staff: 1, admin: 2, owner: 3 } as const;

// Turns open invites for this person's verified email into memberships. An
// existing higher role is kept.
export async function claimInvites(user: AppUser): Promise<void> {
  if (!user.email) return;
  const db = getDb();
  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(schema.invites)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          sql`lower(${schema.invites.email}) = ${user.email}`,
          isNull(schema.invites.acceptedAt),
          gt(schema.invites.expiresAt, new Date()),
        ),
      )
      .returning();

    for (const invite of claimed) {
      const [existing] = await tx
        .select()
        .from(schema.memberships)
        .where(and(eq(schema.memberships.userId, user.id), eq(schema.memberships.schoolId, invite.schoolId)))
        .for("update");

      if (!existing) {
        await tx.insert(schema.memberships).values({
          id: uuidv7(),
          userId: user.id,
          schoolId: invite.schoolId,
          role: invite.role,
          permissions: invite.permissions,
          staffId: invite.staffId,
          grantedBy: invite.invitedBy,
        });
      } else if (existing.status === "revoked" || RANK[invite.role] > RANK[existing.role]) {
        await tx
          .update(schema.memberships)
          .set({
            role: RANK[invite.role] > RANK[existing.role] ? invite.role : existing.role,
            permissions: invite.permissions,
            status: "active",
            revokedAt: null,
            staffId: invite.staffId ?? existing.staffId,
            grantedBy: invite.invitedBy,
          })
          .where(eq(schema.memberships.id, existing.id));
      }

      if (invite.staffId) {
        await tx
          .update(schema.staff)
          .set({ userId: user.id })
          .where(and(eq(schema.staff.id, invite.staffId), eq(schema.staff.schoolId, invite.schoolId)));
      }

      await tx.insert(schema.activityEvents).values({
        id: uuidv7(),
        schoolId: invite.schoolId,
        actorUserId: user.id,
        actorName: user.name ?? user.email,
        actorRole: invite.role,
        action: "staff.invite_accepted",
        area: "staff",
        entityType: "invite",
        entityId: invite.id,
        subject: user.name ?? "Invited user",
      });
    }
  });
}

// Links guardian records to this login when the school has the same verified
// email or cellphone on file. A parent with children at two schools ends up
// linked to both.
export async function claimGuardianRecords(user: AppUser): Promise<void> {
  const matchers = [];
  if (user.email) {
    matchers.push(and(eq(schema.guardianContacts.kind, "email"), eq(schema.guardianContacts.value, user.email)));
  }
  if (user.phone) {
    matchers.push(and(eq(schema.guardianContacts.kind, "phone"), eq(schema.guardianContacts.value, user.phone)));
  }
  if (matchers.length === 0) return;

  const db = getDb();
  const matches = await db
    .selectDistinct({ guardianId: schema.guardianContacts.guardianId, schoolId: schema.guardianContacts.schoolId })
    .from(schema.guardianContacts)
    .innerJoin(schema.guardians, eq(schema.guardians.id, schema.guardianContacts.guardianId))
    .where(
      and(
        or(...matchers),
        isNull(schema.guardianContacts.deletedAt),
        isNull(schema.guardians.deletedAt),
        isNull(schema.guardians.userId),
      ),
    );
  if (matches.length === 0) return;

  const linked = await db
    .update(schema.guardians)
    .set({ userId: user.id })
    .where(
      and(
        inArray(
          schema.guardians.id,
          matches.map((m) => m.guardianId),
        ),
        isNull(schema.guardians.userId),
      ),
    )
    .returning({ id: schema.guardians.id, schoolId: schema.guardians.schoolId });

  if (linked.length > 0) {
    await db.insert(schema.activityEvents).values(
      linked.map((g) => ({
        id: uuidv7(),
        schoolId: g.schoolId,
        actorUserId: user.id,
        actorName: user.name,
        actorRole: "guardian",
        action: "guardians.portal_linked",
        area: "guardians",
        entityType: "guardian",
        entityId: g.id,
        subject: user.name ?? "Parent portal sign-in",
      })),
    );
  }
}
