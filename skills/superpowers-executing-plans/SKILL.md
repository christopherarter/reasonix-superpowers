---
name: superpowers-executing-plans
description: Executing a written plan step-by-step in this session, with checkpoints? Load this first.
---

# Executing Plans

## Overview

Load plan. Review critically. Execute all tasks. Report when complete.

**Announce at start:** "I'm using the superpowers-executing-plans skill to implement this plan."

**Note:** Reasonix has first-class subagent orchestration. Higher quality on multi-task plan: dispatch fresh subagent per task via native **`task`** tool (`wait` joins parallel jobs, `review` runs code-review) instead of inline. Use this skill when executing plan yourself, in-session, with checkpoints.

## The Process

### Step 1: Load and Review Plan
1. `read_file` the plan
2. Review critically — find questions or concerns
3. Concerns? Raise with human partner before starting
4. No concerns? Create `todo_write` list, proceed

### Step 2: Execute Tasks

Per task:
1. Mark in_progress
2. Follow each step exactly (steps are bite-sized) — actually create the files the task specifies
3. Run verifications as specified (via `bash`)
4. Mark completed

### Step 3: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the superpowers-finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** use **superpowers-finishing-a-development-branch** skill
- Follow it: verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing start
- Don't understand an instruction
- Verification fails repeatedly

**Ask for clarification. Never guess.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:** partner updates plan from your feedback, or approach needs rethinking.

**Don't force through blockers** — stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly — actually create the files each task specifies
- Don't skip verifications. Run the tests the plan directs (use **superpowers-verification-before-completion** skill before claiming done)
- Reference skills when plan says to
- Report completion WITH evidence (test output) — never claim done blindly
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

**Required workflow skills:**
- **superpowers-using-git-worktrees** — ensures isolated workspace
- **superpowers-writing-plans** — creates the plan this skill executes
- **superpowers-finishing-a-development-branch** — completes development after all tasks
