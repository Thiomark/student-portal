import { z } from "zod";
import { checkbox } from "./common";

// Shared by server actions and forms.

const optionalText = (max = 200) => z.string().trim().max(max).optional();
// <input type="datetime-local">, read in the school's timezone by the action.
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time");
const uuidList = z.array(z.uuid()).max(200).default([]);

export const MEETING_MODES = ["in_person", "phone", "video"] as const;
export const MEETING_MODE_LABELS: Record<(typeof MEETING_MODES)[number], string> = {
  in_person: "In person",
  phone: "Phone call",
  video: "Video call",
};

export const MEETING_STATUS_LABELS = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
} as const;

export const MEETING_RESPONSES = ["pending", "accepted", "declined"] as const;

const meetingFields = {
  title: z.string().trim().min(1, "Required").max(200),
  purpose: optionalText(2000),
  durationMinutes: z.coerce.number().int().min(5, "At least 5 minutes").max(480, "At most 8 hours").default(30),
  location: optionalText(200),
  mode: z.enum(MEETING_MODES).default("in_person"),
  organiserStaffId: z.uuid().optional(),
  // Checkbox groups: formToObject turns "name[]" keys into arrays.
  "guardianIds[]": uuidList,
  "staffIds[]": uuidList,
};

export const meetingCreateInput = z.object({
  ...meetingFields,
  learnerId: z.uuid().optional(),
  scheduledAt: localDateTime,
  notify: checkbox,
});
export type MeetingCreateInput = z.infer<typeof meetingCreateInput>;

export const meetingUpdateInput = z.object(meetingFields);

// One minutes box with two buttons: "Save minutes" and "Save and mark
// completed" (the submit button sends intent=complete).
export const minutesInput = z.object({
  minutes: optionalText(20000),
  intent: z.enum(["save", "complete"]).default("save"),
});

export const cancelInput = z.object({
  reason: optionalText(500),
  notify: checkbox,
});

export const rescheduleInput = z.object({
  scheduledAt: localDateTime,
  notify: checkbox,
});

export const attendeeInput = z.object({
  response: z.enum(MEETING_RESPONSES),
  attended: z
    .enum(["yes", "no", "unknown"])
    .optional()
    .transform((v) => (v === "yes" ? true : v === "no" ? false : null)),
});
