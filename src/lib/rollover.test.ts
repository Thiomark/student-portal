import { describe, expect, it } from "vitest";
import { gradeToken, nextClassName, nextYearName, shiftYear, suggestPlans } from "./rollover";

describe("class names next year", () => {
  it("reads grade tokens", () => {
    expect(gradeToken("Grade 8")).toBe("8");
    expect(gradeToken("Grade R")).toBe("R");
    expect(gradeToken("Gr. 10")).toBe("10");
    expect(gradeToken("Reception")).toBeNull();
  });

  it("moves the grade number on and keeps the rest", () => {
    expect(nextClassName("8A", "Grade 8", "Grade 9")).toBe("9A");
    expect(nextClassName("9 Blue", "Grade 9", "Grade 10")).toBe("10 Blue");
    expect(nextClassName("RB", "Grade R", "Grade 1")).toBe("1B");
    expect(nextClassName("Mrs Smith", "Grade 3", "Grade 4")).toBe("Mrs Smith");
    // "10A" is not a Grade 1 class name.
    expect(nextClassName("10A", "Grade 1", "Grade 2")).toBe("10A");
  });
});

describe("suggestPlans", () => {
  const grades = [
    { id: "g9", name: "Grade 9", sortOrder: 1 },
    { id: "g8", name: "Grade 8", sortOrder: 0 },
  ];
  it("promotes to the next grade and graduates the top grade", () => {
    expect(
      suggestPlans(
        [
          { id: "c8a", name: "8A", gradeId: "g8" },
          { id: "c9a", name: "9A", gradeId: "g9" },
        ],
        grades,
      ),
    ).toEqual([
      { classId: "c8a", action: "promote", targetGradeId: "g9", targetName: "9A" },
      { classId: "c9a", action: "graduate", targetGradeId: null, targetName: null },
    ]);
  });
});

describe("year helpers", () => {
  it("suggests the next year", () => {
    expect(nextYearName("2026")).toBe("2027");
    expect(nextYearName("2026/27")).toBe("");
    expect(shiftYear("2026-01-14")).toBe("2027-01-14");
    expect(shiftYear("2028-02-29")).toBe("2029-02-28");
  });
});
