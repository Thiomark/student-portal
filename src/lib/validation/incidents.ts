import { z } from "zod";

// Shared by server actions and forms.

export const INCIDENT_CATEGORIES = [
  "behaviour",
  "bullying",
  "injury",
  "health",
  "academic",
  "uniform",
  "attendance",
  "property",
  "other",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const INCIDENT_CATEGORY_LABELS: Record<IncidentCategory, string> = {
  behaviour: "Behaviour",
  bullying: "Bullying",
  injury: "Injury",
  health: "Health",
  academic: "Academic",
  uniform: "Uniform",
  attendance: "Attendance",
  property: "Property",
  other: "Other",
};

export const INCIDENT_SEVERITIES = ["low", "medium", "high"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = ["open", "resolved"] as const;

const optionalText = (max = 200) => z.string().trim().max(max).optional();

// <input type="datetime-local"> without seconds, in the school's timezone.
export const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "Pick a date and time")
  .transform((v) => v.slice(0, 16));

export const incidentFields = z.object({
  occurredAt: localDateTime,
  category: z.enum(INCIDENT_CATEGORIES, "Pick a category"),
  severity: z.enum(INCIDENT_SEVERITIES).default("low"),
  description: z.string().trim().min(1, "Describe what happened").max(5000),
  actionTaken: optionalText(5000),
});

export const incidentInput = incidentFields.extend({
  learnerId: z.uuid("Pick a learner"),
});

export const resolveIncidentInput = z.object({
  actionTaken: z.string().trim().min(1, "Say what was done").max(5000),
});

export const notifyIncidentInput = z.object({
  subject: z.string().trim().min(1, "Required").max(200),
  text: z.string().trim().min(1, "Write the message").max(3000),
});
