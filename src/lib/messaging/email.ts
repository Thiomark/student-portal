import "server-only";
import { Resend } from "resend";

export type EmailResult = { ok: true; messageId?: string } | { ok: false; error: string; retryable: boolean };

// Resend error names that mean "try again later" rather than "this will never
// work" (bad address, unverified domain, invalid key).
const RETRYABLE = new Set(["rate_limit_exceeded", "application_error", "internal_server_error", "daily_quota_exceeded"]);

// Sends with the school's own Resend key and verified sender when it has one,
// otherwise through the platform sender (noreply@APP_EMAIL_DOMAIN) with the
// school's name as the display name.
export async function sendEmail(opts: {
  schoolName: string;
  schoolApiKey?: string | null;
  schoolFromEmail?: string | null;
  replyTo?: string | null;
  to: string;
  subject: string;
  text: string;
  // Resend drops a repeat send with the same key, so a retry after a crash
  // can't email a parent twice. Pass the message id.
  idempotencyKey?: string;
}): Promise<EmailResult> {
  const useSchool = Boolean(opts.schoolApiKey && opts.schoolFromEmail);
  const apiKey = useSchool ? opts.schoolApiKey! : process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "Email is not configured", retryable: false };

  const fromAddress = useSchool
    ? opts.schoolFromEmail!
    : `noreply@${process.env.APP_EMAIL_DOMAIN ?? "example.com"}`;
  const displayName = opts.schoolName.replace(/[<>"]/g, "");

  let response;
  try {
    response = await new Resend(apiKey).emails.send(
      {
        from: `${displayName} <${fromAddress}>`,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: textToHtml(opts.text),
        replyTo: opts.replyTo ?? undefined,
      },
      opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error", retryable: true };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: error.message, retryable: RETRYABLE.has(error.name) };
  return { ok: true, messageId: data?.id };
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${escaped.replace(/\n/g, "<br>")}</div>`;
}
