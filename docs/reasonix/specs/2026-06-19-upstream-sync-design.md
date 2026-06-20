# Upstream Sync — Design

**Repo:** superpowers-reasonix
**Date:** 2026-06-19
**Status:** Approved (design), ready for planning

## Summary

A way to keep this port aligned with the two upstreams it derives from: `obra/superpowers` (the discipline/content source) and `esengine/DeepSeek-Reasonix` on `main-v2` (the harness whose tool names, hook protocol, frontmatter parser, and skill loader the port's mechanics depend on). The port currently records no provenance for either, so "what changed since we last synced" is not computable.

The solution is three artifacts plus reuse of two things already in the repo:

1. `UPSTREAM.json` — a provenance manifest pinning both upstreams (the anchor that makes drift computable).
2. `skills/superpowers-sync-upstream/SKILL.md` — an in-session skill that detects drift, guides a re-port, and gates on the benchmark.
3. A scheduled GitHub Action that detects drift and files one issue, so staying current does not depend on remembering to run the skill.

Reused: `superpowers-writing-skills` (the porting house style) and `bench/` (the structural + invocation + exec-fidelity regression gate).

## Problem

This is a port, not a fork. Each port skill was hand-derived from an upstream obra skill through a fixed set of transformation rules (the README "Adaptations" table). Two things drift independently:

- **Content drift.** obra edits a discipline (e.g. tightens the TDD red-flags) or adds/removes a skill. The port should re-derive the change through the same rules, not diverge silently.
- **Harness drift.** DeepSeek-Reasonix changes a tool name, the hook object schema, the frontmatter parser, or the skill loader on `main-v2`. The port's rewritten mechanics can break with no error (a renamed tool in `allowed-tools` silently drops; a changed hook schema silently loads nothing).

There is no record of which obra commit a skill was ported from, or which Reasonix revision the mechanics were verified against. Without that anchor, drift can only be found by reading both upstreams by hand.

## Goals

- Make drift against both upstreams computable from a pinned baseline.
- Detect drift two ways: on demand inside a Reasonix session, and on a schedule via CI.
- Keep porting judgment in the loop (re-derive through the Adaptations rules) rather than auto-rewriting disciplines blind.
- Prove every re-port did not lose discipline by gating on `bench/` before accepting.
- Stop re-flagging the four intentionally-retired obra skills.

## Non-goals

- **No unattended auto-port of disciplines.** Detection and provenance are automated; rewriting a nuanced discipline stays human-reviewed.
- **No hook.** Reasonix `SessionStart` stdout never reaches the context, so a hook adds nothing here.
- **No vendoring / submodules.** Upstreams are fetched transiently, never checked in.
- **No model-release polling.** The target is the Reasonix CLI repo and obra content, not DeepSeek model weights. A new model tier surfaces either as a change under the watched contract paths (provider registry) or as a reason to re-baseline `bench/` against the new `--model`; the skill reminds the operator to re-baseline, but CI does not scrape model release notes.

## Architecture

```
UPSTREAM.json  (pins: obra SHA, reasonix SHA, skillMap, retired)
      │  read by both
      ├──────────────► CI: check-upstream-drift.mjs  (weekly cron)
      │                     └─ ls-remote + compare API → drift? → open/update one issue
      │
      └──────────────► skill: superpowers-sync-upstream  (on demand)
                            1 detect   git diff pinned..latest (obra skills/, reasonix contract paths)
                            2 classify edited / new / removed  +  harness contract changes
                            3 re-port  superpowers-writing-skills + Adaptations rules
                            4 gate     bench/ structural + invocation + exec-fidelity vs BASELINE
                            5 finalize bump UPSTREAM.json, write report, commit
```

The manifest is the single source of truth: CI reads it, the skill reads it, and the skill is the only writer.

## Component 1: `UPSTREAM.json` (new, repo root)

The provenance anchor. Shape:

```json
{
  "obra": {
    "repo": "https://github.com/obra/superpowers",
    "skillsPath": "skills",
    "lastSyncedCommit": "<40-char SHA>",
    "lastSyncedDate": "2026-06-19"
  },
  "reasonix": {
    "repo": "https://github.com/esengine/DeepSeek-Reasonix",
    "branch": "main-v2",
    "contractPaths": [
      "internal/tool",
      "internal/hook",
      "internal/skill",
      "internal/frontmatter",
      "internal/command"
    ],
    "lastVerifiedCommit": "<40-char SHA>",
    "lastVerifiedDate": "2026-06-19"
  },
  "skillMap": {
    "superpowers-brainstorming": "skills/brainstorming/SKILL.md",
    "superpowers-writing-plans": "skills/writing-plans/SKILL.md",
    "superpowers-test-driven-development": "skills/test-driven-development/SKILL.md",
    "superpowers-systematic-debugging": "skills/systematic-debugging/SKILL.md",
    "superpowers-verification-before-completion": "skills/verification-before-completion/SKILL.md",
    "superpowers-executing-plans": "skills/executing-plans/SKILL.md",
    "superpowers-using-git-worktrees": "skills/using-git-worktrees/SKILL.md",
    "superpowers-finishing-a-development-branch": "skills/finishing-a-development-branch/SKILL.md",
    "superpowers-receiving-code-review": "skills/receiving-code-review/SKILL.md",
    "superpowers-writing-skills": "skills/writing-skills/SKILL.md"
  },
  "retired": {
    "subagent-driven-development": "Native `task` covers per-task subagent dispatch; benchmarking showed the model prefers it.",
    "requesting-code-review": "Native `review` covers code-review of a diff.",
    "dispatching-parallel-agents": "Native `task` + `wait` cover parallel dispatch; only read-only work parallelizes cleanly.",
    "worker-subagents": "Reasonix `runAs: subagent` replaces bespoke worker skills."
  }
}
```

The two `<SHA>` values and the exact `skillMap` paths are real data, populated during implementation by fetching the live repos (the first task pins the current HEADs and confirms each obra source path resolves). They are not undefined requirements; the structure here is the contract.

Validation invariant (enforced by a test): every directory under `skills/` except `superpowers-sync-upstream` itself appears as a key in `skillMap`, and `retired` keys are disjoint from `skillMap` keys.

## Component 2: `skills/superpowers-sync-upstream/SKILL.md` (new)

Discoverable skill, tightly-scoped `description` so it fires only on explicit "sync/update from upstream" intent and never during normal coding. The description must satisfy the 130-char pinned-index budget (name included) and pass the structural gate; representative form:

> `Sync this port with upstream obra/superpowers or Reasonix main-v2: detect drift, guided re-port, bench-gate.`

Body procedure:

1. **Detect.** Read `UPSTREAM.json`. Shallow `git fetch` each upstream into a temp dir via `bash`, then `git diff <pinned>..<latest> -- <paths>`: obra over `skillsPath`, Reasonix over `contractPaths`. Recommend git over `web_fetch` (real diffs, reliable); `web_fetch` of the GitHub compare page is the documented fallback when network or git is restricted. This read-heavy step may be dispatched to a native `task` subagent that returns only the drift report.
2. **Classify content drift** into edited / new / removed per skill. For a **new** upstream skill, decision rule: port it, or add it to `retired` with a reason — port only if no native Reasonix tool already covers it (the Design-notes rationale: orchestration/review belong to `task`/`review`/`wait`/`explore`).
3. **Guided re-port.** For each edited or to-be-ported skill, invoke `superpowers-writing-skills` and apply the Adaptations rules (snake_case tool names, `description`→imperative within budget, `references/*` auto-fold, native-tool substitution, path renames). The operator reviews each.
4. **Classify harness drift.** Map each changed contract file to the port surface it touches, using the Adaptations table and the extending-reasonix trap table (tool names → every skill body + bench config; hook schema → `AGENTS.md` notes + any hook docs; frontmatter parser → all frontmatter; skill loader → layout assumptions). Update affected skills, `AGENTS.md`, and bench config.
5. **Bench-gate.** Run `bench/` (structural gate, invocation 12/12, exec-fidelity vs `BASELINE.json`). A new skill requires adding a positive invocation case, a negative sanity check, and a baseline entry. Any structural failure or score drop below baseline blocks acceptance. If a harness change invalidated the local `reasonix` binary, rebuild it first (the npm-build path) so bench results reflect the new harness.
6. **Finalize.** Bump `UPSTREAM.json` commits + dates, write a short sync report (what changed, what was ported, what was retired, bench result), and commit.

Authoring note: the skill body follows the port's own leanness rule (lean enough for the flash model to execute) and is itself covered by the structural gate.

## Component 3: Scheduled CI drift check (new)

`.github/workflows/upstream-drift.yml` and `.github/scripts/check-upstream-drift.mjs`.

**Workflow.** Triggers: `schedule` weekly (`cron: "0 9 * * 1"`, Mondays 09:00 UTC) and `workflow_dispatch`. Permissions: `contents: read`, `issues: write`. Runs the node script with the default `GITHUB_TOKEN`; no other secrets.

**Script behavior (pure where possible, for testability):**

1. Read `UPSTREAM.json`.
2. `git ls-remote <obra.repo> HEAD` and `git ls-remote <reasonix.repo> refs/heads/main-v2` → latest SHAs.
3. If a latest SHA differs from its pin, call the GitHub compare REST API (`GET /repos/{owner}/{repo}/compare/{pinned}...{latest}`) and filter the returned file list to `obra.skillsPath` and `reasonix.contractPaths` to learn which skills / contract files moved. No upstream checkout needed.
4. Compose a markdown issue body: which upstream drifted, the SHA delta, the filtered changed-file list, and the instruction to run `/superpowers-sync-upstream`.
5. Idempotent issue management: find an open issue labeled `upstream-drift`; if present, edit its body; else create one with that label. Never open a second.
6. No drift → no issue, exit 0.

Edge case: if the compare API returns 404 (pinned SHA unreachable after an upstream force-push/rebase), the body degrades to "upstream advanced; full diff unavailable, re-pin during sync" rather than failing the run.

Factor the script so `computeDrift(manifest, latest, compareFiles)` and `composeIssueBody(report)` are pure functions; the network and the issue mutation are thin wrappers around them.

## Data flow

`UPSTREAM.json` pins → CI cron or operator detects drift vs pins → drift report → guided re-port (`writing-skills` + Adaptations) → bench gate → bump pins + commit. CI only ever reads the manifest and files an issue; only the skill writes the manifest, and only after the bench gate passes.

## Error handling and edge cases

- **Detect step network/git failure (skill):** report and stop; do not bump pins or commit.
- **Force-pushed upstream:** CI compare 404 degrades gracefully (above); the skill re-pins from the new HEAD during finalize.
- **obra renames/moves a skill file:** `skillMap` path stops resolving; classified as removed + new; the operator updates `skillMap` to the new path during re-port.
- **New obra skill that is orchestration/review:** routed to `retired` with a reason, not ported.
- **Harness change invalidates the local binary:** rebuild before trusting bench; the skill states this explicitly.
- **Stale issue after a sync:** the next CI run finds pins == latest, no drift; the open `upstream-drift` issue is closed by the operator as part of finalize (noted in the skill).

## Testing

- **CI script:** `node:test` (matching `bench/*.test.mjs`) over the pure functions with fixture compare payloads — drift present/absent, partial drift (one upstream only), 404 degraded body, and issue-body composition. No network in tests.
- **Manifest:** a shape/invariant test (every `skills/` dir present in `skillMap`, `retired` disjoint, required keys present, dates ISO).
- **Skill:** the structural gate over its `SKILL.md`; one invocation case proving it fires on a "sync from upstream" prompt and a negative proving it stays silent on unrelated coding prompts.
- **Workflow:** a `workflow_dispatch` dry run against the real pins (expected: no drift, no issue) to confirm wiring and permissions.

## Open questions

None. CI cadence (weekly), detection mechanism (git diff in-session, compare API in CI), and form factor (discoverable skill, not slash command) were settled during brainstorming.
