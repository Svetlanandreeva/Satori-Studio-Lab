/**
 * Format-only normalization for a user-initiated Telegram phone link.
 * No directory lookup, contact import, or claim that a number/account exists.
 * https://core.telegram.org/api/links#phone-number-links
 */
export function normalizeTelegramPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  // Do not silently concatenate multiple numbers, extensions, or pasted URLs.
  if (!input || input.length > 64 || !/^\+?[0-9][0-9 ()\-\u00a0\u202f]*$/.test(input)) return null;

  // Accept a single, balanced, nonempty area-code group. Nested/multiple
  // groups and an optional trunk prefix such as +44 (0) are ambiguous.
  const groups = input.match(/\([^()]*\)/g) || [];
  if (groups.length > 1 || groups.some((group) => !/^\([0-9]{2,6}\)$/.test(group))) return null;
  if (input.replace(/\([0-9]{2,6}\)/g, "").match(/[()]/)) return null;
  if (!/[0-9]$/.test(input)) return null;

  let digits = input.replace(/[^0-9]/g, "");
  if (!input.startsWith("+")) {
    // Explicit local convention for this Russian CRM. A bare ten-digit
    // number (or another country without +) is deliberately not guessed.
    if (!/^[78][0-9]{10}$/.test(digits)) return null;
    digits = `7${digits.slice(1)}`;
  }
  // Conservative format bounds, not a numbering-plan or reachability check.
  if (!/^[1-9][0-9]{6,14}$/.test(digits)) return null;
  if (/^[17]/.test(digits) && digits.length !== 11) return null;
  return `+${digits}`;
}

export function telegramPhoneHref(value: unknown): string | null {
  const phone = normalizeTelegramPhone(value);
  return phone ? `https://t.me/${phone}` : null;
}
