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