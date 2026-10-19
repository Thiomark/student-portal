import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/db/client";
import { uuidv7 } from "@/lib/ids";
import { resolveCapabilities, type Capability, type Role } from "@/lib/permissions";

export type AppUser = typeof schema.users.$inferSelect;

export type SchoolContext = {
  user: AppUser;
  school: typeof schema.schools.$inferSelect;
  membership: { id: string; role: Role; staffId: string | null };
  capabilities: ReadonlySet<Capability>;
};

// The local user row for the signed-in Clerk identity, or null when signed
// out. Clerk is only asked for profile details the first time we see someone.
export const getUser = cache(async (): Promise<AppUser | null> => {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, clerkUserId))
    .limit(1);
  if (existing) return existing.disabledAt ? null : existing;

  const profile = await currentUser();
  if (!profile) return null;
  const email = profile.primaryEmailAddress;
  const phone = profile.primaryPhoneNumber;
  const [created] = await db
    .insert(schema.users)
    .values({
      id: uuidv7(),
      clerkUserId,
      // Only verified identifiers can claim invites or guardian records.
      email: email?.verification?.status === "verified" ? email.emailAddress.toLowerCase() : null,
      phone: phone?.verification?.status === "verified" ? phone.phoneNumber : null,
      name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null,
      imageUrl: profile.imageUrl,
    })
    .onConflictDoUpdate({ target: schema.users.clerkUserId, set: { updatedAt: new Date() } })
    .returning();
  return created;
});

export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}

// Resolves the school from the URL slug and the caller's membership in it.
// Anyone without an active membership gets a 404, so school slugs can't be
// probed.
export const getSchoolContext = cache(async (slug: string): Promise<SchoolContext> => {
  const user = await requireUser();
  const ctx = await loadSchoolContext(user, slug);
  if (!ctx) notFound();
  return ctx;
});

// Same lookup for route handlers, which answer with a status code instead of
// redirecting to sign-in or rendering a 404 page.
export async function getSchoolContextForApi(
  slug: string,
): Promise<{ ctx: SchoolContext } | { status: 401 | 404 }> {
  const user = await getUser();
  if (!user) return { status: 401 };
  const ctx = await loadSchoolContext(user, slug);
  return ctx ? { ctx } : { status: 404 };
}

async function loadSchoolContext(user: AppUser, slug: string): Promise<SchoolContext | null> {
  const [row] = await getDb()
    .select({ school: schema.schools, membership: schema.memberships })
    .from(schema.schools)
    .innerJoin(
      schema.memberships,
      and(
        eq(schema.memberships.schoolId, schema.schools.id),
        eq(schema.memberships.userId, user.id),
        eq(schema.memberships.status, "active"),
      ),
    )
    .where(eq(schema.schools.slug, slug))
    .limit(1);

  if (!row || row.school.status !== "active") return null;

  const role = row.membership.role;
  return {
    user,
    school: row.school,
    membership: { id: row.membership.id, role, staffId: row.membership.staffId },
    capabilities: new Set(resolveCapabilities(role, row.membership.permissions)),
  };
}

export function can(ctx: SchoolContext, capability: Capability): boolean {
  return ctx.capabilities.has(capability);
}

export class ForbiddenError extends Error {
  constructor(public readonly capability: Capability) {
    super(`Missing permission: ${capability}`);
  }
}

export function requireCapability(ctx: SchoolContext, capability: Capability): void {
  if (!can(ctx, capability)) throw new ForbiddenError(capability);
}

export async function listMySchools(userId: string) {
  return getDb()
    .select({
      id: schema.schools.id,
      slug: schema.schools.slug,
      name: schema.schools.name,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.schools, eq(schema.schools.id, schema.memberships.schoolId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.status, "active")))
    .orderBy(schema.schools.name);
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ userId: schema.platformAdmins.userId })
    .from(schema.platformAdmins)
    .where(eq(schema.platformAdmins.userId, userId))
    .limit(1);
  return Boolean(row);
}

// Guardian rows linked to this login, across every school.
export async function listMyGuardianLinks(userId: string) {
  return getDb()
    .select({ guardian: schema.guardians, school: schema.schools })
    .from(schema.guardians)
    .innerJoin(schema.schools, eq(schema.schools.id, schema.guardians.schoolId))
    .where(and(eq(schema.guardians.userId, userId), isNull(schema.guardians.deletedAt)));
}
