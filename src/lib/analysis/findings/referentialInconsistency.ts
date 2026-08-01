import type { ColumnProfile, Finding } from "../types";
import type { ParsedRow } from "../parseCsv";
import { isDisguisedNull } from "../patterns/nulls";

const MATCH_RATIO_THRESHOLD = 0.70;
const CRITICAL_THRESHOLD = 0.02;

// Tolerance: max(0.01 absolute, 1% relative) — avoids false negatives from cent-level rounding
function isApproxEqual(expected: number, actual: number): boolean {
  return Math.abs(expected - actual) <= Math.max(0.01, Math.abs(expected) * 0.01);
}

function parseNum(raw: string): number | null {
  if (isDisguisedNull(raw)) return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

interface MismatchExample {
  a: number;
  b: number;
  c: number;
  expected: number;
}

interface TripletResult {
  colA: string;
  colB: string;
  colC: string;
  matchCount: number;
  validRowCount: number;
  mismatchExamples: MismatchExample[];
}

function evaluateTriplet(
  colA: string,
  colB: string,
  colC: string,
  rows: ParsedRow[]
): TripletResult {
  let matchCount = 0;
  let validRowCount = 0;
  const mismatchExamples: MismatchExample[] = [];

  for (const row of rows) {
    const a = parseNum(row[colA] ?? "");
    const b = parseNum(row[colB] ?? "");
    const c = parseNum(row[colC] ?? "");
    if (a === null || b === null || c === null) continue;

    validRowCount++;
    const expected = a * b;
    if (isApproxEqual(expected, c)) {
      matchCount++;
    } else if (mismatchExamples.length < 3) {
      mismatchExamples.push({ a, b, c, expected });
    }
  }

  return { colA, colB, colC, matchCount, validRowCount, mismatchExamples };
}

export function detectReferentialInconsistency(
  columns: ColumnProfile[],
  rows: ParsedRow[]
): Finding[] {
  // Only numeric columns with actual variance are eligible
  const numCols = columns.filter(
    (c) => c.inferredType === "number" && c.uniqueCount > 1
  );

  if (numCols.length < 3) return [];

  let best: TripletResult | null = null;
  let bestMatchRatio = 0;

  // Unordered pairs for (A, B) since A*B = B*A, combined with all remaining C
  for (let i = 0; i < numCols.length; i++) {
    for (let j = i + 1; j < numCols.length; j++) {
      for (let k = 0; k < numCols.length; k++) {
        if (k === i || k === j) continue;

        const result = evaluateTriplet(
          numCols[i].name,
          numCols[j].name,
          numCols[k].name,
          rows
        );

        if (result.validRowCount === 0) continue;

        const matchRatio = result.matchCount / result.validRowCount;
        if (matchRatio >= MATCH_RATIO_THRESHOLD && matchRatio > bestMatchRatio) {
          bestMatchRatio = matchRatio;
          best = result;
        }
      }
    }
  }

  if (!best) return [];

  const mismatchCount = best.validRowCount - best.matchCount;
  if (mismatchCount === 0) return [];

  const totalRows = rows.length;
  const affectedRowPercentage = mismatchCount / totalRows;
  const severity: Finding["severity"] =
    affectedRowPercentage >= CRITICAL_THRESHOLD ? "critical" : "warning";

  const ex = best.mismatchExamples[0];
  const discrepancy = Math.abs(ex.c - ex.expected);
  const description =
    `Column "${best.colC}" does not equal "${best.colA}" × "${best.colB}" in ${mismatchCount} rows ` +
    `(${(affectedRowPercentage * 100).toFixed(1)}%). Example: ${best.colA}=${ex.a}, ` +
    `${best.colB}=${ex.b} (expected ${best.colC}≈${ex.expected.toFixed(2)}) ` +
    `but ${best.colC}=${ex.c} — discrepancy of ${discrepancy.toFixed(2)}.`;

  const sampleEvidence = best.mismatchExamples.slice(0, 2).map((e) => {
    const disc = Math.abs(e.c - e.expected);
    return (
      `${best!.colA}=${e.a}, ${best!.colB}=${e.b} → ` +
      `expected ${best!.colC}≈${e.expected.toFixed(2)}, got ${e.c} (off by ${disc.toFixed(2)})`
    );
  });

  return [
    {
      id: "referential_inconsistency_product",
      category: "referential_inconsistency",
      severity,
      columns: [best.colA, best.colB, best.colC],
      affectedRowCount: mismatchCount,
      affectedRowPercentage,
      description,
      sampleEvidence,
    },
  ];
}
