import { describe, expect, it } from "vitest";
import { chooseRoute, type ContactPoint } from "./channel";

const phone = (value: string, caps: Partial<ContactPoint> = {}): ContactPoint => ({
  kind: "phone",
  value,
  whatsapp: false,
  sms: false,
  voice: false,
  isPrimary: false,
  ...caps,
});
const email = (value: string, isPrimary = false): ContactPoint => ({
  kind: "email",
  value,
  whatsapp: false,
  sms: false,
  voice: false,
  isPrimary,
});

describe("chooseRoute", () => {
  it("prefers WhatsApp, then email", () => {
    expect(chooseRoute([email("a@b.co"), phone("+27821234567", { whatsapp: true })])).toEqual({
      channel: "whatsapp",
      recipient: "+27821234567",
      automatic: true,
    });
    expect(chooseRoute([phone("+27821234567", { voice: true }), email("a@b.co")]).channel).toBe("email");
  });

  it("honours the guardian's preference when they can be reached that way", () => {
    const contacts = [phone("+27821234567", { whatsapp: true }), email("a@b.co")];
    expect(chooseRoute(contacts, "email").channel).toBe("email");
    // Prefers SMS but has no SMS-capable number: fall back.
    expect(chooseRoute(contacts, "sms").channel).toBe("whatsapp");
  });

  it("uses the primary number first", () => {
    const route = chooseRoute([
      phone("+27820000001", { whatsapp: true }),
      phone("+27820000002", { whatsapp: true, isPrimary: true }),
    ]);
    expect(route.recipient).toBe("+27820000002");
  });

  it("turns a landline into a phone call for the office", () => {
    expect(chooseRoute([phone("+27115550000", { voice: true })])).toEqual({
      channel: "call",
      recipient: "+27115550000",
      automatic: false,
    });
  });

  it("prints a letter when there is no way to reach the parent", () => {
    expect(chooseRoute([])).toEqual({ channel: "letter", recipient: null, automatic: false });
    expect(chooseRoute([phone("+27821234567", { whatsapp: true })], "letter").channel).toBe("letter");
  });
});
