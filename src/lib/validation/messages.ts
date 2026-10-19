import { z } from "zod";

// Shared by server actions and forms.

export const MESSAGE_STATUSES = ["needs_action", "failed", "queued", "sent", "delivered", "read", "done"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  needs_action: "Needs action",
  failed: "Failed",
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  done: "Done",
};

export const AUDIENCES = ["class", "grade", "all"] as const;
export type Audience = (typeof AUDIENCES)[number];

// Larger sends must be split (by grade or class) so one request can't run for
// an hour or flood the school's WhatsApp number.
export const MAX_BROADCAST_GUARDIANS = 2000;

export const audienceInput = z
  .object({
    audience: z.enum(AUDIENCES),
    classGroupId: z.uuid().optional(),
    gradeId: z.uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.audience === "class" && !v.classGroupId) {
      ctx.addIssue({ code: "custom", path: ["classGroupId"], message: "Pick a class" });
    }
    if (v.audience === "grade" && !v.gradeId) {
      ctx.addIssue({ code: "custom", path: ["gradeId"], message: "Pick a grade" });
    }
  })
  // Both selects submit; keep only the one the audience uses.
  .transform((v) => ({
    audience: v.audience,
    classGroupId: v.audience === "class" ? v.classGroupId : undefined,
    gradeId: v.audience === "grade" ? v.gradeId : undefined,
  }));
export type AudienceInput = z.infer<typeof audienceInput>;

export const broadcastInput = z.object({
  subject: z.string().trim().min(1, "Required").max(150),
  text: z.string().trim().min(1, "Required").max(3000),
});
