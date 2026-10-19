// Normalise a phone number to E.164. Local numbers ("082 123 4567") are read
// in the school's country; defaults to South Africa (+27).
export function toE164(input: string, countryCode = "27"): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;
  let e164: string;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (digits.startsWith("0")) e164 = `+${countryCode}${digits.slice(1)}`;
  else if (digits.startsWith(countryCode) && digits.length > 10) e164 = `+${digits}`;
  else return null;
  return /^\+\d{8,15}$/.test(e164) ? e164 : null;
}

// For display and logs: never print a guardian's full number.
export function maskPhone(e164: string): string {
  return e164.length <= 6 ? "***" : `${e164.slice(0, 4)}***${e164.slice(-3)}`;
}
