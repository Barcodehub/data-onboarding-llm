import type { ColumnProfile, Finding } from "../types";

export function detectMissingData(columns: ColumnProfile[], totalRows: number): Finding[] {
  const findings: Finding[] = [];

  for (const col of columns) {
    if (col.nullPercentage === 0) continue;

    let severity: Finding["severity"];

    if (col.inferredType === "id") {
      // Any missing value in an identifier column is a structural defect,
      // not a cosmetic one — every row must be uniquely addressable.
      // Severity is critical regardless of the percentage.
      severity = "critical";
    } else if (col.nullPercentage >= 0.3) {
      severity = "warning";
    } else {
      // 0 < nullPercentage < 0.3: present but below the alerting threshold.
      severity = "info";
    }

    findings.push({
      id: `missing_data_${col.name}`,
      category: "missing_data",
      severity,
      column: col.name,
      affectedRowCount: col.nullCount,
      affectedRowPercentage: col.nullPercentage,
      description: `Column "${col.name}" (${col.inferredType}) has ${col.nullCount} missing or null-equivalent values out of ${totalRows} total rows (${(col.nullPercentage * 100).toFixed(1)}%).`,
      sampleEvidence: [`${(col.nullPercentage * 100).toFixed(1)}% of rows missing this value`],
    });
  }

  return findings;
}
