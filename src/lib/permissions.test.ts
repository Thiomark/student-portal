import { describe, expect, it } from "vitest";
import { CAPABILITIES, canManageRole, resolveCapabilities, STAFF_PRESETS } from "./permissions";

describe("resolveCapabilities", () => {
  it("gives owners and admins everything", () => {
    expect(resolveCapabilities("owner")).toEqual([...CAPABILITIES]);
    expect(resolveCapabilities("admin")).toEqual([...CAPABILITIES]);
  });

  it("starts staff from their preset and applies grants and revokes", () => {
    const caps = resolveCapabilities("staff", {
      preset: "teacher",
      grant: ["trips.payments"],
      revoke: ["messages.send"],
    });
    expect(caps).toContain("textbooks.issue");
    expect(caps).toContain("trips.payments");
    expect(caps).not.toContain("messages.send");
  });

  it("never lets a grant reach staff management or settings", () => {
    const caps = resolveCapabilities("staff", { preset: "none", grant: ["staff.manage", "school.settings"] });
    expect(caps).toEqual([]);
  });

  it("ignores unknown capability names and presets", () => {
    const caps = resolveCapabilities("staff", { preset: "superuser", grant: ["everything", "learners.manage"] });
    expect(caps).toEqual(expect.arrayContaining([...STAFF_PRESETS.teacher, "learners.manage"]));
    expect(caps).not.toContain("everything");
  });

  it("gives an unknown role nothing", () => {
    expect(resolveCapabilities("guardian" as never)).toEqual([]);
  });
});

describe("canManageRole", () => {
  it("lets admins manage staff and admins but not owners", () => {
    expect(canManageRole("admin", "staff")).toBe(true);
    expect(canManageRole("admin", "admin")).toBe(true);
    expect(canManageRole("admin", "owner")).toBe(false);
    expect(canManageRole("owner", "owner")).toBe(true);
    expect(canManageRole("staff", "staff")).toBe(false);
  });
});
