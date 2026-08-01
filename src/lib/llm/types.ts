import type { ColumnProfile, Finding } from "../analysis/types";
// Lo que le mandamos: NUNCA las filas crudas, solo el resumen ya calculado
export interface LLMNarratorRequest {
  columns: ColumnProfile[];
  findings: Finding[];
  rowCount: number;
}

// Lo que esperamos de vuelta, vía structured output / tool use
export interface LLMNarratorResponse {
  executiveSummary: string;           // 2-3 frases, para el IT manager
  keyRisks: {
    findingId: string;                // referencia al Finding original, no inventa
    plainEnglishExplanation: string;
  }[];
  kickoffQuestions: string[];         // específicas, no genéricas
}