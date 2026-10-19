import { z } from "zod";
import { checkbox } from "./common";
import { toE164 } from "@/lib/phone";

// Shared by server actions and offline forms.

const optionalText = (max = 200) => z.string().trim().max(max).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const learnerInput = z.object({
  firstName: z.string().trim().min(1, "Required").max(100),
  lastName: z.string().trim().min(1, "Required").max(100),
  preferredName: optionalText(100),
  admissionNumber: optionalText(50),
  dateOfBirth: isoDate.optional(),
  gender: z.enum(["female", "male", "other"]).optional(),
  idNumber: optionalText(30),
  homeLanguage: optionalText(50),
  medicalNotes: optionalText(2000),
  notes: optionalText(2000),
  status: z.enum(["active", "transferred", "graduated", "left"]).default("active"),
  classGroupId: z.uuid().optional(),
});
export type LearnerInput = z.infer<typeof learnerInput>;

export const RELATIONSHIPS = [
  "mother",
  "father",
  "guardian",
  "grandparent",
  "sibling",
  "foster_parent",
  "other",
] as const;

export const guardianInput = z.object({
  title: optionalText(20),
  firstName: z.string().trim().min(1, "Required").max(100),
  lastName: z.string().trim().min(1, "Required").max(100),
  idNumber: optionalText(30),
  occupation: optionalText(100),
  address: optionalText(500),
  preferredChannel: z.enum(["whatsapp", "sms", "call", "email", "letter"]).optional(),
  notes: optionalText(2000),
});

export const phoneContactInput = z
  .object({
    value: z.string().trim().min(1, "Required"),
    label: optionalText(40),
    whatsapp: checkbox,
    sms: checkbox,
    voice: checkbox,
    isPrimary: checkbox,
  })
  .transform((c, ctx) => {
    const e164 = toE164(c.value);
    if (!e164) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a valid phone number, e.g. 082 123 4567" });
      return z.NEVER;
    }
    if (!c.whatsapp && !c.sms && !c.voice) {
      ctx.addIssue({ code: "custom", path: ["whatsapp"], message: "Tick at least one: WhatsApp, SMS or calls" });
      return z.NEVER;
    }
    return { ...c, kind: "phone" as const, value: e164 };
  });

export const emailContactInput = z.object({
  value: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
  label: optionalText(40),
  isPrimary: checkbox,
});

export const linkInput = z.object({
  relationship: z.enum(RELATIONSHIPS),
  isPrimary: checkbox,
  livesWith: checkbox,
  canCollect: checkbox,
  receivesNotices: checkbox,
});

export const RELATIONSHIP_LABELS: Record<(typeof RELATIONSHIPS)[number], string> = {
  mother: "Mother",
  father: "Father",
  guardian: "Guardian",
  grandparent: "Grandparent",
  sibling: "Sibling",
  foster_parent: "Foster parent",
  other: "Other",
};
