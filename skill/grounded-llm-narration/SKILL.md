---
name: grounded-llm-narration
description: Use when writing code that calls an LLM to narrate, summarize, or explain data that was already computed deterministically (e.g. a report, a findings list, a metrics summary). Enforces that the LLM's output is both structurally guaranteed and factually grounded in the source data — not just prompted to behave.
---

# Grounded LLM Narration

## The problem this solves

When an LLM is asked to turn computed data into natural-language narrative,
two independent failure modes can occur, and they require two independent
fixes:

1. **Structural failure** — the LLM doesn't return the shape you asked for
   (markdown fences, extra prose, malformed JSON).
2. **Content failure** — the LLM returns the correct shape, but invents a
   reference, ID, or figure that doesn't exist in the input data. A
   correctly-shaped JSON object can still contain a hallucination.

A system prompt instruction like "don't invent numbers" only reduces the
second failure mode's likelihood. It does not prevent it. Treat prompt
instructions as a hint, not a guarantee.

## Rules to follow

1. **Force structured output**, don't request free-text JSON. Use tool use /
   function calling with a forced tool choice (or the equivalent structured
   output feature of the provider being used), matching the exact schema of
   your output type. This solves failure mode 1 completely — it does not
   touch failure mode 2.

2. **Validate references after the call, in code.** If the LLM's output is
   supposed to reference IDs, keys, or entities from the input (e.g. "cite
   the finding you're explaining by its id"), build a set of valid
   references from the actual input data, and filter or reject any output
   item whose reference isn't in that set. Do this even though the prompt
   already asks the model not to invent references — the prompt instruction
   is not the enforcement mechanism, the post-call filter is.

3. **Never let the LLM compute.** If a number needs to appear in the
   narration, it must come from a field the deterministic code already
   calculated, not from the LLM performing arithmetic or estimation, and
   the prompt must say so explicitly ("only cite figures that appear
   literally in the input, never round or estimate").

4. **Decide what happens on validation failure — don't let it fail silently
   and don't let it crash the whole response.** Prefer: filter out the
   invalid item, log a warning, and only hard-fail if the result is
   structurally empty of anything meaningful (e.g. zero valid risks
   despite critical issues existing in the input) — that's a strong signal
   the model didn't anchor its answer to the data at all.

5. **Minimize what you send.** Don't pass the LLM more raw data than the
   narration task needs (e.g. don't pass every column's full statistical
   profile if only a subset is relevant to interpretation). This isn't just
   a cost optimization — every extra field is another thing the model could
   misattribute or blend into a hallucinated claim.

## Anti-pattern this skill prevents

```
// DON'T: shape guaranteed, content unverified
const result = await callLLM(prompt, data);
return result; // trusts the model did what the prompt said

// DO: shape guaranteed AND content verified against source
const result = await callLLM(prompt, data, { forceTool: true });
const validIds = new Set(data.items.map(i => i.id));
const verified = result.claims.filter(c => validIds.has(c.refId));
if (verified.length === 0 && data.items.some(i => i.critical)) {
  throw new Error("Model did not anchor output to real data");
}
return { ...result, claims: verified };
```
