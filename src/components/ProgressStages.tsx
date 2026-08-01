export type AnalysisStage = "parsing" | "profiling" | "detecting" | "narrating";

const STAGES: { key: AnalysisStage; label: string }[] = [
  { key: "parsing",   label: "Parsing CSV" },
  { key: "profiling", label: "Profiling columns" },
  { key: "detecting", label: "Detecting issues" },
  { key: "narrating", label: "Generating narrative" },
];

export function ProgressStages({ stage }: { stage: AnalysisStage }) {
  const currentIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 max-w-lg w-full mx-4">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Analyzing…</h1>
      <p className="text-sm text-slate-500 mb-8">This takes a few seconds.</p>

      <div className="space-y-4">
        {STAGES.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div key={s.key} className="flex items-center gap-3">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors
                  ${done ? "bg-green-100 text-green-700" : active ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"}`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={`text-sm transition-colors
                  ${active ? "text-slate-900 font-medium" : done ? "text-slate-400" : "text-slate-400"}`}
              >
                {s.label}
              </span>
              {active && (
                <svg
                  className="animate-spin h-4 w-4 text-indigo-500 ml-auto"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
