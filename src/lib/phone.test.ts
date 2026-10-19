import { describe, expect, it } from "vitest";
import { maskPhone, toE164 } from "./phone";

describe("toE164", () => {
  it("reads South African local numbers", () => {
    expect(toE164("082 123 4567")).toBe("+27821234567");
    expect(toE164("(011) 555-0000")).toBe("+27115550000");
  });
  it("keeps international numbers", () => {
    expect(toE164("+27 82 123 4567")).toBe("+27821234567");
    expect(toE164("0026771234567")).toBe("+26771234567");
    expect(toE164("27821234567")).toBe("+27821234567");
  });
  it("rejects junk", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("12345")).toBeNull();
    expect(toE164("abc")).toBeNull();
  });
});

describe("maskPhone", () => {
  it("hides the middle of the number", () => {
    expect(maskPhone("+27821234567")).toBe("+278***567");
  });
});
