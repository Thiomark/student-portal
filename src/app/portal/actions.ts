"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/context";
import { respondToMeeting, setTripConsent } from "@/server/portal";

export type PortalResult = { ok: true } | { ok: false; error: string };

const answer = z.enum(["yes", "no"]);

export async function answerMeeting(attendeeId: string, reply: "yes" | "no"): Promise<PortalResult> {
  try {
    const user = await requireUser();
    await respondToMeeting(user, z.uuid().parse(attendeeId), answer.parse(reply) === "yes" ? "accepted" : "declined");
    revalidatePath("/portal");
    return { ok: true };
  } catch (err) {
    return toActionError(err);
  }
}

export async function answerTrip(participantId: string, reply: "yes" | "no"): Promise<PortalResult> {
  try {
    const user = await requireUser();
    await setTripConsent(user, z.uuid().parse(participantId), answer.parse(reply) === "yes" ? "given" : "declined");
    revalidatePath("/portal");
    return { ok: true };
  } catch (err) {
    return toActionError(err);
  }
}
