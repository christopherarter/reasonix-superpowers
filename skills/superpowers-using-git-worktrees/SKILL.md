---
name: superpowers-using-git-worktrees
description: Feature work needing an isolated workspace, or executing a plan? Load first.
---

# Using Git Worktrees

## Overview

Work in isolated workspace. Prefer native worktree tools; manual git worktrees only when none.

**Core principle:** Detect existing isolation first. Then native tools. Then git fallback. Never fight harness.

**Announce at start:** "I'm using the superpowers-using-git-worktrees skill to set up an isolated workspace."

## Step 0: Detect Existing Isolation

**Before creating anything, check if already in isolated workspace.** Via `bash`:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

**Submodule guard:** `GIT_DIR != GIT_COMMON` also true inside submodules. Verify not a submodule before concluding "worktree":

```bash
# If this returns a path, you're in a submodule, not a worktree — treat as normal repo
git rev-parse --show-superproject-working-tree 2>/dev/null
```

**If `GIT_DIR != GIT_COMMON` (and not a submodule):** Already in linked worktree. Skip to Step 3, do NOT create another. Report branch state:
- On a branch: "Already in isolated workspace at `<path>` on branch `<name>`."
- Detached HEAD: "Already in isolated workspace at `<path>` (detached HEAD, externally managed). Branch creation needed at finish."

**If `GIT_DIR == GIT_COMMON` (or in a submodule):** Normal repo checkout. Preference declared? Honor it, no asking. Else ask consent:

> "Would you like me to set up an isolated worktree? It protects your current branch from changes."

Declines: work in place, skip to Step 3 — do NOT start editing feature code on the current branch first.

## Step 1: Create Isolated Workspace

### 1a. Native Worktree Tools (preferred)

Already have a worktree mechanism — a tool named `EnterWorktree`, `WorktreeCreate`, a `/worktree` command, or a `--worktree` flag? Use it, skip to Step 3.

Native tools handle placement, branch creation, cleanup. Using `git worktree add` when a native tool exists creates phantom state the harness can't manage. No native tool: proceed to Step 1b.

### 1b. Git Worktree Fallback

**Only use if Step 1a does not apply.** Explicit user preference always beats filesystem state.

#### Directory Selection

1. **Check instructions for declared directory preference.** Use it, no asking.
2. **Check for existing project-local worktree directory:**
   ```bash
   ls -d .worktrees 2>/dev/null     # Preferred (hidden)
   ls -d worktrees 2>/dev/null      # Alternative
   ```
   Both exist? `.worktrees` wins.
3. **Check for existing global directory:**
   ```bash
   project=$(basename "$(git rev-parse --show-toplevel)")
   ls -d ~/.config/reasonix/worktrees/$project 2>/dev/null
   ```
4. **No other guidance:** default to `.worktrees/` at project root.

#### Safety Verification (project-local directories only)

**MUST verify directory ignored before creating worktree:**

```bash
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**If NOT ignored:** add to `.gitignore`, commit, proceed. **Why critical:** prevents committing worktree contents. Global directories need no verification.

#### Create the Worktree

```bash
# For project-local: path="$LOCATION/$BRANCH_NAME"
# For global: path="~/.config/reasonix/worktrees/$project/$BRANCH_NAME"
git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

**Sandbox fallback:** `git worktree add` fails with permission error (sandbox denial — Reasonix confines writes to `[sandbox] workspace_root`)? Tell the user the sandbox blocked it, working in the current directory instead. Run setup and baseline tests in place.

## Step 3: Project Setup

Auto-detect and run setup, `bash`:

```bash
if [ -f package.json ]; then npm install; fi
if [ -f Cargo.toml ]; then cargo build; fi
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi
if [ -f go.mod ]; then go mod download; fi
```

## Step 4: Verify Clean Baseline

Run tests, ensure clean baseline (`npm test` / `cargo test` / `pytest` / `go test ./...`).

**Tests fail:** report failures, ask whether to proceed or investigate. **Pass:** report ready.

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## Quick Reference

| Situation | Action |
|-----------|--------|
| Already in linked worktree | Skip creation (Step 0) |
| In a submodule | Treat as normal repo (Step 0 guard) |
| Native worktree tool available | Use it (Step 1a) |
| No native tool | Git worktree fallback (Step 1b) |
| `.worktrees/` exists | Use it (verify ignored) |
| Both `.worktrees/` and `worktrees/` exist | Use `.worktrees/` |
| Neither exists | Check instruction file, then default `.worktrees/` |
| Directory not ignored | Add to `.gitignore` + commit |
| Permission error on create | Sandbox fallback, work in place |
| Tests fail during baseline | Report failures + ask |

## Red Flags

**Never:**
- Create a worktree when Step 0 detects existing isolation
- Use `git worktree add` when a native worktree tool exists — #1 mistake
- Skip Step 1a, jump straight to git commands
- Create project-local worktree without verifying it's ignored
- Skip baseline test verification
- Proceed with failing tests without asking

**Always:** run Step 0 first; prefer native tools; follow directory priority (existing > global legacy > instruction file > default); verify ignored for project-local; auto-detect and run setup; verify clean test baseline.
