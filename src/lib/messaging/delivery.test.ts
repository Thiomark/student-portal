import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { uuidv7 } from "@/lib/ids";

const url = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = url;
process.env.DATABASE_DRIVER = "pg";
process.env.SECRETS_ENCRYPTION_KEY = "test-only-key-0123456789abcdef0123";
process.env.WHAPLE_API_URL = "http://whaple.test";

const { getDb, schema } = await import("@/db/client");
const { eq, inArray } = await import("drizzle-orm");
const { encryptSecret } = await import("@/lib/crypto");
const { backoffMs, deliverQueued, MAX_ATTEMPTS, refreshWhatsAppStatuses, requeueStuck } = await import("./delivery");

type Reply = { status: number; body: unknown };

describe.skipIf(!url)("message delivery worker", () => {
  const schoolId = uuidv7();
  const noKeySchoolId = uuidv7();
  let replies: Reply[];
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => {
    const reply = replies.shift() ?? { status: 202, body: { success: true, message: { id: "wa_1", status: "pending" } } };
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });

  beforeAll(async () => {
    const db = getDb();
    await db.insert(schema.schools).values([
      { id: schoolId, slug: `d-${schoolId.slice(-8)}`, name: "Delivery High" },
      { id: noKeySchoolId, slug: `n-${noKeySchoolId.slice(-8)}`, name: "No Key High" },
    ]);
    await db.insert(schema.schoolSecrets).values({ schoolId, whapleApiKey: encryptSecret("school-key") });
  });

  beforeEach(() => {
    replies = [];
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function queue(school = schoolId, extra: Partial<typeof schema.messages.$inferInsert> = {}) {
    const id = uuidv7();
    await getDb()
      .insert(schema.messages)
      .values({
        id,
        schoolId: school,
        channel: "whatsapp",
        recipient: "+27821234567",
        subject: "Sports day",
        body: "Friday",
        status: "queued",
        ...extra,
      });
    return id;
  }
  const row = async (id: string) =>
    (await getDb().select().from(schema.messages).where(eq(schema.messages.id, id)))[0];

  it("sends a queued WhatsApp with the school's key", async () => {
    const id = await queue();
    const report = await deliverQueued({ messageIds: [id] });
    expect(report).toMatchObject({ claimed: 1, sent: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("http://whaple.test/api/messages");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("school-key");
    expect(JSON.parse(String(init?.body))).toEqual({ number: "27821234567", message: "*Sports day*\n\nFriday" });
    expect(await row(id)).toMatchObject({ status: "sent", providerMessageId: "wa_1", attempts: 1, lockedAt: null });
  });

  it("retries temporary failures with backoff, then gives up", async () => {
    const id = await queue();
    replies = [{ status: 503, body: { success: false, error: "WhatsApp not connected" } }];
    expect(await deliverQueued({ messageIds: [id] })).toMatchObject({ retrying: 1 });
    const retrying = await row(id);
    expect(retrying.status).toBe("queued");
    expect(retrying.error).toBe("WhatsApp not connected");
    expect(retrying.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + backoffMs(1) - 5_000);

    // Not due yet: nothing is claimed.
    expect((await deliverQueued({ messageIds: [id] })).claimed).toBe(0);

    // Last allowed attempt fails too.
    await getDb()
      .update(schema.messages)
      .set({ nextAttemptAt: null, attempts: MAX_ATTEMPTS - 1 })
      .where(eq(schema.messages.id, id));
    replies = [{ status: 503, body: { success: false, error: "WhatsApp not connected" } }];
    expect(await deliverQueued({ messageIds: [id] })).toMatchObject({ failed: 1 });
    expect((await row(id)).status).toBe("failed");
  });

  it("fails permanent errors straight away", async () => {
    const id = await queue();
    replies = [{ status: 400, body: { success: false, error: "Invalid number" } }];
    expect(await deliverQueued({ messageIds: [id] })).toMatchObject({ failed: 1 });
    expect(await row(id)).toMatchObject({ status: "failed", error: "Invalid number", attempts: 1 });
  });

  it("hands WhatsApp to the office as a call when the school has no key", async () => {
    const id = await queue(noKeySchoolId);
    expect(await deliverQueued({ messageIds: [id] })).toMatchObject({ needsAction: 1 });
    expect(await row(id)).toMatchObject({ status: "needs_action", channel: "call" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never sends a message twice when two workers run at once", async () => {
    const ids = await Promise.all(Array.from({ length: 12 }, () => queue()));
    const [a, b] = await Promise.all([deliverQueued({ messageIds: ids }), deliverQueued({ messageIds: ids })]);
    expect(a.claimed + b.claimed).toBe(12);
    expect(fetchMock).toHaveBeenCalledTimes(12);
    const rows = await getDb().select().from(schema.messages).where(inArray(schema.messages.id, ids));
    expect(rows.every((r) => r.status === "sent" && r.attempts === 1)).toBe(true);
  });

  it("puts messages abandoned mid-send back in the queue", async () => {
    const id = await queue(schoolId, { status: "sending", lockedAt: new Date(Date.now() - 11 * 60_000), attempts: 1 });
    const fresh = await queue(schoolId, { status: "sending", lockedAt: new Date(), attempts: 1 });
    expect(await requeueStuck()).toBe(1);
    expect((await row(id)).status).toBe("queued");
    expect((await row(fresh)).status).toBe("sending");
  });

  it("records read receipts from Whaple", async () => {
    const id = await queue(schoolId, {
      status: "sent",
      sentAt: new Date(),
      provider: "whaple",
      providerMessageId: `wa_${uuidv7()}`,
    });
    replies = Array.from({ length: 50 }, () => ({ status: 200, body: { message: { status: "read" } } }));
    await refreshWhatsAppStatuses(50);
    const read = await row(id);
    expect(read.status).toBe("read");
    expect(read.readAt).not.toBeNull();
  });
});

