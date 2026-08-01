import type { ColumnProfile, Finding } from "../types";
import type { ParsedRow } from "../parseCsv";
import { matchDateFormat } from "../patterns/dateFormats";
import { isDisguisedNull } from "../patterns/nulls";

// Formats that break naive column parsing more severely than date-style differences
// (they inject a non-date-only representation into what looks like a date column).
const SEVERE_FORMAT_NAMES = new Set(["Unix Epoch (seconds)", "ISO DateTime"]);

function resolveSeverity(
  minorityPct: number,
  detectedFormats: string[],
  formatCounts: Record<string, number>,
  nonNullCount: number
): Finding["severity"] {
  const hasSevere = detectedFormats.some((f) => SEVERE_FORMAT_NAMES.has(f));

  if (hasSevere) {
    const severeCombinedCount = detectedFormats
      .filter((f) => SEVERE_FORMAT_NAMES.has(f))
      .reduce((sum, f) => sum + (formatCounts[f] ?? 0), 0);
    const severePct = nonNullCount > 0 ? severeCombinedCount / nonNullCount : 0;
    // If epoch/datetime together represent >= 10% of values, the column is unusable
    // as-is for any date operation → critical.
    if (severePct >= 0.10) return "critical";
    // Otherwise escalate base severity by one level; floor is "warning".
    const base: Finding["severity"] = minorityPct < 0.05 ? "info" : "warning";
    return base === "info" ? "warning" : "critical";
  }

  return minorityPct < 0.05 ? "info" : "warning";
}

export function detectInconsistentFormat(
  columns: ColumnProfile[],
  rows: ParsedRow[]
): Finding[] {
  const findings: Finding[] = [];

  for (const col of columns.filter((c) => c.inferredType === "date")) {
    const formatCounts: Record<string, number> = {};
    const formatExamples: Record<string, string[]> = {};
    let nonNullCount = 0;

    for (const row of rows) {
      const raw = row[col.name] ?? "";
      if (isDisguisedNull(raw)) continue;
      nonNullCount++;

      const fmt = matchDateFormat(raw);
      // Unrecognized values are not bucketed here — they are already signalled
      // by typeConfidence < 1 in the ColumnProfile.
      if (fmt === null) continue;

      formatCounts[fmt] = (formatCounts[fmt] ?? 0) + 1;
      if ((formatExamples[fmt]?.length ?? 0) < 3) {
        formatExamples[fmt] = [...(formatExamples[fmt] ?? []), raw];
      }
    }

    const detectedFormats = Object.keys(formatCounts);
    if (detectedFormats.length <= 1) continue;

    // Identify dominant format (highest count)
    const dominantFmt = detectedFormats.reduce((a, b) =>
      formatCounts[a] >= formatCounts[b] ? a : b
    );

    const affectedRowCount = nonNullCount - (formatCounts[dominantFmt] ?? 0);
    const affectedRowPercentage = nonNullCount > 0 ? affectedRowCount / nonNullCount : 0;

    const severity = resolveSeverity(
      affectedRowPercentage,
      detectedFormats,
      formatCounts,
      nonNullCount
    );

    // Description: formats listed highest-frequency first
    const breakdown = detectedFormats
      .sort((a, b) => formatCounts[b] - formatCounts[a])
      .map((f) => `${f} (${((formatCounts[f] / nonNullCount) * 100).toFixed(0)}%)`)
      .join(", ");

    const description =
      `Column "${col.name}" mixes ${detectedFormats.length} date representations: ` +
      `${breakdown}. This breaks reliable parsing and sorting downstream.`;

    // Sample evidence: severe formats first (they best illustrate the risk),
    // then other minority formats.
    const minorityFormats = detectedFormats.filter((f) => f !== dominantFmt);
    const orderedMinority = [
      ...minorityFormats.filter((f) => SEVERE_FORMAT_NAMES.has(f)),
      ...minorityFormats.filter((f) => !SEVERE_FORMAT_NAMES.has(f)),
    ];
    const sampleEvidence = orderedMinority
      .flatMap((f) => (formatExamples[f] ?? []).slice(0, 1))
      .slice(0, 3);

    findings.push({
      id: `inconsistent_format_${col.name}`,
      category: "inconsistent_format",
      severity,
      column: col.name,
      affectedRowCount,
      affectedRowPercentage,
      description,
      sampleEvidence,
    });
  }

  return findings;
}
