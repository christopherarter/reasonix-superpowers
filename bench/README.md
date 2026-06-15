# Skill Benchmark

Two-stage check that this repo's skills (a) load into Reasonix and (b) actually
get invoked by realistic prompts.

## Run

```bash
node bench/bench.mjs                          # structural gate, then behavioral (needs a key)
node bench/structural.mjs                      # stage 1 only (deterministic, no API)
node bench/behavioral.mjs                      # stage 2 only (all cases)
node bench/behavioral.mjs --only=debugging     # one case
node bench/behavioral.mjs --model=deepseek-pro # different target model
node --test bench/lib/*.test.mjs bench/*.test.mjs   # unit tests for the harness itself
```

The behavioral stage needs `DEEPSEEK_API_KEY` in the shell env or in `.env` at
the repo root; without it, stage 2 skips cleanly (exit 0). The full corpus makes
one live `reasonix run` call per case — expect it to take several minutes.

## How it works

- **Stage 1 (`structural.mjs`)** validates every `skills/*/SKILL.md`: name regex,
  the description contract (every skill is discoverable and must carry a
  description; `EXPECT_NO_DESCRIPTION` is the — currently empty — set of
  intentionally-invisible skills), the 130-char pinned-index line, the 4000-char
  index budget, `allowed-tools` names, and non-empty references. Exits non-zero
  on any failure, so it gates CI.
- **Stage 2 (`behavioral.mjs`)** copies `bench/reasonix.toml` to the repo root so
  only this repo's `skills/` are visible (the global `~/.reasonix/skills` root is
  excluded), runs each prompt in `cases.jsonl` through `reasonix run -dir <repo>`,
  then reads which skill fired from the saved session JSONL. A case passes when
  the expected skill is invoked at any step; `firstSkill`/`expectedWasFirst` are
  reported as a secondary signal. Results, per-case transcripts, and metrics land
  in `bench/results/` (gitignored); the summary is `bench/results/report.json`.

## Determinism & the committed baseline

Stage 1 is deterministic. Stage 2 is not bit-for-bit: it makes one live model call
per case, and `bench/reasonix.toml` pins `temperature = 0.0`, but DeepSeek reasons
even at zero temperature, so a borderline case can flip between runs. Treat a single
flip as noise and re-run before reading anything into it.

`bench/BASELINE.json` is a committed snapshot of a passing run (`passed`/`total`,
`firstHit`, per-case results) — the regression anchor. Change a skill body or a
description, re-run `node bench/bench.mjs`, and diff against it. The headline metric
is **invocation**: a case passes when the expected skill fires at *any* step.
`firstHit` (expected skill fired *first*) is the stricter secondary signal — so
`12/12 passed, firstHit 10` means all twelve fired, two of them not first.

## Notes on the target build

Verified against `reasonix npm-v1.4.0-rc.1`:

- Session transcripts use a **flat** tool-call shape — `{id, name, arguments}`,
  with `arguments` a JSON string — not the OpenAI-nested `{function:{...}}` form.
  `lib/transcript.mjs` reads either.
- The sessions directory is read from `reasonix doctor` (handles the macOS
  `~/Library/Application Support/reasonix/sessions` path, spaces and all).
- Models: `deepseek-flash` (default) and `deepseek-pro`.

## Add a case

Append one line to `cases.jsonl`:

```json
{"id":"my-case","prompt":"a realistic user request","expect":["skill-name"],"note":"why"}
```

Negative cases use `"expect":[]` plus `"mustNotInvoke":["skill","..."]`. The
`cases.test.mjs` guard fails if any discoverable skill has no positive case or if
an `expect` name doesn't match a real skill.
