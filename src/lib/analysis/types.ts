export type Severity = "critical" | "warning" | "info";

export type FindingCategory =
  | "missing_data"
  | "duplicate"
  | "inconsistent_format"
  | "outlier"
  | "type_mismatch"
  | "referential_inconsistency"; // ej: total != quantity * unit_price

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: Severity;
  column?: string;          // si aplica a una columna concreta
  columns?: string[];       // si aplica a una relación entre columnas
  description: string;      // técnico, para el consultor
  affectedRowCount: number;
  affectedRowPercentage: number;
  sampleEvidence: string[]; // 2-3 ejemplos concretos, no toda la lista
}

export type InferredType =
  | "string" | "number" | "date" | "boolean" | "categorical" | "id" | "unknown";

export interface ColumnProfile {
  name: string;
  inferredType: InferredType;
  typeConfidence: number;      // 0-1
  nullCount: number;
  nullPercentage: number;
  uniqueCount: number;
  sampleValues: string[];
}

export interface AnalysisReport {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  findings: Finding[];
  generatedAt: string;
}