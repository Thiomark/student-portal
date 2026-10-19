import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const { staff, memberships, users, invites } = schema;

export async function listStaff(schoolId: string) {
  return getDb()
    .select({ staff, membership: memberships })
    .from(staff)
    .leftJoin(
      memberships,
      and(eq(memberships.staffId, staff.id), eq(memberships.schoolId, schoolId), eq(memberships.status, "active")),
    )
    .where(and(eq(staff.schoolId, schoolId), isNull(staff.deletedAt)))
    .orderBy(asc(staff.lastName), asc(staff.firstName));
}

// Everyone who can sign in to the school, with or without a staff record.
export async function listLogins(schoolId: string) {
  return getDb()
    .select({ membership: memberships, user: { name: users.name, email: users.email } })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.schoolId, schoolId), eq(memberships.status, "active")))
    .orderBy(asc(users.name));
}

export async function getStaffMember(schoolId: string, staffId: string) {
  const [row] = await getDb()
    .select()
    .from(staff)
    .where(and(eq(staff.schoolId, schoolId), eq(staff.id, staffId), isNull(staff.deletedAt)));
  return row ?? null;
}

export async function getMembershipForStaff(schoolId: string, staffId: string) {
  const [row] = await getDb()
    .select({ membership: memberships, user: { name: users.name, email: users.email } })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(eq(memberships.schoolId, schoolId), eq(memberships.staffId, staffId), eq(memberships.status, "active")),
    );
  return row ?? null;
}

export async function getOpenInvite(schoolId: string, staffId: string) {
  const [row] = await getDb()
    .select()
    .from(invites)
    .where(and(eq(invites.schoolId, schoolId), eq(invites.staffId, staffId), isNull(invites.acceptedAt)));
  return row ?? null;
}

export async function getMembership(schoolId: string, membershipId: string) {
  const [row] = await getDb()
    .select({ membership: memberships, user: { name: users.name, email: users.email } })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.schoolId, schoolId), eq(memberships.id, membershipId)));
  return row ?? null;
}
