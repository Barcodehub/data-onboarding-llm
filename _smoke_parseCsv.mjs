// TEMPORARY smoke test — delete after inferTypes.ts is validated
// Mirrors the PapaParse options in parseCsv.ts using Node string input.
import Papa from "papaparse";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvText = readFileSync(join(__dirname, "data", "lakeside_orders_sample.csv"), "utf-8");

const result = Papa.parse(csvText, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim(),
});

const headers = result.meta.fields ?? [];
const rows = result.data;
const parseErrors = result.errors;

console.log("rows.length     :", rows.length);
console.log("headers.length  :", headers.length);
console.log("headers         :", headers);
console.log("parseErrors.length:", parseErrors.length);
if (parseErrors.length > 0) console.log("parseErrors     :", parseErrors);
