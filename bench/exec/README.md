# Skill Execution Eval

Measures whether `deepseek-flash` follows each of the 10 net-add skills'
disciplines once the skill is loaded — a per-skill fidelity score to baseline
before / regression-check after the caveman skill-body migration.

## Why this exists (dogfooding `superpowers-writing-skills`)

The `superpowers-writing-skills` skill says writing a skill IS test-driven: write a
pressure scenario, watch an agent fail *without* the skill, then verify it complies
with the skill loaded. This eval is that thesis executed against a real model — each
scenario force-loads a skill body, runs it under pressure in an isolated workspace,
and mechanically checks whether the discipline actually held. The skill preaches
"test your skills"; this is the harness that does it.

## Run (two phases)

```bash
# Phase 1 — generate (self-contained; needs DEEPSEEK_API_KEY in env or .env)
node bench/exec/generate.mjs                 # all scenarios
node bench/exec/generate.mjs --only=superpowers-test-driven-development

# Phase 2 — judge (in a Claude Code session): for each skill, build the payload
node bench/exec/judge.mjs --only=<skill>     # prints the judge payload
# ...then dispatch a Claude judge subagent with JUDGE_INSTRUCTION + payload,
# forcing JUDGE_SCHEMA, and write its {criteria:[...]} to results/<skill>/verdict.json

# Score — merge mechanical + judge verdicts
node bench/exec/score.mjs                     # writes results/report.json + prints the table

node --test bench/exec/lib/*.test.mjs bench/exec/scenarios.test.mjs   # harness unit tests
```

## How it works

The generator runs each scenario in an isolated temp workspace, force-loading the
skill (an explicit "use the <skill> skill" preamble — this eval measures EXECUTION,
not invocation, so the body must be in context). It captures the transcript, the
files produced, and deterministic mechanical-check results.

Each rubric criterion is scored by its **mechanical** check when it has one (hard
gates: test-before-impl, ran-verification, no-placeholders, …), otherwise by the
**Claude judge** reading the transcript. Mechanical results are authoritative — the
judge can't pass a mechanically-failed hard gate. Per-skill score = criteria passed
/ total; overall = mean over skills that actually loaded (a `NOT-INVOKED` skill is
reported separately).

## Before/after the body migration

1. Run generate + judge + score on current bodies; copy `results/report.json` to `BASELINE.json` and commit.
2. Do the caveman body migration.
3. Re-run; diff against `BASELINE.json`. Any skill whose score drops — especially a hard-gate flip — is a body that lost discipline.
