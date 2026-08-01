# Data Onboarding Assistant — Context for Claude Code

## What This Is
React app (Vite + TS + Tailwind, no backend) that analyzes a client's CSV
(fictional: Lakeside Provisions) and produces an honest data quality
assessment, with an LLM-narrated section. Technical challenge for Keyrus.

## Architecture Rules — do not break without discussing first

1. **The contracts are fixed.** `src/lib/analysis/types.ts`,
   `src/lib/llm/types.ts`, and `src/lib/dashboard/sections.ts` define the
   project's interfaces. If you need to change them, say so explicitly
   before touching them — don't modify them silently as a side effect
   of another task.

2. **Generic, not hardcoded.** The analysis must work with any reasonable
   CSV, not just `data/lakeside_orders_sample.csv`. Any
   `if (columnName === 'order_dt')` or equivalent is forbidden. Type
   inference and finding rules work on patterns (format, distribution,
   nulls), not on known column names.

3. **The LLM never calculates, only narrates.** The analysis engine
   (`src/lib/analysis/`) is 100% deterministic code and must be testable
   without calling any LLM. The LLM only receives the already-calculated
   `AnalysisReport` (columns + findings) and translates it into natural
   language / kickoff questions. It must never generate a figure that
   doesn't come literally from the report — if you notice it doing so,
   that's a prompt bug, fix it and note it in `NOTES.md` as something
   you corrected.

4. **A single well-designed LLM call**, not multiple small calls.
   Use structured output / tool use against `LLMNarratorResponse` in
   `src/lib/llm/types.ts`, not free-text parsing with regex.

5. **Pure functions in `src/lib/analysis/findings/`.** Each detection
   rule is `(rows: ParsedRow[], columns: ColumnProfile[]) => Finding[]`.
   No side effects, no React dependencies. Must be testable by calling
   it directly with sample data.

6. **Never hardcode an API key or commit it in `.env`.** The user pastes
   it into a UI input, kept only in memory (React state), never in
   `localStorage`. `dangerouslyAllowBrowser: true` is intentional and
   must include a comment `// NOTE:` explaining why it's acceptable in
   this context (no backend is possible).

## Implementation Order (do not skip steps)

1. `src/lib/analysis/parseCsv.ts` — parsing with PapaParse
2. `src/lib/analysis/inferTypes.ts` — column profiling
3. `src/lib/analysis/findings/*.ts` — one rule at a time:
   `missing_data` → `duplicate` → `inconsistent_format` → `outlier` →
   `referential_inconsistency`
4. Validate each rule against the actual `data/lakeside_orders_sample.csv`
   before moving to the next
5. `src/lib/llm/narrator.ts` — only when there are real `Finding[]` items
6. UI — only at the end, once analysis and LLM are already tested

## How to Validate That a Finding Rule "Actually Works"

Compiling is not enough. Before marking a rule as complete, confirm that
it detects at least one real case in `data/lakeside_orders_sample.csv`
(for example: mixed date formats in `order_dt`, inconsistent casing in
`ship_country`/`ord_status`, `line_total` that doesn't match
`qty * unit_price`). If a rule doesn't detect anything in this CSV,
check whether the bug is in the rule before assuming the CSV doesn't
have that problem.

## Useful Commands
- `npm run dev` — start the app
- `npm run build` — verify it compiles without type errors

## At the End of a Work Session
Update `PROGRESS.md` with: what was done, what decision was made and why
(if there was any non-trivial one), and what's next. Keep it brief —
these are notes to pick up context, not formal documentation.