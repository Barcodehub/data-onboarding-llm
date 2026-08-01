import Papa from "papaparse";

export type ParsedRow = Record<string, string>;

export interface ParseResult {
  rows: ParsedRow[];
  headers: string[];
  parseErrors: Papa.ParseError[];
}

export function parseCsv(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        resolve({ rows: results.data, headers, parseErrors: results.errors });
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}
