import type { AnalysisReport, Finding, Severity } from "../lib/analysis/types";
import type { LLMNarratorResponse } from "../lib/llm/types";

const CATEGORY_LABELS: Record<string, string> = {
  missing_data: "Missing data",
  duplicate: "Duplicate",
  inconsistent_format: "Inconsistent format",
  referential_inconsistency: "Referential inconsistency",
  outlier: "Outlier",
  type_mismatch: "Type mismatch",
};

const TYPE_LABELS: Record<string, string> = {
  id: "ID",
  date: "Date",
  number: "Number",
  boolean: "Boolean",
  categorical: "Categorical",
  string: "Text",
  unknown: "Unknown",
};

// For referential_inconsistency the last column is the expected result, not a factor.
// Render as "A × B ≈ C" instead of "A × B × C" when the triplet shape is matched.
function columnLabel(f: Finding): string | null {
  if (f.column) return f.column;
  if (!f.columns) return null;
  if (f.category === "referential_inconsistency" && f.columns.length === 3) {
    return `${f.columns[0]} × ${f.columns[1]} ≈ ${f.columns[2]}`;
  }
  return f.columns.join(" × ");
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    critical: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${styles[severity]}`}>
      {severity}
    </span>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

interface Props {
  report: AnalysisReport;
  narrative: LLMNarratorResponse;
}

export function Dashboard({ report, narrative }: Props) {
  const critical = report.findings.filter((f) => f.severity === "critical");
  const warning  = report.findings.filter((f) => f.severity === "warning");
  const info     = report.findings.filter((f) => f.severity === "info");
  const findingById = Object.fromEntries(report.findings.map((f) => [f.id, f]));

  return (
    <div className="space-y-5">

      {/* 1 — Summary */}
      <SectionCard title="Overview" subtitle="What is this dataset, in a sentence?">
        <p className="text-sm text-slate-700 leading-relaxed">{narrative.executiveSummary}</p>
      </SectionCard>

      {/* 2 — Health score */}
      <SectionCard title="Data health" subtitle="How reliable is this dataset, at a glance?">
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-red-700 tabular-nums">{critical.length}</p>
            <p className="text-xs font-semibold text-red-600 mt-1 uppercase tracking-wide">Critical</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-amber-700 tabular-nums">{warning.length}</p>
            <p className="text-xs font-semibold text-amber-600 mt-1 uppercase tracking-wide">Warning</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-blue-700 tabular-nums">{info.length}</p>
            <p className="text-xs font-semibold text-blue-600 mt-1 uppercase tracking-wide">Info</p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {[...critical, ...warning, ...info].map((f) => (
            <div key={f.id} className="py-3 flex items-start gap-3">
              <SeverityBadge severity={f.severity} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {CATEGORY_LABELS[f.category] ?? f.category}
                  {columnLabel(f) && (
                    <span className="font-mono text-xs text-slate-500 ml-2">
                      {columnLabel(f)}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{f.description}</p>
                {f.sampleEvidence.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {f.sampleEvidence.slice(0, 2).map((e, i) => (
                      <li key={i} className="text-xs text-slate-500 font-mono bg-slate-50 rounded px-2 py-0.5 break-all">
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-slate-400 flex-shrink-0 text-right tabular-nums whitespace-nowrap">
                {f.affectedRowCount.toLocaleString("en-US")} rows<br />
                ({(f.affectedRowPercentage * 100).toFixed(1)}%)
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 3 — Key risks */}
      <SectionCard title="Key risks" subtitle="What should concern us before the kickoff?">
        <div className="space-y-3">
          {narrative.keyRisks.map((risk) => {
            const finding = findingById[risk.findingId];
            return (
              <div key={risk.findingId} className="border border-slate-100 rounded-lg p-4 bg-slate-50">
                <div className="flex items-center gap-2 mb-2.5">
                  {finding && <SeverityBadge severity={finding.severity} />}
                  <span className="text-xs font-mono text-slate-400">{risk.findingId}</span>
                  {finding && (
                    <span className="ml-auto text-xs text-slate-500 tabular-nums flex-shrink-0">
                      {finding.affectedRowCount.toLocaleString("en-US")} rows&nbsp;
                      ({(finding.affectedRowPercentage * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{risk.plainEnglishExplanation}</p>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* 4 — Column explorer */}
      <SectionCard title="Column explorer" subtitle="What does each column contain?">
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {["Column", "Type", "Null %", "Unique", "Sample values"].map((h, i) => (
                  <th
                    key={h}
                    className={`text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 pb-3
                      ${i === 0 ? "text-left pr-4" : i === 4 ? "text-left pl-2" : i >= 2 ? "text-right pr-4" : "text-left pr-4"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.columns.map((col) => (
                <tr key={col.name} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-700 align-top whitespace-nowrap">
                    {col.name}
                  </td>
                  <td className="py-2 pr-4 align-top">
                    <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                      {TYPE_LABELS[col.inferredType] ?? col.inferredType}
                    </span>
                  </td>
                  <td className={`py-2 pr-4 text-right text-xs align-top font-medium tabular-nums whitespace-nowrap
                    ${col.nullPercentage > 0.1 ? "text-amber-600"
                      : col.nullPercentage > 0 ? "text-slate-600"
                      : "text-green-600"}`}
                  >
                    {col.nullPercentage === 0 ? "—" : `${(col.nullPercentage * 100).toFixed(1)}%`}
                  </td>
                  <td className="py-2 pr-4 text-right text-xs text-slate-500 align-top tabular-nums whitespace-nowrap">
                    {col.uniqueCount.toLocaleString("en-US")}
                  </td>
                  <td className="py-2 pl-2 text-xs text-slate-500 align-top">
                    {col.sampleValues.slice(0, 3).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 5 — Kickoff questions */}
      <SectionCard title="Kickoff questions" subtitle="What to ask the client?">
        <ol className="space-y-3">
          {narrative.kickoffQuestions.map((q, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full flex items-center justify-center mt-0.5 tabular-nums">
                {i + 1}
              </span>
              <p className="text-sm text-slate-700 leading-relaxed">{q}</p>
            </li>
          ))}
        </ol>
      </SectionCard>

    </div>
  );
}
