import { describe, expect, it } from "vitest";
import { localInputToDate, toLocalInput } from "./format";
import { isUuid, uuidv7 } from "./ids";

describe("school-timezone datetime inputs", () => {
  it("reads 09:00 in Johannesburg as 07:00 UTC", () => {
    expect(localInputToDate("2027-03-15T09:00", "Africa/Johannesburg").toISOString()).toBe("2027-03-15T07:00:00.000Z");
  });
  it("round-trips", () => {
    const date = new Date("2027-03-15T07:00:00Z");
    expect(toLocalInput(date, "Africa/Johannesburg")).toBe("2027-03-15T09:00");
  });
});

describe("uuidv7", () => {
  it("is a valid, time-ordered uuid", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe("7");
    expect(a < b).toBe(true);
  });
});
