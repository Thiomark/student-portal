import "server-only";

// Whaple (WhatsApp) client. Each school has its own API key, bound to its own
// WhatsApp number. Whaple has no webhooks; poll getWhatsAppStatus for
// delivery and read receipts.

export type WhapleResult =
  | { ok: true; messageId?: string; status?: string }
  // retryable: worth trying again later (network, rate limit, Whaple down, or
  // the school's WhatsApp phone briefly disconnected).
  | { ok: false; error: string; retryable: boolean; messageId?: string; status?: string };

function baseUrl(): string {
  const url = process.env.WHAPLE_API_URL;
  if (!url) throw new Error("WHAPLE_API_URL is not set");
  return url.replace(/\/$/, "");
}

export async function sendWhatsApp(apiKey: string, number: string, message: string): Promise<WhapleResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/api/messages`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      // Whaple wants the number without the leading "+".
      body: JSON.stringify({ number: number.replace(/^\+/, ""), message }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error", retryable: true };
  }

  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    message?: { id?: string; status?: string } | string;
  } | null;
  const tracked = body && typeof body.message === "object" ? body.message : undefined;

  if (response.ok && body?.success) {
    return { ok: true, messageId: tracked?.id, status: tracked?.status };
  }
  return {
    ok: false,
    error: body?.error ?? (typeof body?.message === "string" ? body.message : `HTTP ${response.status}`),
    retryable: response.status === 429 || response.status >= 500,
    messageId: tracked?.id,
    status: tracked?.status,
  };
}

export async function getWhatsAppStatus(apiKey: string, messageId: string): Promise<string | null> {
  const response = await fetch(`${baseUrl()}/api/messages/${encodeURIComponent(messageId)}`, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { message?: { status?: string } } | null;
  return body?.message?.status ?? null;
}
