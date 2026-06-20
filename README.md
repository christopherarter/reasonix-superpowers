# superpowers-reasonix

Process skills that give a [Reasonix](https://github.com/esengine/DeepSeek-Reasonix) coding agent the disciplines of a careful engineer: write the test first, debug from evidence, plan before coding, verify before claiming done. Each one loads at the moment it applies.

A port of [obra/superpowers](https://github.com/obra/superpowers) for Reasonix (the DeepSeek-Reasonix CLI) and DeepSeek models. Same disciplines, rewritten for Reasonix's tools, subagent model, and skill format. It is not a 1:1 transliteration. [Adaptations](#adaptations-from-claude-code-superpowers) covers what changed and why.

## The skills

Eleven skills under `skills/`, covering a project from idea to merge:

| Skill | Use when |
|---|---|
| `superpowers-brainstorming` | Turning a rough idea into an approved design, before any build work |
| `superpowers-writing-plans` | You have a spec for a multi-step task, before code |
| `superpowers-test-driven-development` | Implementing any feature or bugfix |
| `superpowers-systematic-debugging` | Any bug, test failure, or unexpected behavior |
| `superpowers-verification-before-completion` | Before claiming work is done, fixed, or passing |
| `superpowers-executing-plans` | Executing a written plan inline, with checkpoints |
| `superpowers-using-git-worktrees` | Feature work that needs an isolated workspace |
| `superpowers-finishing-a-development-branch` | Work done + tests pass, ready to merge, PR, or clean up |
| `superpowers-receiving-code-review` | Acting on review feedback, before implementing it |
| `superpowers-writing-skills` | Creating, editing, or testing Reasonix skills |
| `superpowers-sync-upstream` | Checking obra/superpowers or the Reasonix harness for updates to pull into this port |

Subagent dispatch, code review, parallel work, and codebase exploration aren't skills here. Reasonix ships those as native tools (`task`, `review`, `wait`, `explore`), and the skills use them directly. [Why?](#design-notes)

## Install

**One-liner (recommended).** Downloads the latest release and installs the skills into your global Reasonix skills root, where they auto-load in every session:

```bash
curl -fsSL https://raw.githubusercontent.com/christopherarter/superpowers-reasonix/main/install.sh | bash
```

Re-run anytime to upgrade — it skips if you're already on the latest (`--force` to reinstall), and any earlier manual install it finds is backed up before being replaced (nothing is silently destroyed). Pin a release with `--version v1.0.0`. Skills land in `~/.reasonix/skills/` (override with `REASONIX_SKILLS_DIR`). For the always-on discipline, copy the bundled `AGENTS.md` into each project:

```bash
cp ~/.reasonix/skills/.superpowers-reasonix/AGENTS.md <your-project>/AGENTS.md
```

<details>
<summary>Manual install (for development, or to pin a checkout)</summary>

Skills load from several roots. Pick the one that fits.

**Point `[skills] paths` at this repo** (recommended, keeps it updatable). In your global Reasonix config (`reasonix doctor` prints its path, which varies by build/OS) or a project's `reasonix.toml`:

```toml
[skills]
paths = ["/absolute/path/to/superpowers-reasonix/skills"]
```

`~` expands; relative paths resolve against the project root. See [`reasonix.toml.example`](./reasonix.toml.example).

**Symlink into your global skills root** so it loads in every session:

```bash
mkdir -p ~/.reasonix/skills
ln -s /absolute/path/to/superpowers-reasonix/skills/* ~/.reasonix/skills/
```

**Drop into one project** by copying or symlinking `skills/*` into `<project>/.reasonix/skills/`. Project skills override same-named built-ins. (`.claude/skills/`, `.agents/skills/`, and `.agent/skills/` are also scanned.)

Then copy [`AGENTS.md`](./AGENTS.md) (or the trimmed [`AGENTS.md.example`](./AGENTS.md.example)) into your project. It carries the always-on "load a skill before you act" discipline. [Why?](#always-on-discipline)

**Verify:** in a session, `/skill paths` confirms the root is seen and `/skills` lists what was discovered. Skills with a `description` also appear in the pinned skills index in the system prompt.

</details>

## How a session uses them

```
brainstorming → writing-plans → executing-plans (inline)
                      └ or, for higher quality, dispatch per task with
                        the native `task` tool:
                            per task:  task   → implement + test
                                       (verify it matches the spec)
                                       review → code-review the diff
                            finishing-a-development-branch
```

`test-driven-development`, `systematic-debugging`, and `verification-before-completion` run throughout; `using-git-worktrees` sets up isolation up front.

## Always-on discipline

Claude Code force-injects a `using-superpowers` skill at session start via a hook. Reasonix hooks can't: `SessionStart` stdout never reaches the context, so a skill can't establish discipline meant to apply *before* anything is invoked. Two always-on layers do the job instead.

1. **The pinned skills index** (automatic). Every skill with a `description` appears as one line in the system prompt, so the model finds them with no hook.
2. **`AGENTS.md`** (loaded every session). It holds the "load a skill before you act" rule, the situation-to-skill routing table, the rationalization red-flags, and the instruction-priority hierarchy. Benchmarking on `deepseek-flash` found this lifts skill invocation versus relying on a skill the model must choose to load.

## Benchmarks

Two benchmarks under [`bench/`](./bench), both targeting `deepseek-flash`, DeepSeek's smallest coding model. A skill that fires reliably on the weakest model does at least as well on the larger `deepseek-pro` (the v4 Pro tier), so testing against the floor lets this port claim it works across the range. Pass `--model=deepseek-pro` to check a skill on the larger model.

**Invocation** measures which skill fires. `bench/bench.mjs` runs a structural gate over every `SKILL.md`, then sends realistic prompts through `reasonix run` and reads back the chosen skill. The 13-case corpus (eleven positives, one per skill, plus two negatives) passes 13/13 on `deepseek-flash`: every positive invokes its expected skill and neither negative fires. The expected skill comes first in 10 of the 11 positives; the branch-finishing prompt invokes `superpowers-verification-before-completion` before `superpowers-finishing-a-development-branch`, since "tests pass, let's wrap up" legitimately cues verification first.

**Execution fidelity** measures whether the model obeys a skill already in context. `bench/exec/` force-loads each skill in an isolated workspace and scores the transcript against a rubric: hard rules (test-before-implementation, ran-verification, no-placeholder-output) mechanically, softer criteria by a Claude judge. Save a baseline, edit a skill body, then re-run; any score that drops flags a body that lost discipline.

Run instructions and how to add cases are in [`bench/README.md`](./bench/README.md) and [`bench/exec/README.md`](./bench/exec/README.md).

## Design notes

These skills supplement Reasonix's native tools rather than compete with them. Reasonix already ships subagent orchestration: `task` (dispatch a subagent), `review` (code-review a diff), `wait` (join parallel jobs), and `explore` (investigate the codebase). So this port ships no orchestration or review skills. An earlier draft had `subagent-driven-development`, `requesting-code-review`, `dispatching-parallel-agents`, and worker subagents; benchmarking showed the model preferred the native tools, so they were retired. What's left is the discipline the runtime doesn't provide.

Only read-only work parallelizes cleanly, so fan out `explore`/read tasks and integrate sequentially. Rather than ship a separate subagent-driven skill, `writing-plans` folds the per-task discipline (implement, check the spec, then `review`) into instructions for the native `task` tool.

## Staying current

This is a port, so it drifts from two upstreams: `obra/superpowers` (content) and DeepSeek-Reasonix `main-v2` (the harness). `UPSTREAM.json` pins the commit last synced from each.

Run `/superpowers-sync-upstream` to check both, re-port what changed through the Adaptations rules, and re-pin once `bench/` passes. A weekly GitHub Action (`.github/workflows/upstream-drift.yml`) does the detection on its own: when either upstream advances past its pin, it opens one `upstream-drift` issue listing the changed skills or contract files.

## Adaptations from Claude Code superpowers

Reasonix resembles Claude Code but diverges in ways that break a naive copy. The disciplines themselves are preserved (the Iron Laws, red-flag tables, rationalization counters, RED-GREEN-REFACTOR); only the mechanics are rewritten.

<details>
<summary>What changed, and why</summary>

| Area | Claude Code superpowers | This port |
|---|---|---|
| **Skill invocation** | `Skill` tool | `run_skill` (execute) / `read_skill` (read-only, works in plan mode) / `/name` |
| **Tool names** | `Read`, `Edit`, `Bash`, `Grep`, `TodoWrite` | snake_case: `read_file`, `edit_file`, `bash`, `grep`, `todo_write` |
| **Subagent dispatch & review** | `Task` tool + review skills, orchestrated by skills | Use Reasonix's **native** `task` (dispatch), `review` (code-review a diff), `wait` (join), and `explore` (investigate) tools directly. The port ships **no** orchestration or review skills; they'd duplicate the runtime, and benchmarking showed the model prefers the native tools |
| **Parallel agents** | Fan out `Task` writers | Native `task` + `wait`; only **read-only** work parallelizes cleanly, so fan out `explore`/read tasks and integrate sequentially |
| **Brainstorming visual companion** | Browser + Node server for mockups | Dropped (web-app feature). Replaced with the native `ask` tool for multiple-choice + text/ASCII sketches |
| **Reference files** | Linked with `@path` / read on demand | `references/*.md` **auto-fold** into the skill body at load time; no `@` links, no extra reads |
| **Descriptions** | Long, third-person "Use when" prose | Rewritten as forceful imperatives (`trigger? Load first, one core action`) to fit the **130-char pinned-index line** and lift invocation on the floor model. A deliberate divergence from obra's "Use when" house style, validated by `bench/` (12/12); still never enumerates the multi-step workflow |
| **Always-on injection** | SessionStart hook | Pinned index + `AGENTS.md` pointer (Reasonix hooks don't inject SessionStart output) |
| **Paths** | `docs/superpowers/...`, `~/.config/superpowers/worktrees` | `docs/reasonix/...`, `~/.config/reasonix/worktrees` |
| **`superpowers-writing-skills`** | Anthropic skill spec | Rewritten for Reasonix's frontmatter parser, index budget, references auto-fold, and subagent authoring rules |

</details>

## License & attribution

MIT. See [`LICENSE`](./LICENSE).

Original concept and content: **Jesse Vincent** ([obra/superpowers](https://github.com/obra/superpowers)), MIT, `Copyright (c) 2025 Jesse Vincent`, preserved in [`LICENSE`](./LICENSE). This is a community port for the Reasonix platform (`Copyright (c) 2026 Chris Arter`).

**Versioning:** released as semver git tags (`vX.Y.Z`) on [Releases](https://github.com/christopherarter/superpowers-reasonix/releases); the installer pulls the latest. The **skill set** is the versioned surface — retiring/renaming a skill is a minor or major bump, adding one a minor, body/wording refinements a patch. `bench/BASELINE.json` is meaningful relative to the commit that captured it.
