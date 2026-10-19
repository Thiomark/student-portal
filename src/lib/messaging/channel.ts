// Picks how to reach a guardian. Pure, so it is unit tested and can run on an
// offline device to show "will go by WhatsApp / needs a letter" before sending.

export type Channel = "whatsapp" | "sms" | "call" | "email" | "letter";

export type ContactPoint = {
  kind: "phone" | "email";
  value: string;
  whatsapp: boolean;
  sms: boolean;
  voice: boolean;
  isPrimary: boolean;
};

export type Route = { channel: Channel; recipient: string | null; automatic: boolean };

// WhatsApp and email go out automatically. SMS has no provider yet, and calls
// and letters are done by a person, so those become office to-dos.
const AUTOMATIC: ReadonlySet<Channel> = new Set(["whatsapp", "email"]);
const FALLBACK_ORDER: Channel[] = ["whatsapp", "email", "sms", "call"];

function supports(c: ContactPoint, channel: Channel): boolean {
  switch (channel) {
    case "whatsapp":
      return c.kind === "phone" && c.whatsapp;
    case "sms":
      return c.kind === "phone" && c.sms;
    case "call":
      return c.kind === "phone" && c.voice;
    case "email":
      return c.kind === "email";
    case "letter":
      return false;
  }
}

export function chooseRoute(contacts: ContactPoint[], preferred?: Channel | null): Route {
  const ordered = [...contacts].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const tryChannel = (channel: Channel): Route | null => {
    const hit = ordered.find((c) => supports(c, channel));
    return hit ? { channel, recipient: hit.value, automatic: AUTOMATIC.has(channel) } : null;
  };

  if (preferred === "letter") return { channel: "letter", recipient: null, automatic: false };
  if (preferred) {
    const route = tryChannel(preferred);
    if (route) return route;
  }
  for (const channel of FALLBACK_ORDER) {
    const route = tryChannel(channel);
    if (route) return route;
  }
  // No usable phone or email: print a letter for the learner to take home.
  return { channel: "letter", recipient: null, automatic: false };
}

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  call: "Phone call",
  email: "Email",
  letter: "Printed letter",
};
