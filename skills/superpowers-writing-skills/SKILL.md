---
name: superpowers-writing-skills
description: Creating, editing, or testing a Reasonix skill? Load first, before you deploy it.
---

# Writing Skills (for Reasonix)

## Overview

**Writing skills IS TDD for process docs.** Write test cases (pressure scenarios, subagents). Watch fail (baseline). Write skill. Watch pass (agent complies). Refactor (close loopholes).

**Core principle:** Didn't watch an agent fail without the skill? Don't know it teaches the right thing.

**REQUIRED BACKGROUND:** Know **superpowers-test-driven-development** first — defines RED-GREEN-REFACTOR. This adapts it to docs.

**Platform spec:** Full Reasonix skill/hook/MCP contract → `extending-reasonix`. This = *authoring discipline*; that = *exhaustive spec*.

## What is a Skill?

Reusable playbook the model invokes via `run_skill` / `read_skill` (user: `/name`). Two kinds:

- **Inline** — body folds into the turn as a tool result. Default.
- **Subagent** (`runAs: subagent`) — body = a child's *system prompt*; runs isolated, returns only its final answer. Use only when work is context-heavy and only the conclusion matters.

**ARE:** reusable techniques, patterns, tools, reference guides. **NOT:** narratives of solving something once.

## Reasonix Skill Anatomy (get these right)

### Where skills live & how found
- Discovery roots, highest priority first: project `{.reasonix,.agents,.agent,.claude}/skills/` → `[skills] paths` in `reasonix.toml` → home `~/{.reasonix,...}/skills/` → built-ins.
- First match by name wins (user `review` overrides built-in). Layout: `<root>/skills/<name>/SKILL.md`; flat `<name>.md` works too.

### Name
Regex: `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$` — letters/digits/`.`/`_`/`-`, ≤64 chars, alphanumeric start. Frontmatter `name:` overrides the dir stem.

### Frontmatter — Reasonix's OWN minimal parser, not real YAML
- `---` opens, next `---` closes. **Unclosed fence → WHOLE file is the body** (no frontmatter). Always close it.
- Lines = `key: value`. Keys **lowercased** (`runAs`=`runas`). Values trimmed of one quote layer. Empty value + `- item` lines = list (comma-joined), so `allowed-tools` can be a YAML list.
- **No block scalars** (`>`/`|`), no multi-line values, no nesting. One line per value.

Recognized keys:

| Key | Effect |
|---|---|
| `name` | identifier (must pass the regex) |
| `description` | one-liner for the pinned index. **Missing = invisible** (loads, runs by exact name, but undiscoverable) |
| `runAs` | `subagent` → isolated child; else inline |
| `model` | subagent only: child model (`provider`, bare model, or `provider/model`) |
| `effort` | subagent only: effort hint (`high`, `max`) |
| `allowed-tools` | subagent only: comma/list of literal registry tool names; scopes child's tools |

### Pinned index = 130 chars per line
System prompt lists every described skill as `- <name> [🧬 subagent] — <description>`, clipped to **130 chars incl. name**, whole block capped at 4000 chars. So:
- **Front-load triggers** — tail gets cut. Keep it short: 22-char name → ~100 chars before truncation.
- Worker skill dispatched only by another skill can OMIT `description` to stay out of the index.

### references/ auto-fold (undocumented, load-bearing)
Every `references/*.md` sibling is **appended to the body at load time**, sorted by filename, each under `## Reference: <name>`. Put depth material there — ships inline, no `read_file`. `scripts/`, `assets/`, `references/`, dot-dirs **never scanned** as nested skills. Subagent skill: references join the child's prompt — budget accordingly.

### Tool names are snake_case
Registry names only: `read_file`, `write_file`, `edit_file`, `multi_edit`, `ls`, `glob`, `grep`, `bash`, `web_fetch`, `todo_write`, `run_skill`, `read_skill`, `task`, `explore`. **No `web_search`** — only `web_fetch`. TitleCase `Read`/`Edit`/`Bash` don't exist; a typo in `allowed-tools` is silently dropped (subagent just lacks that tool).

## Subagent Skills (authoring rules)

Body = child's **system prompt**, not a message to the parent. Write it as persona + procedure + output format; state the `arguments`/`task` string is its **entire** context.

- Only input = `arguments` string. No history. Tell it exactly what its task input contains.
- **Cannot recurse** — `run_skill`/`task`/skill tools stripped. Can't load other skills. Fold needed discipline (e.g. TDD) into the body or a `references/` file.
- No mid-run back-and-forth; returns one final message. Design "ask the controller" as a *reported status* (e.g. `NEEDS_CONTEXT`), not a question.
- Scope `allowed-tools` to minimum. Empty = inherit all parent tools (minus meta-tools).

## When to Create a Skill

**Create when:** technique wasn't obvious; you'd reuse it across projects; applies broadly; others benefit.

**Don't create for:** one-offs; standard documented practices; project conventions (→ `AGENTS.md`/`REASONIX.md`); mechanical constraints a hook/lint enforces (automate those — save skills for judgment calls).

## Claude/Agent Search Optimization (CSO)

**Critical:** future agents must FIND your skill via the description.

### Description = WHEN to use, not the step-by-step workflow

State the **triggering condition**. Name the **single core action** if you want — never enumerate the multi-step procedure. Its only job: get the skill discovered and loaded.

**Why:** spell out steps and the model follows the *description*, skips the body. "review between tasks" produced ONE review when the skill specified two; trimmed to the trigger, the model read the body and did both.

**House style — validated, not dogma:** on the floor model (`deepseek-flash`) a flat "Use when X" discovers less reliably than a forceful imperative naming the situation as a question + the one key move. So every description reads `<trigger>? <STOP / Load first>[ — <one core action>]`; the benchmark (`bench/`) proves it fires the right skill (12/12). Match that voice everywhere; no bare "Use when" lines.

```yaml
# ❌ BAD: enumerates the workflow — the model follows this instead of the body
description: Dispatch a subagent per task, review between tasks, then merge
# ❌ BAD: flat trigger — weaker discovery on the floor model
description: Use when implementing a feature or bugfix
# ✅ GOOD: forceful trigger + the single core action (this repo's voice)
description: Writing or fixing any code? Load first — write the failing test before the code.
```

### Keyword coverage & naming
- Use words the model would search for: error messages ("race condition", "ENOTEMPTY"), symptoms ("flaky", "hanging"), tools (command/library names).
- Voice: direct imperative/question ("Writing code? Load first…"), not third-person prose — it's injected into the system prompt as an instruction to act on.
- Name by what you DO or the core insight, verb-first / gerund: `condition-based-waiting` > `async-test-helpers`; `superpowers-writing-plans` > `plan-authoring`.

### Cross-referencing other skills
Reference by bare name + explicit marker: `**REQUIRED SUB-SKILL:** use the superpowers-test-driven-development skill`. Don't `read_file` another SKILL.md, don't `@`-link it — use `run_skill`/`read_skill` so scope resolution and auto-fold work.

## The Iron Law (Same as TDD)

```
NO SKILL WITHOUT A FAILING TEST FIRST
```

Applies to NEW skills AND EDITS. Wrote the skill before testing? Delete it. Start over. No exceptions for "simple additions" or "just a docs update."

## RED-GREEN-REFACTOR for Skills (with Reasonix subagents)

**RED — baseline.** Dispatch a subagent (`task`, `explore`, or a throwaway subagent skill) with a pressure scenario, **without** your skill in context. Record verbatim: choices, rationalizations, which pressures triggered violations. Must see it fail first.

**GREEN — minimal skill.** Write a skill addressing those *specific* rationalizations. No content for hypothetical cases. Re-run the same scenarios with the skill loaded; agent should now comply.

**REFACTOR — close loopholes.** New rationalization? Add an explicit counter. Re-test until bulletproof.

See the **Testing Skills With Subagents** reference (auto-included below) for pressure types and methodology.

## Bulletproofing Against Rationalization (for discipline skills)

- **Close every loophole explicitly.** Not "delete it" but "delete it. Start over. Don't keep it as reference. Don't adapt it. Delete means delete."
- **Address spirit-vs-letter** early: "Violating the letter of the rules is violating the spirit." Kills a whole class of rationalizations.
- **Build a rationalization table** from baseline testing — every excuse the agent made, with the reality.
- **Create a Red Flags list** for self-check before violating.

## Flowchart Usage

Small inline `dot` flowchart ONLY for non-obvious decision points, loops where you might stop too early, or "A vs B" choices. Never for reference (tables), code (code blocks), or linear steps (numbered lists).

## Anti-Patterns

- **❌ Narrative example** ("In session 2025-10-03 we found…") — too specific, not reusable
- **❌ Multi-language dilution** — one excellent example beats five mediocre
- **❌ Code inside flowcharts** — can't copy-paste
- **❌ Generic labels** (`step1`, `helper2`) — labels must carry meaning
- **❌ Enumerating the multi-step workflow in `description`** — #1 discovery bug (single core action fine; the step sequence is not)
- **❌ Bloated bodies for a weak target model** — on the floor model every extra paragraph competes with the rules; cut narrative and examples, fold discipline into terse tables, let the benchmark (not obra fidelity) decide what stays

## STOP: Before Moving to the Next Skill

After writing ANY skill, STOP and finish its test+deploy cycle. Don't batch-create untested skills. Untested skill = untested code.

## Skill Creation Checklist (TDD Adapted)

`todo_write` each item.

**RED:** [ ] pressure scenarios (3+ combined for discipline skills) · [ ] run WITHOUT skill, record baseline verbatim · [ ] identify rationalization patterns

**GREEN:** [ ] valid name (regex) · [ ] fence closed; `name` + `description` present · [ ] description trigger-first (single core action OK, never the full workflow), fits ~130-char line · [ ] imperative house voice · [ ] search keywords · [ ] addresses baseline failures · [ ] one excellent example · [ ] correct snake_case tools · [ ] run WITH skill, verify compliance

**REFACTOR:** [ ] counters for new rationalizations · [ ] rationalization table · [ ] red-flags list · [ ] re-test until bulletproof

**Subagent skills:** [ ] body = system prompt · [ ] states task is its entire context · [ ] `allowed-tools` minimal, valid names · [ ] no recursion or mid-run questions

**Deploy:** [ ] confirm discovery (appears in skill list / index) · [ ] invoke `/name` or `run_skill` to confirm it loads · [ ] commit to git

## The Bottom Line

Creating skills IS TDD for process docs. Same Iron Law (no skill without a failing test first), same cycle (RED → GREEN → REFACTOR), same payoff (better quality, bulletproof results).
