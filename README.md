# superpowers-reasonix

A port of [obra/superpowers](https://github.com/obra/superpowers) — the proven Claude Code skills library for TDD, debugging, planning, and collaboration — adapted for **[Reasonix](https://github.com/esengine/DeepSeek-Reasonix)** (the DeepSeek-Reasonix coding-agent CLI) and DeepSeek models.

This is **not a 1:1 transliteration.** The skills keep their core deliverable — the disciplines and workflows that make the agent better — but the mechanics are rewritten for how Reasonix actually works (its tools, its subagent model, its skill format). See [Adaptations](#adaptations-from-claude-code-superpowers) for what changed and why.

## What's in the box

10 skills under `skills/`, all discoverable process/workflow skills. The "check skills first" discipline that a `using-superpowers` skill used to carry now lives in [`AGENTS.md`](./AGENTS.md), loaded into every session (see [Always-on discipline](#always-on-discipline-the-sessionstart-equivalent)).

These skills **supplement Reasonix's native tools rather than compete with them.** Reasonix already ships first-class subagent orchestration — `task` (dispatch a subagent), `review` (code-review a diff), `wait` (join parallel jobs), `explore` (investigate the codebase). So this port deliberately ships **no** orchestration or review skills (an earlier draft had `subagent-driven-development`, `requesting-code-review`, `dispatching-parallel-agents`, and worker subagents; benchmarking showed the model correctly preferred the native tools, so they were retired). What's left is pure discipline the runtime doesn't provide.

### Process & discipline skills

| Skill | Use when |
|---|---|
| `brainstorming` | Before any build work — turn a rough idea into an approved design |
| `writing-plans` | You have a spec/requirements for a multi-step task, before code |
| `test-driven-development` | Implementing any feature or bugfix, before writing code |
| `systematic-debugging` | Any bug, test failure, or unexpected behavior, before fixing |
| `verification-before-completion` | Before claiming work is done/fixed/passing |
| `executing-plans` | Execute a written plan inline in this session with checkpoints |
| `using-git-worktrees` | Before feature work needing an isolated workspace |
| `finishing-a-development-branch` | Work complete + tests pass → merge, PR, or clean up |
| `receiving-code-review` | Acting on review feedback (from `review` or a human) — verify before implementing |
| `writing-skills` | Creating, editing, or testing Reasonix skills |

### Subagent work uses native tools, not skills

Dispatching subagents, reviewing a diff, running work in parallel, and exploring the codebase are done with Reasonix's built-in `task` / `review` / `wait` / `explore` tools directly — there are no skills for them. The `writing-plans` skill's "subagent-driven" execution path folds the per-task discipline (implement → check spec → `review`) into instructions for the native `task` tool.

## Install

Skills are discovered from several roots. Pick one:

### Option A — point `[skills] paths` at this repo (recommended; keeps it updatable)

In `~/.config/reasonix/config.toml` (or a project's `reasonix.toml`):

```toml
[skills]
paths = ["/absolute/path/to/superpowers-reasonix/skills"]
```

`~` expands; relative paths resolve against the project root. See [`reasonix.toml.example`](./reasonix.toml.example).

### Option B — symlink into your global skills root

```bash
mkdir -p ~/.reasonix/skills
ln -s /absolute/path/to/superpowers-reasonix/skills/* ~/.reasonix/skills/
```

Reasonix follows symlinked skill directories. Global skills load in every session.

### Option C — drop into a single project

Copy or symlink `skills/*` into `<project>/.reasonix/skills/` (or `.claude/skills/`, `.agents/skills/`, `.agent/skills/` — all are scanned). Project skills take top priority and override same-named built-ins.

### Verify

In a Reasonix session: `/skill paths` (confirms the root is seen) and `/skills` (lists discovered skills). The described skills also appear automatically in the pinned skills index in the system prompt; the always-on "load a skill first" discipline comes from [`AGENTS.md`](./AGENTS.md).

## Always-on discipline (the SessionStart equivalent)

Claude Code's superpowers force-injects a `using-superpowers` skill at session start via a hook. **Reasonix hooks can't do that** — only `PostLLMCall` and `PreCompact` hook stdout is injected into context; `SessionStart` stdout is not. So this port **does not ship a `using-superpowers` skill**; a skill the model has to invoke can't establish discipline it's meant to apply *before* invoking anything. Instead the job moves to two always-on layers:

1. **The pinned skills index** (automatic). Every skill with a `description` appears as one line in the system prompt, so the model discovers them without any hook.
2. **[`AGENTS.md`](./AGENTS.md) / `REASONIX.md`** (loaded every session). This is where the "load a skill before you act" rule, the situation→skill routing table, the rationalization red-flags, and the instruction-priority hierarchy live — always present, no invocation required. Copy [`AGENTS.md`](./AGENTS.md) (or the trimmed [`AGENTS.md.example`](./AGENTS.md.example)) into your project. Benchmarking against `deepseek-flash` found this lifts skill-invocation sharply versus relying on a skill the model must choose to load.

## How execution flows

```
brainstorming → writing-plans → executing-plans (inline)
                                  └ or, for higher quality, dispatch per task with
                                    the native `task` tool:
                                        per task:
                                          task   → implement + test
                                          (verify it matches the spec)
                                          review → code-review the diff
                                        finishing-a-development-branch
```

`test-driven-development`, `systematic-debugging`, and `verification-before-completion` are invoked throughout. `using-git-worktrees` sets up isolation up front. Subagent dispatch, review, and parallel work use Reasonix's native `task` / `review` / `wait` tools — not skills.

## Adaptations from Claude Code superpowers

Reasonix deliberately resembles Claude Code but diverges in ways that break a naive copy. What changed:

| Area | Claude Code superpowers | This port |
|---|---|---|
| **Skill invocation** | `Skill` tool | `run_skill` (execute) / `read_skill` (read-only, works in plan mode) / `/name` |
| **Tool names** | `Read`, `Edit`, `Bash`, `Grep`, `TodoWrite` | snake_case: `read_file`, `edit_file`, `bash`, `grep`, `todo_write` |
| **Subagent dispatch & review** | `Task` tool + review skills, orchestrated by skills | Use Reasonix's **native** `task` (dispatch), `review` (code-review a diff), `wait` (join), and `explore` (investigate) tools directly. The port ships **no** orchestration or review skills — they'd duplicate the runtime, and benchmarking showed the model prefers the native tools |
| **Parallel agents** | Fan out `Task` writers | Native `task` + `wait`; only **read-only** work parallelizes cleanly, so fan out `explore`/read tasks and integrate sequentially |
| **Brainstorming visual companion** | Browser + Node server for mockups | Dropped (web-app feature). Replaced with the native `ask` tool for multiple-choice + text/ASCII sketches |
| **Reference files** | Linked with `@path` / read on demand | `references/*.md` **auto-fold** into the skill body at load time — no `@` links, no extra reads |
| **Descriptions** | Long, prose | Trimmed to fit Reasonix's **130-char pinned-index line**, front-loaded with triggers only (never a workflow summary) |
| **Always-on injection** | SessionStart hook | Pinned index + `AGENTS.md` pointer (Reasonix hooks don't inject SessionStart output) |
| **Paths** | `docs/superpowers/...`, `~/.config/superpowers/worktrees` | `docs/reasonix/...`, `~/.config/reasonix/worktrees` |
| **`writing-skills`** | Anthropic skill spec | Rewritten for Reasonix's frontmatter parser, index budget, references auto-fold, and subagent authoring rules |

The disciplines themselves — the Iron Laws, red-flag tables, rationalization counters, RED-GREEN-REFACTOR — are preserved, because that content is what makes superpowers work regardless of platform.

## Credit

Original concept and content: **Jesse Vincent** ([obra/superpowers](https://github.com/obra/superpowers), MIT). This is a community port for the Reasonix platform.
