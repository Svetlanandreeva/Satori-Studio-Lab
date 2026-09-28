export function normalizeLegacyDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  let date: Date;
  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (typeof value === "number") {
    const abs = Math.abs(value);
    // CRM schema uses SQLite timestamp seconds. Historical importers sometimes
    // wrote millisecond or microsecond epochs directly, so normalise by magnitude.
    const ms = abs < 100_000_000_000 ? value * 1000 : abs < 100_000_000_000_000 ? value : value / 1000;
    date = new Date(ms);
  } else {
    const raw = String(value).trim();
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
      const numeric = Number(raw);
      const abs = Math.abs(numeric);
      const ms = abs < 100_000_000_000 ? numeric * 1000 : abs < 100_000_000_000_000 ? numeric : numeric / 1000;
      date = new Date(ms);
    } else {
      date = new Date(raw);
    }
  }

  if (Number.isNaN(date.getTime())) return null;

  // Drizzle timestamp mode multiplies stored seconds by 1000 when reading.
  // If legacy rows contain milliseconds, the resulting Date lands tens of
  // thousands of years in the future. Divide until it is back in a sane range.
  let guard = 0;
  while (date.getUTCFullYear() > 2100 && guard < 3) {
    date = new Date(date.getTime() / 1000);
    guard += 1;
  }
  if (date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) return null;
  return date;
}

export function isoDate(value: unknown): string | null {
  return normalizeLegacyDate(value)?.toISOString() || null;
}
