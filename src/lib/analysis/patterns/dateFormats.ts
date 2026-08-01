export interface DateFormat {
  name: string;
  regex: RegExp;
  // Returns value normalized to ISO (YYYY-MM-DD) for validation with Date.parse.
  // Returns "" if the value fails format-specific guards (e.g. month > 12).
  toISO: (value: string) => string;
}

export const DATE_FORMATS: DateFormat[] = [
  {
    name: "ISO",
    regex: /^\d{4}-\d{2}-\d{2}$/,
    toISO: (v) => v,
  },
  {
    name: "DD-MM-YYYY",
    regex: /^\d{2}-\d{2}-\d{4}$/,
    toISO: (v) => {
      const [d, m, y] = v.split("-");
      return `${y}-${m}-${d}`;
    },
  },
  {
    name: "Mon DD, YYYY",
    regex: /^[A-Za-z]{3} \d{1,2}, \d{4}$/,
    toISO: (v) => v, // Date.parse handles "Mar 24, 2024" natively in V8
  },
  {
    // NOTE: US convention assumed (month first). MM/DD vs DD/MM is ambiguous
    // with regex alone and cannot be resolved without locale context.
    name: "MM/DD/YYYY",
    regex: /^\d{1,2}\/\d{1,2}\/\d{4}$/,
    toISO: (v) => {
      const [m, d, y] = v.split("/");
      const month = parseInt(m, 10);
      const day = parseInt(d, 10);
      // Explicit guard to reduce false positives before handing off to Date.parse
      if (month < 1 || month > 12 || day < 1 || day > 31) return "";
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    },
  },
  {
    name: "ISO DateTime",
    regex: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    // Replace space with "T" to avoid relying on V8's lenient legacy parsing
    toISO: (v) => v.replace(" ", "T"),
  },
  {
    // Epoch in seconds only; milliseconds is deliberately out of scope
    // (13-digit values would incorrectly classify numeric IDs).
    // /^\d{9,10}$/ covers the current epoch range in seconds (~2001–2286).
    name: "Unix Epoch (seconds)",
    regex: /^\d{9,10}$/,
    toISO: (v) => {
      const date = new Date(parseInt(v, 10) * 1000);
      const year = date.getUTCFullYear();
      // Range guard: rejects 10-digit IDs or numeric quantities that happen
      // to be 9-10 digits but don't represent a plausible modern timestamp.
      if (year < 2000 || year > 2030) return "";
      return date.toISOString();
    },
  },
];

/**
 * Returns the name of the first format that matches the value and
 * produces a valid calendar date via Date.parse, or null if none apply.
 */
export function matchDateFormat(value: string): string | null {
  for (const fmt of DATE_FORMATS) {
    if (!fmt.regex.test(value)) continue;
    const iso = fmt.toISO(value);
    if (!iso) continue;
    if (!isNaN(Date.parse(iso))) return fmt.name;
  }
  return null;
}

/** Convenience wrapper — true when any supported format matches. */
export function isLikelyDateValue(value: string): boolean {
  return matchDateFormat(value) !== null;
}
