# Progress Log

Checkpoint notes between sessions. Format: brief and focused on
"what I need to know to resume work without rereading the entire codebase."

---

## 2026-07-31 — Session 0 (planning, no product code yet)

**Completed:**

- Scaffolded Vite + React + TypeScript + Tailwind project
- Configured `.gitignore` (`node_modules`, `dist`, `.env*`)
- Defined the three initial contracts:
  - `src/lib/analysis/types.ts` (`Finding`, `ColumnProfile`, `AnalysisReport`)
  - `src/lib/llm/types.ts` (`LLMNarratorRequest/Response`)
  - `src/lib/dashboard/sections.ts` (dashboard sections and the business question each section answers)

- Added the sample dataset at `data/lakeside_orders_sample.csv`.
- Manually inspected the dataset structure and sample rows.
  The file appears to be a valid CSV. The issue observed in Excel seems related to delimiter interpretation rather than the file itself.

  Initial observations from sample rows:
  - `order_dt`: multiple date formats detected
  - Potential normalization issues in categorical fields:
    - `currency`
    - `ship_country`
    - `ord_status`
    - `prod_cat`
  - `disc_pct`: mixed representations (`5%`, `0.0`, `20 %`)
  - `csat_score`: missing values observed
  - `line_total`: potential mismatch with `qty * unit_price`, requiring business rule validation. Candidate for a `referential_inconsistency` finding.

**Decisions made:**

- Use a single LLM call as a data quality narrator instead of multiple calls per column.
  This reduces cost and avoids unnecessary opportunities for hallucination.
- The LLM receives only the summarized `AnalysisReport`, never raw rows.
- Findings will be implemented as pure functions to keep analysis logic testable and independent from the UI.

**Next step:**

- Implement `parseCsv.ts` and `inferTypes.ts`.
- Start with the simplest finding rule (`missing_data`) to validate the full pipeline end-to-end before implementing more complex rules.
- Implement `referential_inconsistency` later because it provides higher business value but requires more context about relationships between columns.

**Nothing blocked. Nothing broken.**


## 2026-07-31 — Session 1 (CSV parsing)

**Completed:**

- Implemented `src/lib/analysis/parseCsv.ts` using PapaParse.
- Parser preserves raw cell values and only normalizes headers.
- Added `parseErrors` collection for malformed CSV rows.
- Validated parser against `data/lakeside_orders_sample.csv`:
  - 1182 rows detected
  - 22 columns detected
  - 0 parsing errors

**Decision:**

- CSV parsing intentionally does not clean or normalize data.
  Data quality issues must remain visible for the analysis engine
  to detect later.

**Next step:**

- Implement `inferTypes.ts` to generate column profiles with
  inferred types and confidence scores.



## 2026-07-31 — Session 2 (type inference)

Completed:
- Implemented `src/lib/analysis/inferTypes.ts`.
- Added value-based type inference with confidence scoring.
- Supported inferred types:
  - id
  - date
  - number
  - boolean
  - categorical
  - string
  - unknown

Design decisions:
- Type inference never uses column names.
- Confidence is calculated only from non-null values.
- Null detection is tracked separately.
- ID detection uses structural pattern matching instead of strict uniqueness.
- Boolean detection runs before number to avoid 0/1 columns being misclassified.
- Unknown is reserved for columns with insufficient classification signal.

Validation:
- Tested against `data/lakeside_orders_sample.csv`.
- Confirmed:
  - order_id → id
  - cust_id → id
  - prod_sku → id
  - qty → number
  - cust_name → string
  - cust_email → string

Next:
- Implement first findings rule:
  `missing_data`


## 2026-07-31 — Session 3 (missing_data finding)

Completed:
- Implemented `src/lib/analysis/findings/missingData.ts`.
- Added the first data quality finding rule.
- The rule operates only on `ColumnProfile[]` and does not access raw rows.

Design decisions:
- Missing data severity:
  - `critical`: any missing value in an inferred `id` column
  - `warning`: null percentage >= 30%
  - `info`: null percentage > 0% and below 30%
  - no finding when null percentage is 0%
- `totalRows` is passed explicitly to the rule instead of being reconstructed
  from `nullCount` and `nullPercentage`.
- Row-level evidence is not tracked yet because ColumnProfile stores
  aggregates only. Detailed evidence will be reserved for findings where it
  provides more value.

Validation:
- Tested against `data/lakeside_orders_sample.csv`.
- Generated 12 `missing_data` findings.
- Confirmed:
  - `csat_score` produces an `info` finding at 13.6% missing values.
  - No false `critical` findings were generated for ID columns.

Next:
- Implement `inconsistent_format` finding.
- Reuse existing date detection logic instead of duplicating format rules.

## 2026-08-01 — Session 4 (shared date patterns)

Completed:
- Extracted all date format detection into
  `src/lib/analysis/patterns/dateFormats.ts`.
- `inferTypes.ts` now reuses the shared date matcher instead of maintaining
  its own regexes.
- Added support for six date representations:
  - ISO (`YYYY-MM-DD`)
  - DD-MM-YYYY
  - Mon DD, YYYY
  - MM/DD/YYYY
  - ISO DateTime (`YYYY-MM-DD HH:MM:SS`)
  - Unix Epoch (seconds)

Design decisions:
- Date format detection now has a single source of truth that will also be
  reused by the upcoming `inconsistent_format` finding.
- Unix epoch detection is intentionally limited to epoch seconds and
  validated with a year range (2000–2030) to avoid false positives from
  large numeric identifiers.
- DateTime values are considered valid dates rather than data quality
  issues because they represent the same semantic type with higher
  precision.

Validation:
- Refactored `inferTypes.ts` without changing the overall inference logic.
- Smoke-tested against the Lakeside dataset.
- `order_dt` classification improved:
  - `string` (60.8%)
  - → `date` (80.7%) after adding `MM/DD/YYYY`
  - → `date` (100%) after supporting ISO DateTime and Unix Epoch.
- Confirmed all observed `order_dt` values match one of the supported
  formats.

Next:
- Implement `inconsistent_format`.
- Reuse `matchDateFormat()` to identify mixed date formats within the same
  column and generate findings with sample evidence.

## 2026-08-01 — Session 5 (inconsistent_format finding + shared null detection)

Completed:
- Implemented `src/lib/analysis/findings/inconsistentFormat.ts`.
- Extracted `DISGUISED_NULL_SET` into `src/lib/analysis/patterns/nulls.ts`
  as a single source of truth, replacing duplicated copies in
  `inferTypes.ts` and the new finding (same principle applied earlier
  to date formats).

Design decisions:
- Scope limited to columns with `inferredType === "date"` for this
  version (categorical casing inconsistencies like `ship_country`
  variants are deferred to a separate rule, not mixed into this one).
- Severity escalation: findings involving "Unix Epoch (seconds)" or
  "ISO DateTime" are escalated above plain date-style mismatches —
  critical if these formats combined represent >=10% of values,
  otherwise escalated one level with a warning floor. Rationale: these
  formats break naive column reads more severely than a stylistic
  date-format difference.
- `sampleEvidence` intentionally breaks from the `missing_data`
  convention (generic message) and includes real raw values instead,
  prioritizing severe formats first — concrete evidence adds real
  credibility here at no extra cost.

Known limitation (documented, not fixed):
- Unrecognized values (`typeConfidence < 100%`) count toward
  `affectedRowCount` but aren't broken out in the description text —
  percentages listed may not sum to 100% on a CSV where this occurs.
  Doesn't manifest on the current dataset (`order_dt` is 100% recognized).

Validation:
- Tested against `data/lakeside_orders_sample.csv`.
- `order_dt` → 1 finding, severity `critical`, 55.2% affected, 6 formats
  detected, `sampleEvidence` correctly leads with ISO DateTime and Unix
  Epoch examples.
- `ship_dt` → no finding (100% ISO, single format — correct, no noise).
- Refactor of null detection into `patterns/nulls.ts` verified to produce
  identical output before/after (pure extraction, no behavior change).

Next:
- Implement `duplicate.ts` with two sub-checks: exact duplicate rows,
  and same business key with divergent data. Business key candidate
  is derived generically (highest distinctRatio among columns with
  `inferredType === "id"`), not hardcoded to any column name.

  ## 2026-08-01 — Session 6 (business key selection + duplicate finding)

Completed:
- Implemented `src/lib/analysis/findings/selectBusinessKey.ts`.
- Implemented `src/lib/analysis/findings/duplicate.ts`.

Design decisions:
- Business key selection is deterministic and value-based (never looks
  at column names): candidates limited to `inferredType === "id"`
  columns, excludes candidates with `nullPercentage >= 5%`, requires
  `distinctRatio >= 0.95` to qualify, and requires a `>=0.03` margin
  over the runner-up when multiple candidates qualify. If no candidate
  clears the bar (or the margin is too close), the function returns
  `null` and Check B is skipped entirely rather than guessing — a
  false "duplicate" finding is worse than no finding.
- `duplicate.ts` runs two independent checks: exact full-row duplicates
  (Check A) and same business key with divergent data in other columns
  (Check B). Check B is skipped cleanly when `selectBusinessKey`
  returns `null`.
- Severity: exact duplicates are `critical` if they affect >=2% of
  rows, `warning` otherwise (near-universal signal of an ingestion
  issue). Business key collisions are always `critical` — a repeated
  identifier with contradictory data is structurally serious
  regardless of volume.
- Both checks normalize disguised-null variants (reusing
  `isDisguisedNull` from `patterns/nulls.ts`) before comparing values,
  so `""` vs `"N/A"` in the same column isn't misread as either a
  non-duplicate (Check A) or a false divergence (Check B).

Validation:
- Tested against `data/lakeside_orders_sample.csv`.
- Business key selection: `order_id` selected unambiguously
  (`distinctRatio` 0.9729), `cust_id` (0.28) and `prod_sku` (0.61)
  correctly excluded — they repeat by business design.
- Check A: 40 rows / 19 groups of exact duplicates → `critical`.
- Check B: 25 rows / 12 groups with genuine divergence → `critical`
  (8 diverge in `qty`, 3 in `ord_status`, 1 group of 3 rows diverging
  in `qty`).
- Confirmed the two checks partition cleanly (19 + 12 groups, zero
  overlap) after the normalization fix — before the fix, disguised-null
  variants were bleeding false divergence into Check B.

## 2026-08-01 — Session 7 (referential_inconsistency finding — analysis engine complete)

Completed:
- Implemented `src/lib/analysis/findings/referentialInconsistency.ts`.

Design decisions:
- Discovers the A × B ≈ C relationship generically across all numeric
  columns with variance: evaluates every unordered pair (A, B) against
  every remaining column C, selects the triplet with the highest match
  ratio if it exceeds 70%, otherwise emits nothing.
- Tolerance: max(0.01 absolute, 1% relative) to absorb cent-level
  rounding without masking genuine discrepancies.
- Degenerate columns (uniqueCount <= 1) are excluded up front to avoid
  spurious matches against near-constant columns.
- Severity: `critical` if affected rows >= 2%, `warning` otherwise.

Validation:
- Tested against `data/lakeside_orders_sample.csv`.
- Detected triplet: `qty × unit_price → line_total` (as expected from
  the initial manual inspection — confirmed without any hardcoded names).
- Finding: `critical`, 94 rows (8.0%) where line_total ≠ qty × unit_price.
- Sample: qty=250, unit_price=45.54 → expected 11385.00, got 14535.39
  (discrepancy 3150.39).

**Analysis engine is now complete for this phase.**

Implemented findings rules:
- `missing_data` ✓
- `inconsistent_format` ✓ (date columns only)
- `duplicate` ✓ (exact rows + business key collision)
- `referential_inconsistency` ✓ (A × B ≈ C, generic)

Next:
## 2026-08-01 — Session 8 (narrator.ts — LLM layer complete)

Completed:
- Implemented `src/lib/llm/narrator.ts`.

Design decisions:
- `LLMNarratorRequest.columns` is typed as `ColumnProfile[]` in the
  contract (`types.ts` unchanged). Internally, narrator.ts uses a local
  `ColumnSummary` type (`Pick<ColumnProfile, "name" | "inferredType"> &
  { sampleValues?: string[] }`) and a `NarratorPayload` type that overrides
  the columns field. The contract is never touched; only the JSON payload
  is narrowed.
- Cryptic column heuristic (`isCrypticColumnName`): triggers on columns
  with length <= 12 AND either a known abbreviated prefix/suffix (`_cd`,
  `_dt`, `cust_`, `prod_`, `chnl`, `pmt_`) or a vowel ratio < 30%
  (abbreviations like `qty`, `disc_pct`). Sample values (max 3) are added
  only for cryptic columns, keeping the payload tight.
- findingId hallucination guard: after receiving the tool_use block, filters
  `keyRisks` against a Set of real finding IDs from the input report.
  Warns on each removed entry. Throws if keyRisks becomes empty while
  critical findings are present in the input.
- Single forced tool_use call (`tool_choice: { type: "tool", name: ... }`)
  against `LLMNarratorResponse` shape.

Validation (dry run via `_preview_narrator.ts`):
- 16 findings detected: 4 critical, 0 warning, 12 info.
- Payload: 8,055 characters, 15/22 columns with sample values.
- All 4 critical findingIds present in the payload — LLM has real IDs
  to anchor to.
- System prompt HARD RULE verified: all citable figures (`94 rows`,
  `8.0%`, `3.4%`, `55.2%`, etc.) appear literally in the findings JSON.

## 2026-08-01 — Session 9 (UI — implementation complete)

Completed:
- Replaced scaffold App.tsx/App.css with a clean single-page application.
- State machine in App.tsx: idle → analyzing → done → error (no router).
- `analyzing` state shows real pipeline stages with a spinner:
  Parsing CSV → Profiling columns → Detecting issues → Generating narrative.
- `done` state: compact sticky bar (filename, row/column counts, critical count,
  "Analyze another file" button) + full dashboard below.
- Components created:
  - `src/components/UploadPanel.tsx` — drag-and-drop file zone + API key field
  - `src/components/ProgressStages.tsx` — 4-stage indicator with done/active/pending states
  - `src/components/Dashboard.tsx` — 5 sections following DASHBOARD_SECTIONS order:
    Overview (executive summary), Data health (severity cards + full findings list),
    Key risks (LLM key risks with linked finding stats), Column explorer (table),
    Kickoff questions (numbered list)
- Zero TypeScript errors. Dev server confirmed running at http://localhost:5173.

Decisions:
- API key is never stored — held only in UploadPanel local state, passed directly
  to handleAnalyze, discarded after the LLM call.
- "Analyze another file" resets to idle, which unmounts UploadPanel and re-creates
  it fresh (no leftover file or key from prior run).

Nothing blocked. Project is functionally complete per CLAUDE.md scope.