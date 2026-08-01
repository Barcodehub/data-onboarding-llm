// No es código funcional, es documentación ejecutable de la estructura de la UI.
// Cada sección consume una parte específica del AnalysisReport + LLMNarratorResponse.
export const DASHBOARD_SECTIONS = [
  { id: "summary", question: "¿Qué es este archivo, en una frase?" },
  { id: "health-score", question: "¿Qué tan confiable es este dataset, de un vistazo?" },
  { id: "key-risks", question: "¿Qué me debería preocupar antes del kickoff?" },
  { id: "column-explorer", question: "¿Qué significa cada columna?" },
  { id: "kickoff-questions", question: "¿Qué le pregunto al cliente?" },
] as const;