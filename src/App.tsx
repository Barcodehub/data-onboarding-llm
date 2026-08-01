import { useState } from "react";
import "./App.css";
import type { AnalysisReport } from "./lib/analysis/types";
import type { LLMNarratorResponse } from "./lib/llm/types";
import { parseCsv } from "./lib/analysis/parseCsv";
import { inferTypes } from "./lib/analysis/inferTypes";
import { detectMissingData } from "./lib/analysis/findings/missingData";
import { detectInconsistentFormat } from "./lib/analysis/findings/inconsistentFormat";
import { detectDuplicates } from "./lib/analysis/findings/duplicate";
import { detectReferentialInconsistency } from "./lib/analysis/findings/referentialInconsistency";
import { narrateReport } from "./lib/llm/narrator";
import { UploadPanel } from "./components/UploadPanel";
import { ProgressStages } from "./components/ProgressStages";
import type { AnalysisStage } from "./components/ProgressStages";
import { Dashboard } from "./components/Dashboard";

type AppState =
  | { status: "idle" }
  | { status: "analyzing"; stage: AnalysisStage }
  | { status: "done"; report: AnalysisReport; narrative: LLMNarratorResponse; fileName: string }
  | { status: "error"; message: string };

export default function App() {
  const [state, setState] = useState<AppState>({ status: "idle" });

  async function handleAnalyze(file: File, apiKey: string) {
    try {
      setState({ status: "analyzing", stage: "parsing" });
      const parseResult = await parseCsv(file);

      setState({ status: "analyzing", stage: "profiling" });
      const columns = inferTypes(parseResult);

      setState({ status: "analyzing", stage: "detecting" });
      const findings = [
        ...detectMissingData(columns, parseResult.rows.length),
        ...detectInconsistentFormat(columns, parseResult.rows),
        ...detectDuplicates(columns, parseResult.rows),
        ...detectReferentialInconsistency(columns, parseResult.rows),
      ];

      const report: AnalysisReport = {
        rowCount: parseResult.rows.length,
        columnCount: columns.length,
        columns,
        findings,
        generatedAt: new Date().toISOString(),
      };

      setState({ status: "analyzing", stage: "narrating" });
      const narrative = await narrateReport(apiKey, report);

      setState({ status: "done", report, narrative, fileName: file.name });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    }
  }

  if (state.status === "idle" || state.status === "error") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <UploadPanel
          onAnalyze={handleAnalyze}
          error={state.status === "error" ? state.message : undefined}
        />
      </div>
    );
  }

  if (state.status === "analyzing") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <ProgressStages stage={state.stage} />
      </div>
    );
  }

  const { report, narrative, fileName } = state;
  const criticalCount = report.findings.filter((f) => f.severity === "critical").length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Compact bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium text-slate-800 truncate max-w-[200px]" title={fileName}>
            {fileName}
          </span>
          <span className="text-slate-300 flex-shrink-0">·</span>
          <span className="text-sm text-slate-500 whitespace-nowrap">
            {report.rowCount.toLocaleString("en-US")} rows · {report.columnCount} columns
          </span>
          <span className="text-slate-300 flex-shrink-0">·</span>
          <span className="text-sm font-medium text-red-600 whitespace-nowrap">
            {criticalCount} critical issue{criticalCount !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setState({ status: "idle" })}
            className="ml-auto text-sm text-indigo-600 hover:text-indigo-800 font-medium flex-shrink-0 transition-colors"
          >
            Analyze another file
          </button>
        </div>
      </div>

      {/* Dashboard */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Dashboard report={report} narrative={narrative} />
      </div>
    </div>
  );
}
