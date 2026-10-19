import { describe, expect, it } from "vitest";
import { z } from "zod";
import { checkbox } from "./common";

describe("checkbox", () => {
  const form = z.object({ ticked: checkbox });
  it("reads an unticked (absent) checkbox as false", () => {
    expect(form.parse({})).toEqual({ ticked: false });
  });
  it("reads a ticked checkbox as true", () => {
    expect(form.parse({ ticked: "on" })).toEqual({ ticked: true });
  });
});
