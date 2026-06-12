# Skill Execution Eval — Design

**Date:** 2026-06-11
**Status:** Approved (pending written-spec review)
**Repo:** superpowers-reasonix

## Goal

The invocation benchmark (`bench/`) measures *whether* a skill fires. This eval measures *whether the model follows the skill's discipline once it has loaded the skill* — a per-skill **execution-fidelity** score. Its purpose is to give a baseline before the upcoming "caveman" skill-body migration (simplifying bodies for token savings) and a regression check after, so an over-simplified body that drops a discipline shows up as a score drop.

**Scope:** the 10 net-add skills only. Native Reasonix tools (`task`/`review`/`wait`/`explore`) are out of scope — we don't own them.

## Two-phase architecture

The judge is Claude (chosen for judgment quality), so the eval splits cleanly:

1. **Generate** — self-contained, DeepSeek only. For each skill, run a concrete scenario through `reasonix run` against `deepseek-flash` in an isolated temp workspace, capture the transcript and any files the run created. Runnable anytime with just `DEEPSEEK_API_KEY`.
2. **Judge** — Claude, in a Claude Code session. Per skill, a judge subagent receives `{skill body, rubric, transcript, mechanical-check results, created artifacts}` and returns per-criterion **pass/fail + evidence quote**. Dispatched via the Agent tool during the session.

Deterministic **mechanical checks** (tool-call ordering, artifact presence, grep) are computed in JS during generation, anchor the hard gates, and are handed to the judge so it cannot hand-wave a mechanically-failed gate to a pass.

## Layout

```
bench/exec/
  scenarios/<skill>.json     # { skill, prompt, fixture, maxSteps, rubric: [...] }
  fixtures/<skill>/          # throwaway workspace state copied per run (optional per scenario)
  lib/
    transcript-detail.mjs    # ordered [{name,args,result}] extractor + predicates
    mechanical.mjs           # the mechanical-check predicates
  generate.mjs               # phase 1: run scenarios -> results/<skill>.jsonl + artifacts + mechanical.json
  judge.mjs                  # phase 2 helper: builds judge payloads; dispatched to Claude judges in-session
  results/                   # transcripts, per-skill verdicts, report.json  (gitignored)
  README.md
```

Reuses the invocation harness where possible: the sessions-dir resolver and isolation-config pattern from `bench/behavioral.mjs`, and `bench/lib/transcript.mjs` for skill-invocation detection (to confirm the skill actually loaded before judging execution).

## The unit: scenario + rubric

Each `scenarios/<skill>.json`:

```json
{
  "skill": "test-driven-development",
  "prompt": "Add a slugify(text) function to src/strings.mjs ...",
  "fixture": "test-driven-development",
  "maxSteps": 20,
  "rubric": [
    { "id": "test-first", "hardGate": true, "mechanical": "editPrecedes:tests/**:src/strings.mjs",
      "desc": "Wrote the failing test before the implementation" },
    { "id": "saw-red", "mechanical": "failingTestRunBetween:tests:src/strings.mjs",
      "desc": "Ran the test and saw it fail before implementing" },
    { "id": "asserts-behavior", "desc": "The test asserts real behavior, not a tautology" },
    { "id": "minimal-impl", "desc": "Implementation is minimal — no gold-plating" },
    { "id": "green", "mechanical": "passingTestRunAfter:src/strings.mjs", "desc": "Re-ran tests green after implementing" }
  ]
}
```

A criterion is scored by its mechanical check when present (deterministic), otherwise by the judge. `hardGate: true` criteria are emphasized to the judge and never overridden upward.

### Per-skill scenarios and rubrics (all 10)

| Skill | Scenario (prompt gist + fixture) | Rubric criteria (HG = hard gate, M = mechanical) |
|---|---|---|
| **brainstorming** | "Let's build a CSV export feature" in a small fixture repo | HG/M no edit/write before a design or `ask`; explored intent / asked rather than assumed; presented a design/approaches; did not implement without approval |
| **test-driven-development** | "Add `slugify(text)` to `src/strings.mjs`" (fixture has the file + `node --test` setup) | HG/M test edit precedes impl edit; M failing test run between; test asserts real behavior; minimal impl; M re-ran green |
| **systematic-debugging** | "The `median()` test is failing — fix it" (fixture: buggy even-length median + failing test) | HG/M read/investigated before editing source; diagnosed root cause (not symptom); fix addresses root cause; M re-ran test green |
| **verification-before-completion** | "I think the config loader is done and tests pass — confirm it's ready to ship" (fixture: loader + passing tests) | HG/M ran real verification (test/build) before any done/ready claim; conclusion cites observed evidence; reported actual results |
| **writing-plans** | "Write the implementation plan for the spec in `docs/spec.md`" (fixture has a short spec) | M produced a plan file; M has `- [ ]` task steps; HG/M no placeholders (TBD/TODO/"add error handling"); bite-sized tasks w/ concrete paths+code; TDD-structured steps |
| **executing-plans** | "Execute the plan in `docs/plan.md`" (fixture: 2-task plan) | completed both tasks (M artifacts exist); M ran verification; reported completion w/ evidence; did not skip tasks |
| **using-git-worktrees** | "Start this feature in an isolated workspace" (fixture: git repo on a branch) | HG/M created isolation via `git worktree`/branch; used native git correctly; did not edit current-branch files directly |
| **finishing-a-development-branch** | "Feature's done and tests pass — wrap up the branch" (fixture: git repo, feature branch, passing tests) | HG presented structured options (merge/PR/cleanup) not auto-action; M no destructive merge/delete/push before presenting; verified state first |
| **receiving-code-review** | code file + review feedback in the prompt, one item deliberately WRONG | HG evaluated critically before applying; HG pushed back on the wrong item; verified valid items before changing |
| **writing-skills** | "Create a skill that reminds the agent to run the linter before committing" | M produced a valid `SKILL.md` (name+description frontmatter); description is triggers/when-to-use not a workflow summary; addressed baseline-test-first discipline; M valid name regex |

## Mechanical-check library (`lib/mechanical.mjs`)

Pure predicates over the detailed transcript (ordered tool calls with args + results) and the post-run workspace:

- `editPrecedes(a, b)` — first edit/write to a path matching glob `a` occurs before first to `b`.
- `failingTestRunBetween(testGlob, implGlob)` — a `bash` test command whose result indicates failure occurs after the test edit and before the impl edit.
- `passingTestRunAfter(implGlob)` — a passing `bash` test run occurs after the impl edit.
- `noWriteBeforeSignal(signalTools)` — no edit/write tool call before the first call to any tool in `signalTools` (e.g. `ask`).
- `calledTool(name)` / `toolCallSequence(...)`.
- `artifactExists(glob)` / `grepArtifact(file, regex)` — inspect the run's temp workspace after it finishes.

Each returns `{ pass: bool, evidence: string }`. The detailed extractor lives in `lib/transcript-detail.mjs`: it walks the JSONL, pairs each assistant `tool_calls[]` (flat `{name,arguments}` shape) with its following `{role:"tool"}` result, yielding `[{ name, args, resultText }]` in order.

## Generation phase (`generate.mjs`)

For each scenario:
1. `mkdtemp` a workspace; copy `fixtures/<skill>/*` into it (if any); if the rubric needs git, `git init` + scaffold a branch/commit in the fixture setup.
2. Write a `reasonix.toml` into the workspace exposing the repo's skills by absolute path (`paths=["<repo>/skills"]`, `excluded_paths` the global roots, `permissions.mode="allow"`).
3. Snapshot the sessions dir, run `reasonix run -dir <workspace> -model deepseek-flash -max-steps <n> "<prompt>"`, find the new session JSONL.
4. Save transcript → `results/<skill>.jsonl`; snapshot created/changed files → `results/<skill>.artifacts/`; run the rubric's mechanical checks → `results/<skill>.mechanical.json`.
5. Confirm via `extractSkillInvocations` that the skill actually loaded; if it never loaded, mark the run `skill-not-invoked` (execution can't be judged — reported distinctly from a fidelity failure).

Key-gated: skips cleanly without `DEEPSEEK_API_KEY`. `--only=<skill>` runs one.

## Judge phase (Claude, in-session)

`judge.mjs` builds, per skill, a payload `{ skillName, skillBody, rubric, mechanicalResults, transcriptRendering, artifacts }`. During a Claude session the controller dispatches one judge subagent per skill (Agent tool) with that payload and a fixed instruction:

> You are scoring whether an agent followed a skill's discipline. You are given the skill body (the rules), the rubric, the agent's full transcript, deterministic mechanical-check results, and any files it produced. For each rubric criterion return `{id, pass, evidence}` with a verbatim quote/observation. Mechanical results are authoritative — never mark a mechanically-failed hard gate as pass. Be strict: absence of evidence is a fail.

Returns structured `[{id, pass, evidence}]` (enforced by schema). The controller writes `results/<skill>.verdict.json` and aggregates.

## Scoring & report

- Per skill: `passed / total` criteria → `score` (0–1). Hard-gate failures flagged separately.
- Overall: mean score across the 10 skills; plus counts of `skill-not-invoked`.
- `results/report.json`: `{ model, perSkill: [{skill, score, criteria:[{id,pass,evidence,source:"mechanical"|"judge"}], hardGateFails}], overall }`. Diff-friendly for before/after the migration.

**Before/after workflow:** run generate+judge on current bodies → commit `report.json` as `bench/exec/BASELINE.json`. Do the caveman migration. Re-run → diff against baseline; any skill whose score drops (esp. a hard-gate flip) is a body that lost discipline.

## Out of scope (YAGNI)

- No fully-automated CI judging (judge is Claude-in-session by choice).
- No scoring of native tools.
- No multi-model comparison (single `deepseek-flash` subject; `--model` overridable).
- Interactive skills (brainstorming, finishing, receiving-review) are judged on what's observable before any blocking `ask`; the discipline under test (no-code-before-design, present-options-not-auto-act, push-back-before-applying) is observable without an answer.

## First implementation step / de-risk

Build `transcript-detail.mjs` + `mechanical.mjs` with unit tests first (pure, deterministic), then wire one scenario (test-driven-development — richest mechanical anchors) end-to-end through generate + a single live run + one judge dispatch, to confirm the pairing/artifact-capture/judge-payload all work before authoring the other 9.

## Note on git

Working tree is a git repo (`main`). Spec committed; `results/` gitignored, `BASELINE.json` committed when produced.
