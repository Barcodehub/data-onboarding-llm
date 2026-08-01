import type { ColumnProfile } from "../types";

const NULL_TOLERANCE = 0.05;
const DISTINCT_THRESHOLD = 0.95;
const AMBIGUITY_MARGIN = 0.03;

export function selectBusinessKey(
  columns: ColumnProfile[],
  totalRows: number
): string | null {
  // 1. Only consider columns inferred as identifiers
  const idColumns = columns.filter((c) => c.inferredType === "id");
  if (idColumns.length === 0) return null;

  // 2. A column with >= 5% missing values is not a reliable row identifier
  const reliable = idColumns.filter((c) => c.nullPercentage < NULL_TOLERANCE);
  if (reliable.length === 0) return null;

  // 3. Compute distinctRatio = uniqueCount / non-null count.
  //    totalRows is passed in; we do not reconstruct it from ColumnProfile.
  const candidates = reliable.map((c) => {
    const nonNullCount = totalRows - c.nullCount;
    const distinctRatio = nonNullCount > 0 ? c.uniqueCount / nonNullCount : 0;
    return { name: c.name, distinctRatio };
  });

  // 4. Keep only candidates that are nearly unique
  const highDistinct = candidates.filter((c) => c.distinctRatio >= DISTINCT_THRESHOLD);
  if (highDistinct.length === 0) return null;

  // 5. Exactly one clear winner
  if (highDistinct.length === 1) return highDistinct[0].name;

  // 6. More than one: sort descending, require a clear margin to avoid ambiguity
  highDistinct.sort((a, b) => b.distinctRatio - a.distinctRatio);
  const margin = highDistinct[0].distinctRatio - highDistinct[1].distinctRatio;
  if (margin >= AMBIGUITY_MARGIN) return highDistinct[0].name;

  // No clear winner — callers should skip duplicate detection or flag ambiguity
  return null;
}
