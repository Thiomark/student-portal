import { z } from "zod";

// Shared by server actions and forms.

const optionalText = (max = 200) => z.string().trim().max(max).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "Pick a date and time")
  .transform((v) => v.slice(0, 16));

// A Rand amount typed by a person ("R1 250.50", "1250,5") → integer cents.
// Parsed as text so no float rounding creeps in.
export const rands = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const cleaned = v.replace(/^r/i, "").replace(/[\s ]/g, "");
    const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(cleaned);
    if (!m) {
      ctx.addIssue({ code: "custom", message: "Enter an amount in Rand, e.g. 150 or 150.50" });
      return z.NEVER;
    }
    return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  });

export const TRIP_STATUSES = ["planned", "confirmed", "completed", "cancelled"] as const;
export const CONSENT_VALUES = ["pending", "given", "declined"] as const;
export const PAYMENT_METHODS = ["cash", "eft", "card", "other"] as const;

export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: "Cash",
  eft: "EFT",
  card: "Card",
  other: "Other",
};

export const tripInput = z
  .object({
    title: z.string().trim().min(1, "Required").max(200),
    destination: optionalText(200),
    departsAt: localDateTime,
    returnsAt: localDateTime.optional(),
    cost: rands.optional(),
    paymentDueOn: isoDate.optional(),
    status: z.enum(TRIP_STATUSES).default("planned"),
    notes: optionalText(5000),
    "gradeIds[]": z.array(z.uuid()).max(50).default([]),
  })
  .transform(({ "gradeIds[]": gradeIds, cost, ...rest }) => ({ ...rest, costCents: cost ?? 0, gradeIds }))
  .refine((t) => !t.returnsAt || t.returnsAt >= t.departsAt, {
    path: ["returnsAt"],
    message: "Must be after departure",
  });

export const paymentInput = z.object({
  amount: rands.refine((c) => c > 0, "Must be more than zero"),
  method: z.enum(PAYMENT_METHODS, "Pick a method"),
  reference: optionalText(100),
});

export const consentInput = z.object({
  consent: z.enum(CONSENT_VALUES),
});

export const attendedInput = z.object({
  attended: z.enum(["yes", "no", ""]).optional(),
});
