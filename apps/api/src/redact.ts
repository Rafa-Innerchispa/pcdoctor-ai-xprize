const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const ECUADOR_ID = /\b\d{10,13}\b/g;
const PHONE = /(?:\+?593|0)[ -]?\d{2}[ -]?\d{3}[ -]?\d{4}\b/g;

export function redactSensitiveText(value: string): string {
  return value
    .replace(EMAIL, "[REDACTED_EMAIL]")
    .replace(PHONE, "[REDACTED_PHONE]")
    .replace(ECUADOR_ID, "[REDACTED_ID]");
}
