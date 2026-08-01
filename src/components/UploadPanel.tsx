import { useRef, useState } from "react";

interface Props {
  onAnalyze: (file: File, apiKey: string) => void;
  error?: string;
}

export function UploadPanel({ onAnalyze, error }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.name.endsWith(".csv")) setFile(dropped);
  }

  const canSubmit = !!file && apiKey.trim().length > 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 max-w-lg w-full mx-4">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Data Onboarding Assistant</h1>
      <p className="text-sm text-slate-500 mb-6">
        Upload a client CSV to receive an instant data quality assessment.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-5
          ${dragging
            ? "border-indigo-400 bg-indigo-50"
            : file
            ? "border-green-300 bg-green-50"
            : "border-slate-300 hover:border-slate-400 bg-slate-50"
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
        />
        {file ? (
          <div>
            <p className="text-sm font-medium text-green-700">✓ {file.name}</p>
            <p className="text-xs text-slate-400 mt-1">Click to change file</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-600">Drop a CSV file here, or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">.csv only</p>
          </div>
        )}
      </div>

      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        Anthropic API key
      </label>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-ant-..."
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <button
        onClick={() => { if (canSubmit) onAnalyze(file!, apiKey.trim()); }}
        disabled={!canSubmit}
        className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium
          hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Analyze
      </button>
    </div>
  );
}
