# superpowers-reasonix

A port of [obra/superpowers](https://github.com/obra/superpowers), the Claude Code skills library for TDD, debugging, planning, and collaboration, adapted for [Reasonix](https://github.com/esengine/DeepSeek-Reasonix) (the DeepSeek-Reasonix coding-agent CLI) and DeepSeek models.

It is not a 1:1 transliteration. The skills keep their core deliverable, the disciplines and workflows that make the agent better, but the mechanics are rewritten for how Reasonix works: its tools, its subagent model, its skill format. See [Adaptations](#adaptations-from-claude-code-superpowers) for what changed and why.

## What's included

10 skills under `skills/`, all discoverable process/workflow skills. The "check skills first" discipline that a `using-superpowers` skill used to carry now lives in [`AGENTS.md`](./AGENTS.md), loaded into every session (see [Always-on discipline](#always-on-discipline-the-sessionstart-equivalent)).

These skills supplement Reasonix's native tools instead of competing with them. Reasonix already ships subagent orchestration: `task` (dispatch a subagent), `review` (code-review a diff), `wait` (join parallel jobs), and `explore` (investigate the codebase). So this port ships no orchestration or review skills. An earlier draft had `subagent-driven-development`, `requesting-code-review`, `dispatching-parallel-agents`, and worker subagents; benchmarking showed the model preferred the native tools, so they were retired. What's left is the discipline the runtime doesn't provide.

### Process & discipline skills

| Skill | Use when |
|---|---|
| `superpowers-brainstorming` | Before any build work: turn a rough idea into an approved design |
| `superpowers-writing-plans` | You have a spec/requirements for a multi-step task, before code |
| `superpowers-test-driven-development` | Implementing any feature or bugfix, before writing code |
| `superpowers-systematic-debugging` | Any bug, test failure, or unexpected behavior, before fixing |
| `superpowers-verification-before-completion` | Before claiming work is done/fixed/passing |
| `superpowers-executing-plans` | Execute a written plan inline in this session with checkpoints |
| `superpowers-using-git-worktrees` | Before feature work needing an isolated workspace |
| `superpowers-finishing-a-development-branch` | Work complete + tests pass → merge, PR, or clean up |
| `superpowers-receiving-code-review` | Acting on review feedback (from `review` or a human): verify before implementing |
| `superpowers-writing-skills` | Creating, editing, or testing Reasonix skills |

### Subagent work uses native tools, not skills

Dispatching subagents, reviewing a diff, running work in parallel, and exploring the codebase use Reasonix's built-in `task` / `review` / `wait` / `explore` tools directly. There are no skills for them. The `superpowers-writing-plans` skill's "subagent-driven" execution path folds the per-task discipline (implement → check spec → `review`) into instructions for the native `task` tool.

## Install

Skills are discovered from several roots. Pick one:

### Option A: point `[skills] paths` at this repo (recommended, keeps it updatable)

In your global Reasonix config (`reasonix doctor` prints its path — it varies by build/OS), or a project's `reasonix.toml`:

```toml
[skills]
paths = ["/absolute/path/to/superpowers-reasonix/skills"]
```

`~` expands; relative paths resolve against the project root. See [`reasonix.toml.example`](./reasonix.toml.example).

### Option B: symlink into your global skills root

```bash
mkdir -p ~/.reasonix/skills
ln -s /absolute/path/to/superpowers-reasonix/skills/* ~/.reasonix/skills/
```

Reasonix follows symlinked skill directories. Global skills load in every session.

### Option C: drop into a single project

Copy or symlink `skills/*` into `<project>/.reasonix/skills/`. The `.claude/skills/`, `.agents/skills/`, and `.agent/skills/` directories are also scanned. Project skills take top priority and override same-named built-ins.

### Verify

In a Reasonix session: `/skill paths` (confirms the root is seen) and `/skills` (lists discovered skills). The described skills also appear automatically in the pinned skills index in the system prompt; the always-on "load a skill first" discipline comes from [`AGENTS.md`](./AGENTS.md).

## Always-on discipline (the SessionStart equivalent)

Claude Code's superpowers force-injects a `using-superpowers` skill at session start via a hook. Reasonix hooks can't do that: only `PostLLMCall` and `PreCompact` hook stdout reaches the context, and `SessionStart` stdout does not. So this port ships no `using-superpowers` skill. A skill the model has to invoke can't establish discipline it's meant to apply *before* invoking anything. Instead the job moves to two always-on layers:

1. **The pinned skills index** (automatic). Every skill with a `description` appears as one line in the system prompt, so the model discovers them without any hook.
2. **[`AGENTS.md`](./AGENTS.md) / `REASONIX.md`** (loaded every session). This holds the "load a skill before you act" rule, the situation→skill routing table, the rationalization red-flags, and the instruction-priority hierarchy. Always present, no invocation required. Copy [`AGENTS.md`](./AGENTS.md) (or the trimmed [`AGENTS.md.example`](./AGENTS.md.example)) into your project. Benchmarking against `deepseek-flash` found this lifts skill invocation versus relying on a skill the model must choose to load.

## How execution flows

```
superpowers-brainstorming → superpowers-writing-plans → superpowers-executing-plans (inline)
                                  └ or, for higher quality, dispatch per task with
                                    the native `task` tool:
                                        per task:
                                          task   → implement + test
                                          (verify it matches the spec)
                                          review → code-review the diff
                                        superpowers-finishing-a-development-branch
```

`superpowers-test-driven-development`, `superpowers-systematic-debugging`, and `superpowers-verification-before-completion` are invoked throughout. `superpowers-using-git-worktrees` sets up isolation up front. Subagent dispatch, review, and parallel work use Reasonix's native `task` / `review` / `wait` tools, not skills.

## Benchmarks

Two benchmarks live under [`bench/`](./bench). Both target `deepseek-flash`, DeepSeek's smallest coding model. The reasoning: a skill that loads and fires reliably on the weakest model will do at least as well on the larger `deepseek-pro` (the v4 Pro tier). Testing against the floor is what lets this port claim it works across the range, not only on the model it was authored against. To check a specific skill on the larger model, pass `--model=deepseek-pro`.

### Invocation: which skill fires

`bench/bench.mjs` runs a structural gate over every `SKILL.md`, then sends realistic prompts through `reasonix run` and reads back which skill the model chose. On `deepseek-flash`, the 12-case corpus (one positive prompt per skill, plus two negatives that should invoke nothing) passes 12 of 12. The expected skill fires first on all 10 positive cases, and both negatives stay silent: no false trigger on trivia or arithmetic. This is the result behind the `AGENTS.md` design. Routing the discipline through the pinned index plus `AGENTS.md` gets the small model to load the right skill without a SessionStart hook.

### Execution fidelity: following a loaded skill

`bench/exec/` measures the next question: with a skill already in context, does `deepseek-flash` obey it? Each of the 10 skills has a scenario that force-loads the skill, runs it in an isolated workspace, and scores the transcript against a rubric. Hard rules (test-written-before-implementation, ran-verification, no-placeholder-output) are graded mechanically; softer criteria go to a Claude judge that reads the transcript. The harness catches regressions when a skill body is rewritten: save the scores as a baseline, edit the bodies, re-run, and any skill whose score drops is a body that lost discipline.

Run instructions and how to add cases are in [`bench/README.md`](./bench/README.md) and [`bench/exec/README.md`](./bench/exec/README.md).

## Adaptations from Claude Code superpowers

Reasonix resembles Claude Code but diverges in ways that break a naive copy. What changed:

| Area | Claude Code superpowers | This port |
|---|---|---|
| **Skill invocation** | `Skill` tool | `run_skill` (execute) / `read_skill` (read-only, works in plan mode) / `/name` |
| **Tool names** | `Read`, `Edit`, `Bash`, `Grep`, `TodoWrite` | snake_case: `read_file`, `edit_file`, `bash`, `grep`, `todo_write` |
| **Subagent dispatch & review** | `Task` tool + review skills, orchestrated by skills | Use Reasonix's **native** `task` (dispatch), `review` (code-review a diff), `wait` (join), and `explore` (investigate) tools directly. The port ships **no** orchestration or review skills; they'd duplicate the runtime, and benchmarking showed the model prefers the native tools |
| **Parallel agents** | Fan out `Task` writers | Native `task` + `wait`; only **read-only** work parallelizes cleanly, so fan out `explore`/read tasks and integrate sequentially |
| **Brainstorming visual companion** | Browser + Node server for mockups | Dropped (web-app feature). Replaced with the native `ask` tool for multiple-choice + text/ASCII sketches |
| **Reference files** | Linked with `@path` / read on demand | `references/*.md` **auto-fold** into the skill body at load time; no `@` links, no extra reads |
| **Descriptions** | Long, third-person "Use when…" prose | Rewritten as forceful imperatives (`trigger? Load first — one core action`) to fit the **130-char pinned-index line** and lift invocation on the floor model. A deliberate divergence from obra's "Use when…" house style, validated by `bench/` (12/12); still never enumerates the multi-step workflow |
| **Always-on injection** | SessionStart hook | Pinned index + `AGENTS.md` pointer (Reasonix hooks don't inject SessionStart output) |
| **Paths** | `docs/superpowers/...`, `~/.config/superpowers/worktrees` | `docs/reasonix/...`, `~/.config/reasonix/worktrees` |
| **`superpowers-writing-skills`** | Anthropic skill spec | Rewritten for Reasonix's frontmatter parser, index budget, references auto-fold, and subagent authoring rules |

The disciplines themselves (the Iron Laws, red-flag tables, rationalization counters, RED-GREEN-REFACTOR) are preserved, because that content is what makes superpowers work regardless of platform.

## License & attribution

MIT — see [`LICENSE`](./LICENSE).

Original concept and content: **Jesse Vincent** ([obra/superpowers](https://github.com/obra/superpowers)) — MIT, `Copyright (c) 2025 Jesse Vincent`, preserved in [`LICENSE`](./LICENSE). This is a community port for the Reasonix platform (`Copyright (c) 2026 Chris Arter`).

**Versioning:** there is no Reasonix skill marketplace to resolve a version, and install just points `[skills] paths` at a checkout — so the git ref *is* the version. This repo isn't versioned with semver; pin a tag or commit if you need reproducibility. `bench/BASELINE.json` is meaningful relative to the commit that captured it.
