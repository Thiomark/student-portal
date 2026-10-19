import { z } from "zod";
import { checkbox } from "./common";

// Academic setup: years, grades, classes and subjects.

const optionalText = (max = 200) => z.string().trim().max(max).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const academicYearInput = z
  .object({
    name: z.string().trim().min(1, "Required").max(50),
    startsOn: isoDate,
    endsOn: isoDate,
    isCurrent: checkbox,
  })
  .refine((y) => y.endsOn > y.startsOn, { path: ["endsOn"], message: "Must be after the start date" });

export const gradeInput = z.object({
  name: z.string().trim().min(1, "Required").max(50),
  sortOrder: z.coerce.number().int("Whole number").min(0).max(9999).default(0),
});

export const classGroupInput = z.object({
  name: z.string().trim().min(1, "Required").max(50),
  gradeId: z.uuid("Pick a grade"),
  teacherId: z.uuid().optional(),
  room: optionalText(50),
});

export const subjectInput = z.object({
  name: z.string().trim().min(1, "Required").max(100),
  code: optionalText(20),
});
