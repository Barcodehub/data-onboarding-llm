# NOTES.md

## AI tools used, and how

I used Claude throughout — Claude.ai (browser) for design and review,
Claude Code for implementation. My workflow: I'd work out the design
and decisions in conversation with Claude first (contracts, heuristics,
severity criteria), then hand that agreed-upon design to Claude Code to
implement. I reviewed every file before accepting it — several times I
rejected generated code and asked for specific corrections before
accepting (see below).

I also used Claude Code for the UI (React + Tailwind components),
following a frontend design skill available in the environment.

## Something that worked well

Defining the type contracts (`Finding`, `ColumnProfile`,
`LLMNarratorResponse`) before writing any logic. This avoided rewrites —
every new detection rule or UI component already knew exactly what
shape of data to expect, without renegotiating the interface halfway
through implementation.

Extracting shared patterns (date format detection, disguised-null
detection) into their own modules (`patterns/dateFormats.ts`,
`patterns/nulls.ts`) as soon as I noticed two files needed the same
logic — this prevented the same rule from existing in two places and
drifting out of sync.

## Where the AI got it wrong, and how I noticed

The clearest case: while implementing `duplicate.ts`, the row
comparison (for both exact-duplicate detection and business-key
divergence) compared raw values without normalization. This meant two
semantically identical rows — one with `csat_score=""` and another with
`csat_score="N/A"` in the same column — would have been treated as
different rows, or worse, flagged as a suspicious "data divergence" in
the key-collision finding. I caught this because we had already solved
the same problem in another file (`inferTypes.ts` normalizes disguised
nulls before inferring type) and I recognized the same risk pattern —
a comparison bypassing normalization logic that already existed in the
project. The fix was reusing `isDisguisedNull` from the shared module
instead of comparing raw strings.

A subtler case: the heuristic for classifying a column as "id"
originally required `distinctRatio > 0.9` on top of the prefix-number
pattern. This excluded legitimate business identifiers like `cust_id`
(the same customer appears across multiple orders, so it never reaches
90% uniqueness) — the uniqueness gate was meant as a safeguard but
ended up blocking the exact case it should have captured. I caught this
by running the inference against the real CSV and seeing `cust_id` fall
into "unknown" despite matching the ID pattern 100% of the time.

## What I decided to cut, and why

- **Outlier detection** (exists as a category in the type contract but
  was never implemented): I prioritized `referential_inconsistency`
  instead, because it surfaces verifiable business problems
  (`qty × unit_price ≠ line_total`), whereas a statistical outlier (IQR
  over numeric columns) flags anomalies that need more business context
  to know whether they're a real problem or just legitimate variation.

- **Casing inconsistency in categorical columns** (`ship_country`:
  `canada`/`us`/`U.S.`, `ord_status`: `Returned`/`pending`/`COMPLETED`):
  identified during the initial CSV inspection, but
  `inconsistentFormat.ts` only covers `date`-type columns. Extending it
  to categoricals is straightforward but was cut for time.

- **Numeric fidelity validation of the LLM's narrated text**: I
  validate that every `findingId` cited in `keyRisks` is real (there's
  a code-level check for this, not just a prompt instruction), but I
  don't validate that the figures *inside* the narrated text exactly
  match the referenced finding — I only spot-checked this manually
  against one real API run.

- **Worker thread for CSV parsing**: `Papa.parse` runs on the main
  thread. Not noticeable at 1,182 rows, but a much larger CSV would
  freeze the UI during parsing.

## Roughly how long I spent

About 6.5–7 hours, spread across analysis engine design and
implementation, LLM integration, and the UI.

## What I'd do with two more days

- Extend `inconsistentFormat.ts` to cover casing/normalization in
  categorical columns, not just dates.
- Implement outlier detection (IQR) as a fifth findings rule.
- Replace the manual verification scripts with real Vitest tests on
  the pure functions in the analysis engine (`inferTypes`, each
  `findings/` rule, `selectBusinessKey`) — they're already pure and
  easy to test, I just ran out of time to formalize them.
- Add `worker: true` to PapaParse plus a real progress bar for large
  CSVs.
- Validate numeric fidelity in the LLM's narrated text against the
  exact figures in the referenced finding, not just findingId existence.

## Known limitations (technical detail)

**`dateFormats.ts`** — The bounds guard in `MM/DD/YYYY`
(`month > 12 || day > 31`) is technically redundant: `Date.parse` on
the resulting ISO string already rejects invalid calendar dates. It
does no harm and makes the intent more explicit, so I kept it.

The `"Mon DD, YYYY"` format relies on V8's legacy `Date.parse` parser,
which silently rolls over invalid dates instead of rejecting them
(e.g. `"Feb 30, 2024"` parses as March 1st rather than failing). Low
risk with real business data, but it's a known limitation of relying
on `Date.parse` without a dedicated date library.

**`inconsistentFormat.ts`** — When a date column has values that don't
match any supported format (`typeConfidence` < 100%), those values
count toward `affectedRowCount` but aren't broken out in the
`description` text — the listed format percentages may not sum to 100%
on a different CSV. Doesn't occur with `order_dt` in the sample dataset
(already 100% recognized).