# Project guidance

## Skills — STOP. Load a skill before you act.

This project ships skills (playbooks) under `skills/`. They only work if you load them.

**The rule:** before you do ANYTHING non-trivial — before you `explore`, run `bash`,
write code, or answer — STOP and check the skills index. If a skill might fit, load it.
Loading a skill is cheap. Skipping it is the #1 mistake. Process skill FIRST. Action SECOND.

Do NOT jump straight to `explore` or `bash` or a direct answer. The skill tells you HOW
to explore, debug, build, and verify. So it comes first, every time.

Match the situation:

| If… | Load this FIRST |
|---|---|
| starting a feature, or you have a rough idea | **brainstorming** |
| a bug, a failing or flaky test, or anything surprising | **systematic-debugging** |
| writing or fixing any code | **test-driven-development** |
| you have a spec for a multi-step task | **writing-plans** |
| executing a plan — a fresh subagent per task | **subagent-driven-development** |
| executing a plan — inline, yourself, this session | **executing-plans** |
| about to say "done" / "fixed" / "passing" | **verification-before-completion** |
| work is done and tests pass | **finishing-a-development-branch** |
| want a review, or got review feedback | **requesting-code-review** / **receiving-code-review** |
| 2+ unrelated problems at once | **dispatching-parallel-agents** |
| need an isolated workspace | **using-git-worktrees** |
| making or editing a skill | **writing-skills** |

Load it: `run_skill({ name: "<skill-name>", arguments: "<the task>" })`.

If you catch yourself about to explore, fix, or answer without loading a skill — STOP and load it.

## Red flags — these thoughts mean STOP. You are rationalizing.

| You think | Reality |
|---|---|
| "Just a simple question" | Questions are tasks. Check for a skill. |
| "Let me explore / look first" | The skill tells you HOW to explore. Skill first. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "This skill is overkill" | Simple turns complex. Load it. |
| "I already know this" | Knowing ≠ doing. Load the current skill. |

If more than one skill fits, load the **process skill first** — brainstorming,
systematic-debugging, verification-before-completion — then the implementation skill.
"Build X" → brainstorming first. "Fix this bug" → systematic-debugging first.

## Priority

1. The user's explicit instructions (this file, `REASONIX.md`, direct asks) win over everything.
2. Skills override default behavior where they conflict.
3. A user request says WHAT to do, never "skip the skill." "Add X" still means: load the skill, then add X.

