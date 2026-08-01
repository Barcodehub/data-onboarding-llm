import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisReport, ColumnProfile } from "../analysis/types";
import type { LLMNarratorRequest, LLMNarratorResponse } from "./types";

// ─── Payload-only column type ─────────────────────────────────────────────────
// LLMNarratorRequest.columns is typed as ColumnProfile[] in the contract, but
// sending all 7 fields for all 22 columns inflates the prompt unnecessarily.
// We use a narrower local type for the actual JSON payload without touching types.ts.

type ColumnSummary = Pick<ColumnProfile, "name" | "inferredType"> & {
  sampleValues?: string[]; // omitted for non-cryptic columns
};

type NarratorPayload = Omit<LLMNarratorRequest, "columns"> & {
  columns: ColumnSummary[];
};

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
You are a data analyst helping a consultant prepare a kickoff meeting with a non-technical client.

You will receive a JSON payload with:
- rowCount: total number of records in the dataset
- columns: inferred structure of each column (name, type, and sample values for abbreviated names)
- findings: detected data quality issues, each with an id, category, severity, affectedRowCount, affectedRowPercentage, and description

Call the report_narrative tool with three outputs:

EXECUTIVE SUMMARY
2–3 sentences describing the overall state of this dataset to a business audience that does not know what a null value, a duplicate row, or a data type is. Use plain language only. No technical jargon.

KEY RISKS
For each "critical" finding (prioritize these), explain in plain language why the issue matters to the business — not just what the technical problem is. Each risk MUST reference an exact findingId from the input findings list. Do NOT invent findingIds or findings that are not in the input. You may include at most one "warning" finding if it has clear business impact. Do not include "info" findings in keyRisks, EXCEPT when the finding reveals a risk of biased or misleading downstream analysis (e.g. a metric like a satisfaction score that excludes a systematic subset of records). In that case, you may include it, but the plainEnglishExplanation must explicitly name the bias risk, not just restate the missing-data percentage.

KICKOFF QUESTIONS
3–5 questions to ask the client during the kickoff meeting. Each question must be traceable to a specific finding in the data. Questions must be concrete and specific to this dataset — not generic questions like "how important is data quality to you?"

HARD RULE — Numbers and figures:
You may only cite a number, count, or percentage if it appears LITERALLY in the input JSON, inside a finding's affectedRowCount, affectedRowPercentage, or description field. Do not round, estimate, approximate, or calculate any figure. If a finding states "94 rows (8.0%)", you may write "94 rows" or "8.0%" but never "about 10%" or "roughly 100 rows."`;

// ─── Tool definition (mirrors LLMNarratorResponse exactly) ───────────────────

const NARRATOR_TOOL: Anthropic.Tool = {
  name: "report_narrative",
  description: "Return the structured narrative analysis of the dataset's data quality findings.",
  input_schema: {
    type: "object",
    properties: {
      executiveSummary: {
        type: "string",
        description: "2–3 sentence executive summary in plain business language, no technical jargon.",
      },
      keyRisks: {
        type: "array",
        description: "Business-language explanation of critical findings. Each item references a real findingId.",
        items: {
          type: "object",
          properties: {
            findingId: {
              type: "string",
              description: "Must match an exact id field from the input findings list. Do not invent.",
            },
            plainEnglishExplanation: {
              type: "string",
              description: "Why this matters to the business, not just what the technical issue is.",
            },
          },
          required: ["findingId", "plainEnglishExplanation"],
        },
      },
      kickoffQuestions: {
        type: "array",
        description: "3–5 specific questions for the client kickoff, each traceable to a concrete finding.",
        items: { type: "string" },
      },
    },
    required: ["executiveSummary", "keyRisks", "kickoffQuestions"],
  },
};

// ─── Cryptic column name heuristic ────────────────────────────────────────────
// Returns true when a column name is opaque enough that sample values help the
// LLM understand its content. Imperfect by design — token saving, not critical logic.

function isCrypticColumnName(name: string): boolean {
  if (name.length > 12) return false;

  // Fallback: known system-generated patterns that are hard to read without context
  const crypticPatterns = ["_cd", "_dt", "cust_", "prod_", "chnl", "pmt_"];
  if (crypticPatterns.some((p) => name.includes(p))) return true;

  // Vowel-ratio check: if fewer than 30% of non-underscore characters are vowels,
  // the name is likely an abbreviation or acronym (e.g. "qty", "disc_pct")
  const normalized = name.toLowerCase().replace(/_/g, "");
  const vowelCount = (normalized.match(/[aeiou]/g) ?? []).length;
  return normalized.length > 0 && vowelCount / normalized.length < 0.3;
}

// ─── Request builder ──────────────────────────────────────────────────────────

function buildNarratorPayload(report: AnalysisReport): NarratorPayload {
  const columns: ColumnSummary[] = report.columns.map((col) => {
    const base: ColumnSummary = { name: col.name, inferredType: col.inferredType };
    if (isCrypticColumnName(col.name)) {
      base.sampleValues = col.sampleValues.slice(0, 3);
    }
    return base;
  });

  return { columns, findings: report.findings, rowCount: report.rowCount };
}

// ─── Public preview helper (no API call) ─────────────────────────────────────

export function previewNarratorPayload(report: AnalysisReport): {
  systemPrompt: string;
  request: NarratorPayload;
} {
  return { systemPrompt: SYSTEM_PROMPT, request: buildNarratorPayload(report) };
}

// ─── Main narrator ────────────────────────────────────────────────────────────

export async function narrateReport(
  apiKey: string,
  report: AnalysisReport
): Promise<LLMNarratorResponse> {
  // NOTE: dangerouslyAllowBrowser: true is intentional — this project has no backend.
  // The API key is supplied by the user at runtime and kept only in React state,
  // never stored in localStorage or committed to source control.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const payload = buildNarratorPayload(report);

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: [NARRATOR_TOOL],
      tool_choice: { type: "tool", name: NARRATOR_TOOL.name },
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Narrator API call failed: ${message}`);
  }

  const toolUseBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error(
      `LLM did not return a tool_use block (stop_reason: ${response.stop_reason}). ` +
        `Check that the model supports forced tool use.`
    );
  }

  const raw = toolUseBlock.input as LLMNarratorResponse;

  // ─── Content validation: ensure keyRisks reference real finding IDs ────────
  // Forced tool_choice guarantees shape but not that findingId values are real.
  const validFindingIds = new Set(report.findings.map((f) => f.id));

  const validatedKeyRisks = raw.keyRisks.filter((risk) => {
    if (validFindingIds.has(risk.findingId)) return true;
    console.warn(
      `[narrator] Removed hallucinated findingId "${risk.findingId}" from keyRisks — ` +
        `not present in the input findings list.`
    );
    return false;
  });

  const hasCriticalFindings = report.findings.some((f) => f.severity === "critical");
  if (validatedKeyRisks.length === 0 && hasCriticalFindings) {
    throw new Error(
      "Narrator returned no valid keyRisks despite critical findings being present in the input. " +
        "The model failed to anchor its response to the real finding IDs."
    );
  }

  return { ...raw, keyRisks: validatedKeyRisks };
}
