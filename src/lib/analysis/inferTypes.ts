import type { ParseResult } from "./parseCsv";
import type { ColumnProfile, InferredType } from "./types";
import { isLikelyDateValue } from "./patterns/dateFormats";

// Values treated as absent regardless of column type.
// Comparison runs after trim() + toLowerCase(), so " ", "NULL", "N/A" etc. are all covered.
const DISGUISED_NULL_SET = new Set(["", "n/a", "na", "n/d", "null", "-", "--"]);

function isDisguisedNull(raw: string): boolean {
  return DISGUISED_NULL_SET.has(raw.trim().toLowerCase());
}

// Generic prefix-number pattern: one-or-more alphanumeric prefix, dash, one-or-more digits.
// Matches ORD-001, SKU-42, CUST-10164 without hardcoding any specific prefix.
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*-\d+$/;

function isLikelyId(value: string): boolean {
  return ID_PATTERN.test(value);
}

const BOOL_SET = new Set(["true", "false", "yes", "no", "1", "0"]);

function isLikelyBoolean(value: string): boolean {
  return BOOL_SET.has(value.trim().toLowerCase());
}

function isLikelyNumber(value: string): boolean {
  // Reject values with attached unit symbols — these represent dirty data and
  // are exactly what inconsistent_format / type_mismatch findings should surface.
  if (/[%$]/.test(value)) return false;
  return value.trim() !== "" && !isNaN(Number(value));
}

function getSampleValues(nonNullValues: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of nonNullValues) {
    if (!seen.has(v)) {
      seen.add(v);
      result.push(v);
      if (result.length >= 5) break;
    }
  }
  return result;
}

const THRESHOLD = 0.8;

export function inferColumnProfile(columnName: string, values: string[]): ColumnProfile {
  const totalRows = values.length;
  const nonNullValues = values.filter((v) => !isDisguisedNull(v));
  const nullCount = totalRows - nonNullValues.length;
  // nullPercentage is always over total rows, not just non-null values
  const nullPercentage = totalRows > 0 ? nullCount / totalRows : 0;
  const uniqueCount = new Set(nonNullValues).size;
  const sampleValues = getSampleValues(nonNullValues);

  if (nonNullValues.length === 0) {
    return {
      name: columnName,
      inferredType: "unknown",
      typeConfidence: 0,
      nullCount,
      nullPercentage,
      uniqueCount,
      sampleValues,
    };
  }

  const n = nonNullValues.length;
  const distinctRatio = uniqueCount / n;

  const idRatio   = nonNullValues.filter(isLikelyId).length / n;
  const dateRatio = nonNullValues.filter(isLikelyDateValue).length / n;
  const boolRatio = nonNullValues.filter(isLikelyBoolean).length / n;
  const numRatio  = nonNullValues.filter(isLikelyNumber).length / n;
  // Categorical confidence: 1 - distinctRatio.
  // Columns with few distinct values relative to row count score near 1.0;
  // columns where every value is unique score near 0.0.
  const catConfidence = 1 - distinctRatio;

  let inferredType: InferredType;
  let typeConfidence: number;

  // Priority: id > date > boolean > number > categorical > string
  // Boolean is before number so binary 0/1 columns are not swallowed by isLikelyNumber.
  if (idRatio >= THRESHOLD) {
    inferredType = "id";
    typeConfidence = idRatio;
  } else if (dateRatio >= THRESHOLD) {
    inferredType = "date";
    typeConfidence = dateRatio;
  } else if (boolRatio >= THRESHOLD && uniqueCount <= 3) {
    inferredType = "boolean";
    typeConfidence = boolRatio;
  } else if (numRatio >= THRESHOLD) {
    inferredType = "number";
    typeConfidence = numRatio;
  } else if (catConfidence >= THRESHOLD) {
    inferredType = "categorical";
    typeConfidence = catConfidence;
  } else {
    // No type exceeded the threshold. Use the highest candidate confidence as
    // the signal quality: if any candidate reached at least 30%, call it
    // "string" (structured free text with no dominant type); below that there
    // is genuinely no signal and we return "unknown".
    const best = Math.max(idRatio, dateRatio, boolRatio, numRatio, catConfidence);
    const LOW_SIGNAL_THRESHOLD = 0.3;
    inferredType = best < LOW_SIGNAL_THRESHOLD ? "unknown" : "string";
    typeConfidence = best;
  }

  return {
    name: columnName,
    inferredType,
    typeConfidence,
    nullCount,
    nullPercentage,
    uniqueCount,
    sampleValues,
  };
}

export function inferTypes(parseResult: ParseResult): ColumnProfile[] {
  return parseResult.headers.map((header) => {
    const values = parseResult.rows.map((row) => row[header] ?? "");
    return inferColumnProfile(header, values);
  });
}
