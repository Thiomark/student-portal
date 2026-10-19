import { z } from "zod";

// Textbook titles and copies. Issuing and returning live with the textbook
// desk; these schemas only cover stock management.

const optionalText = (max = 200) => z.string().trim().max(max).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const BOOK_CONDITIONS = ["new", "good", "fair", "poor", "damaged"] as const;
export type BookCondition = (typeof BOOK_CONDITIONS)[number];

export const COPY_STATUSES = ["available", "issued", "lost", "written_off"] as const;
export type CopyStatus = (typeof COPY_STATUSES)[number];

export const COPY_STATUS_LABELS: Record<CopyStatus, string> = {
  available: "Available",
  issued: "Issued",
  lost: "Lost",
  written_off: "Written off",
};

export const MAX_COPIES_PER_BATCH = 1000;

export const textbookTitleInput = z.object({
  title: z.string().trim().min(1, "Required").max(200),
  subjectId: z.uuid().optional(),
  gradeId: z.uuid().optional(),
  isbn: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9Xx -]*$/, "Digits only, e.g. 978-0-123456-47-2")
    .optional(),
  publisher: optionalText(100),
  edition: optionalText(50),
});
export type TextbookTitleInput = z.infer<typeof textbookTitleInput>;

// Copy numbers are stored upper-case: the desk matches them case-insensitively
// and the unique index is on upper(copy_number), so this keeps what's shown
// consistent with what's matched.
const copyNumber = z
  .string()
  .trim()
  .min(1, "Required")
  .max(40)
  .transform((v) => v.replace(/\s+/g, " ").toUpperCase());

const wholeNumber = (min: number, max: number) =>
  z.coerce.number().int("Whole number").min(min, `At least ${min}`).max(max, `At most ${max}`);

export const addCopiesInput = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("single"),
    copyNumber,
    condition: z.enum(BOOK_CONDITIONS).default("new"),
    acquiredOn: isoDate.optional(),
  }),
  z
    .object({
      mode: z.literal("range"),
      prefix: z
        .string()
        .trim()
        .max(30)
        .transform((v) => v.toUpperCase())
        .optional(),
      start: wholeNumber(0, 999_999),
      end: wholeNumber(0, 999_999),
      width: wholeNumber(0, 10).default(0),
      condition: z.enum(BOOK_CONDITIONS).default("new"),
      acquiredOn: isoDate.optional(),
    })
    .superRefine((r, ctx) => {
      if (r.end < r.start) {
        ctx.addIssue({ code: "custom", path: ["end"], message: "Must be the same as or after the first number" });
      } else if (r.end - r.start + 1 > MAX_COPIES_PER_BATCH) {
        ctx.addIssue({
          code: "custom",
          path: ["end"],
          message: `At most ${MAX_COPIES_PER_BATCH} copies at a time`,
        });
      }
    }),
]);
export type AddCopiesInput = z.infer<typeof addCopiesInput>;

// "MATH8-", 1, 120, 3 → MATH8-001 … MATH8-120.
export function expandCopyRange(prefix: string, start: number, end: number, width: number): string[] {
  const out: string[] = [];
  for (let n = start; n <= end; n++) out.push(`${prefix}${String(n).padStart(width, "0")}`);
  return out;
}

export function copyNumbersFor(input: AddCopiesInput): string[] {
  return input.mode === "single"
    ? [input.copyNumber]
    : expandCopyRange(input.prefix ?? "", input.start, input.end, input.width);
}

export const copyUpdateInput = z.object({
  condition: z.enum(BOOK_CONDITIONS),
  acquiredOn: isoDate.optional(),
  notes: optionalText(1000),
});

export const copyStatusInput = z.object({
  status: z.enum(["lost", "written_off", "available"]),
  notes: optionalText(1000),
});
