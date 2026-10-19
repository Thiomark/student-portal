// Suggestions for moving classes into the next academic year. Pure, so the
// rollover page and its tests agree on what "8A next year" means.

export type RolloverGrade = { id: string; name: string; sortOrder: number };
export type RolloverClass = { id: string; name: string; gradeId: string };

// promote: into the next grade; repeat: same grade again (a whole class held
// back is rare, but it happens); graduate: leaves the school; skip: learners
// stay unplaced for the office to sort out.
export type RolloverAction = "promote" | "repeat" | "graduate" | "skip";

export type ClassPlan = {
  classId: string;
  action: RolloverAction;
  targetGradeId: string | null;
  targetName: string | null;
};

// The grade's short token: "Grade 8" → "8", "Grade R" → "R", "Gr. 10" → "10".
export function gradeToken(gradeName: string): string | null {
  const m = gradeName.trim().match(/(\d+|R)\s*$/i);
  return m ? m[1].toUpperCase() : null;
}

// "8A" in Grade 8 → "9A" in Grade 9. Names that don't start with the grade
// token (e.g. "Blue", "Mrs Smith") keep their name.
export function nextClassName(className: string, fromGrade: string, toGrade: string): string {
  const from = gradeToken(fromGrade);
  const to = gradeToken(toGrade);
  if (!from || !to) return className;
  const m = className.match(/^(\d+|R)(.*)$/i);
  if (!m || m[1].toUpperCase() !== from) return className;
  return `${to}${m[2]}`;
}

export function suggestPlans(classes: RolloverClass[], grades: RolloverGrade[]): ClassPlan[] {
  const ordered = [...grades].sort((a, b) => a.sortOrder - b.sortOrder);
  return classes.map((c) => {
    const index = ordered.findIndex((g) => g.id === c.gradeId);
    const next = index >= 0 ? ordered[index + 1] : undefined;
    if (!next) return { classId: c.id, action: "graduate", targetGradeId: null, targetName: null };
    return {
      classId: c.id,
      action: "promote",
      targetGradeId: next.id,
      targetName: nextClassName(c.name, ordered[index].name, next.name),
    };
  });
}

// "2026" → "2027"; anything else gets no suggestion.
export function nextYearName(name: string): string {
  return /^\d{4}$/.test(name) ? String(Number(name) + 1) : "";
}

export function shiftYear(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  // 29 Feb rolls to 28 Feb.
  const date = new Date(Date.UTC(y + 1, m - 1, Math.min(d, m === 2 ? 28 : d)));
  return date.toISOString().slice(0, 10);
}
