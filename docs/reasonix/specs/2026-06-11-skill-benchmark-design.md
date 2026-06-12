# Skill Benchmark — Design

**Date:** 2026-06-11
**Status:** Approved (pending written-spec review)
**Repo:** superpowers-reasonix

## Goal

A repeatable, two-stage benchmark that proves this repo's skills:

1. **Load correctly** into Reasonix (structural — deterministic, no API).
2. **Actually get invoked** when a realistic user prompt should trigger them (behavioral — runs real `reasonix run` invocations and observes which skill fired).

"Make sure skills are invoked correctly" = both halves: a skill that doesn't parse can't be invoked, and a skill that parses but never fires for the prompts it's meant for is also broken.

## Environment facts (verified against the installed binary, not the docs)

The `extending-reasonix` reference skill documents the Go `main-v2` source. The installed binary is **`reasonix npm-v1.4.0-rc.1`**, which diverges. All of the following were probed directly:

- Config resolution: `flag > ./reasonix.toml > ~/.config/reasonix/config.toml > built-in`. The active user config is `~/Library/Application Support/reasonix/config.toml`.
- Default model `deepseek-flash`; `deepseek-pro` also available (both `key:present`). Model names differ from the docs' `deepseek-chat`/`deepseek-reasoner`.
- `[skills] paths`, `excluded_paths`, `disabled_skills`, `max_depth` are all supported.
- Hooks supported via `~/.reasonix/settings.json` (flat-object schema: `{command, match, description, timeout}`). A hector `PreToolUse` hook already lives there — the benchmark must NOT touch it.
- Sessions are JSONL in OpenAI message format. Tool calls appear as `{role:"assistant", tool_calls:[{function:{name, arguments}}]}` and results as `{role:"tool", name, tool_call_id, content}`. This is the observability source.
- `reasonix run` flags: `-dir`, `-model`, `-max-steps`, `-metrics <path>` (writes token/cache/cost JSON), `-resume`, `-continue`, `-show-thinking`.
- The key resolves from `.env` in the repo root or the shell env (CI), via Reasonix's own resolution — confirmed by `reasonix doctor` showing `key:present`.
- **Pollution risk:** `~/.reasonix/skills/` already contains an *older* set of flat `superpowers-*.md` skills. The benchmark isolates against these so results reflect only this repo's `skills/`.

## Architecture

Runtime: **plain Node (ESM, zero external dependencies)** — `node:fs`, `node:child_process`, `node:path` only. Node is guaranteed since Reasonix ships via npm. No `package.json` install step required.

```
bench/
  reasonix.toml          # isolation config: [skills] paths=["../skills"], excludes the global
                         #   ~/.reasonix/skills root, permissions mode=allow (headless, no prompts)
  structural.mjs         # Stage 1 — deterministic SKILL.md validator
  behavioral.mjs         # Stage 2 — run cases through `reasonix run`, parse session JSONL, score
  cases.jsonl            # corpus: one JSON object per line
  bench.mjs              # entry point: structural gate, then behavioral if a key is resolvable
  results/               # run artifacts (session copies, metrics, score reports) — gitignored
  README.md              # how to run, how to add cases
```

`bench/.gitignore` ignores `results/`.

## Stage 1 — Structural validator (`structural.mjs`)

Deterministic, no API. For every `skills/*/SKILL.md`:

- Frontmatter fence opens with `---` and closes; unclosed fence = error (whole file would be body).
- Parse frontmatter with a minimal parser mirroring Reasonix's: `key: value`, keys lowercased, one layer of quote-stripping, YAML-list and one-level section-flatten cases supported. Not a full YAML lib.
- `name` (frontmatter override or dir stem) matches `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`.
- **Discoverability contract:**
  - The 14 process/workflow skills MUST have a non-empty `description`.
  - The 3 worker skills (`task-implementer`, `spec-reviewer`, `code-reviewer`) MUST have NO `description` (intentionally invisible per README).
  - This mapping lives in a small `KNOWN` table in the script so drift is caught.
- The rendered pinned-index line `- <name>[ 🧬 subagent] — <description>` is ≤ 130 chars.
- Sum of all index lines ≤ 4000 chars (index cap).
- Subagent skills (`runAs: subagent`, or `context: fork`, or non-empty `agent:`): `allowed-tools`, if present, are all real registry tool names (validated against a known snake_case set: `read_file, edit_file, multi_edit, write_file, bash, grep, glob, ls, web_fetch, todo_write, ask, run_skill, read_skill, explore, review, research, security_review`). Unknown names are errors (Reasonix silently drops them).
- Any `references/*.md` siblings exist and are non-empty (empty ones are skipped by Reasonix → likely a mistake → warn).
- Optional warn: subagent `model:` frontmatter that doesn't resolve to a configured provider.

Exit non-zero on any error; warnings don't fail. Output: a per-skill PASS/WARN/FAIL table.

## Stage 2 — Behavioral runner (`behavioral.mjs`)

For each case in `cases.jsonl`:

1. Snapshot the sessions dir filenames (`~/Library/Application Support/reasonix/sessions/`).
2. Run `reasonix run -dir <repo-root> -model <model> -metrics results/<id>.metrics.json "<prompt>"`, inheriting `process.env` so the key resolves. `-max-steps` capped (e.g. 8) so a misbehaving case can't run away.
3. Diff the sessions dir → the new `.jsonl` is this run's transcript; copy it to `results/<id>.jsonl`.
4. Parse the transcript: collect every skill invocation = `tool_calls[].function` where name ∈ {`run_skill`, `read_skill`, `explore`, `review`, `research`, `security_review`}. For `run_skill`/`read_skill` the skill name is `JSON.parse(arguments).name`; for the wrappers the skill name is the wrapper name itself.
5. Score:
   - **Pass** = the case's `expect` skill appears anywhere in the invocation list.
   - Record `firstSkill` and `expectedWasFirst` as a *secondary* signal (process skills should fire early) — does not affect pass/fail.
   - `mustNotInvoke`: if any listed skill fired, the case fails (negative cases).
6. Report: per-case row (`id`, `expect`, `invoked[]`, `firstSkill`, pass/fail), overall hit-rate, and aggregate token/cost from the metrics files.

If no API key is resolvable, Stage 2 prints a clear "skipped — no DEEPSEEK_API_KEY" message and exits 0 (so structural-only CI still passes). The entry point `bench.mjs` runs Stage 1 first and aborts before Stage 2 if structural fails.

Model is `deepseek-flash` by default, overridable with `--model`.

## Corpus (`cases.jsonl`)

One JSON object per line: `{ "id", "prompt", "expect": ["skill"], "mustNotInvoke": ["skill"]?, "note" }`.

- 1–2 realistic prompts for each of the ~14 discoverable skills (e.g. "I want to add a feature, where do I start" → `brainstorming`; "this test is failing and I don't know why" → `systematic-debugging`; "is this done?" → `verification-before-completion`).
- 2–3 negative cases (e.g. "what is 2+2" → expect nothing; `mustNotInvoke` a few common skills).
- The 3 worker subagents are **excluded** from the corpus — they are dispatched by other skills, never by a cold user prompt, so a user-prompt benchmark can't trigger them directly. (Their wiring is covered structurally in Stage 1.)

Starts small (~16–20 cases); the JSONL format makes growth a one-line edit.

## Scoring summary

| Aspect | Decision |
|---|---|
| Pass condition | Expected skill invoked at any step |
| First-skill | Reported as secondary signal, not pass/fail |
| Negative cases | `mustNotInvoke` — fail if listed skill fires |
| Target model | `deepseek-flash` default, `--model` overrides |
| Worker subagents | Excluded from behavioral corpus; covered structurally |

## Out of scope (YAGNI)

- No global `settings.json` hook (JSONL parsing already gives observability; avoids touching the hector hook).
- No multi-model comparison by default (single `--model`, flag-overridable).
- No web UI / dashboards — plain text + JSON output.
- No CI workflow file in this iteration (the scripts are CI-ready: non-zero exit on failure, key-gated behavioral skip).

## First implementation step / de-risk

Before running the full corpus, a one-case smoke test confirms the JSONL parser correctly extracts a skill name from a real `run_skill`/wrapper invocation. If the record shape differs from the probed sample, the parser adapts before the full run.

## Note on git

This working tree is not a git repository, so this design doc is written but not committed. If desired, `git init` first.
