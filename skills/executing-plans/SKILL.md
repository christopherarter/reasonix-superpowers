---
name: executing-plans
description: Executing a written plan step-by-step yourself, in this session, with checkpoints? Load this first.
---

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Reasonix has first-class subagent orchestration. For higher quality on a multi-task plan, dispatch a fresh subagent per task with the native **`task`** tool (and `wait` to join parallel jobs, `review` for a code-review pass) instead of doing everything inline. Use this skill when you're executing the plan yourself, in-session, with checkpoints.

## The Process

### Step 1: Load and Review Plan
1. `read_file` the plan
2. Review critically — identify any questions or concerns about the plan
3. If concerns: raise them with your human partner before starting
4. If no concerns: create a `todo_write` list and proceed

### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified (via `bash`)
4. Mark as completed

### Step 3: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** use the **finishing-a-development-branch** skill
- Follow it to verify tests, present options, execute the choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:** the partner updates the plan based on your feedback, or the fundamental approach needs rethinking.

**Don't force through blockers** — stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications (use the **verification-before-completion** skill before claiming done)
- Reference skills when the plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

**Required workflow skills:**
- **using-git-worktrees** — ensures an isolated workspace
- **writing-plans** — creates the plan this skill executes
- **finishing-a-development-branch** — complete development after all tasks
