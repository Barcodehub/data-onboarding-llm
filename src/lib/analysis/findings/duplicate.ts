import type { ColumnProfile, Finding } from "../types";
import type { ParsedRow } from "../parseCsv";
import { isDisguisedNull } from "../patterns/nulls";
import { selectBusinessKey } from "./selectBusinessKey";

// Treats all disguised-null variants as equivalent for comparison purposes,
// preventing false positives when "" vs "N/A" appear in the same column.
// No additional trimming — raw value preservation is a deliberate design choice.
function normalizeForComparison(value: string): string {
  return isDisguisedNull(value) ? "" : value;
}

export function detectDuplicates(
  columns: ColumnProfile[],
  rows: ParsedRow[]
): Finding[] {
  const totalRows = rows.length;
  const findings: Finding[] = [];
  const businessKeyCol = selectBusinessKey(columns, totalRows);

  // === CHECK A: Exact duplicate rows ===
  {
    const keyCounts = new Map<string, number>();
    const keyFirstRow = new Map<string, ParsedRow>();

    for (const row of rows) {
      const key = columns
        .map((c) => normalizeForComparison(row[c.name] ?? ""))
        .join("\x00");
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      if (!keyFirstRow.has(key)) keyFirstRow.set(key, row);
    }

    let affectedRowCount = 0;
    const sampleRows: ParsedRow[] = [];

    for (const [key, count] of keyCounts) {
      if (count > 1) {
        affectedRowCount += count;
        if (sampleRows.length < 2) sampleRows.push(keyFirstRow.get(key)!);
      }
    }

    if (affectedRowCount > 0) {
      const affectedRowPercentage = affectedRowCount / totalRows;
      // Full-row duplicates almost always indicate an ingestion issue;
      // use a lower critical threshold (2%) than other rules.
      const severity: Finding["severity"] =
        affectedRowPercentage >= 0.02 ? "critical" : "warning";

      const sampleEvidence = sampleRows.map((row) => {
        if (businessKeyCol) {
          return `Row with ${businessKeyCol}="${row[businessKeyCol] ?? ""}" appears more than once`;
        }
        const preview = columns
          .slice(0, 3)
          .map((c) => `${c.name}="${row[c.name] ?? ""}"`)
          .join(", ");
        return `Row {${preview}} appears more than once`;
      });

      findings.push({
        id: "duplicate_exact_rows",
        category: "duplicate",
        severity,
        affectedRowCount,
        affectedRowPercentage,
        description: `${affectedRowCount} rows (${(affectedRowPercentage * 100).toFixed(1)}%) are exact duplicates of at least one other row. This likely indicates an ingestion issue.`,
        sampleEvidence,
      });
    }
  }

  // === CHECK B: Business key collision with divergent data ===
  if (businessKeyCol !== null) {
    const groups = new Map<string, ParsedRow[]>();
    for (const row of rows) {
      const keyValue = row[businessKeyCol] ?? "";
      if (!groups.has(keyValue)) groups.set(keyValue, []);
      groups.get(keyValue)!.push(row);
    }

    const nonKeyColumns = columns.filter((c) => c.name !== businessKeyCol);
    let affectedRowCount = 0;
    let divergentGroupCount = 0;
    const sampleEvidence: string[] = [];
    let descriptionExample = "";

    for (const [keyValue, groupRows] of groups) {
      if (groupRows.length <= 1) continue;

      // Find the first column where any two rows genuinely differ
      // (normalized so disguised-null variants don't create false divergence)
      const firstRow = groupRows[0];
      let firstDifferingCol: string | null = null;

      outer: for (let j = 1; j < groupRows.length; j++) {
        for (const col of nonKeyColumns) {
          const a = normalizeForComparison(firstRow[col.name] ?? "");
          const b = normalizeForComparison(groupRows[j][col.name] ?? "");
          if (a !== b) {
            firstDifferingCol = col.name;
            break outer;
          }
        }
      }

      if (firstDifferingCol === null) continue; // All identical → covered by Check A

      affectedRowCount += groupRows.length;
      divergentGroupCount++;

      if (sampleEvidence.length < 2) {
        const example =
          `${businessKeyCol} "${keyValue}" appears ${groupRows.length} times ` +
          `with different "${firstDifferingCol}" values`;
        sampleEvidence.push(example);
        if (!descriptionExample) descriptionExample = example;
      }
    }

    if (affectedRowCount > 0) {
      findings.push({
        id: "duplicate_key_collision",
        category: "duplicate",
        severity: "critical",
        column: businessKeyCol,
        affectedRowCount,
        affectedRowPercentage: affectedRowCount / totalRows,
        description:
          `Business key "${businessKeyCol}" has ${divergentGroupCount} group(s) where the same ` +
          `identifier appears with divergent row data. Example: ${descriptionExample}.`,
        sampleEvidence,
      });
    }
  }

  return findings;
}
