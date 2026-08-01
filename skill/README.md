# skill/README.md

## What this is
A Claude Skill encoding a rule I had to enforce repeatedly while building
this project: whenever code calls an LLM to narrate already-computed data,
guaranteeing the JSON *shape* is not enough — the *content* (references,
figures) must be validated against the source data in code, not just
requested via prompt.

## How to install
Copy the `grounded-llm-narration/` folder into your project's
`.claude/skills/` directory (or wherever your Claude Code / Claude.ai
project skills live). Claude will surface it automatically when a task
involves writing code that calls an LLM to summarize or narrate data.

## Where it was actually used in this project
`src/lib/llm/narrator.ts` — the narrator call for the dashboard's executive
summary and key risks. First version relied on prompt instructions alone;
this skill's rule 2 is why the final version filters `keyRisks` against
real `finding.id` values after the API call.
