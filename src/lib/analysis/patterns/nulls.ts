const DISGUISED_NULL_SET = new Set(["", "n/a", "na", "n/d", "null", "-", "--"]);

/** Returns true if the raw cell value should be treated as absent/null. */
export function isDisguisedNull(raw: string): boolean {
  return DISGUISED_NULL_SET.has(raw.trim().toLowerCase());
}
