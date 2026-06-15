---
name: superpowers-finishing-a-development-branch
description: Branch finished, tests green? Load first to merge, PR, or clean up.
---

# Finishing a Development Branch

## Overview

Present clear options. Handle chosen workflow.

**Core principle:** Verify tests → detect environment → present options → execute choice → clean up.

**Announce at start:** "I'm using the superpowers-finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Tests

**Verify tests pass before options** (use **superpowers-verification-before-completion**):

```bash
npm test / cargo test / pytest / go test ./...
```

**Tests fail:** report failures. Cannot merge/PR until they pass. Stop. **Tests pass:** continue.

### Step 2: Detect Environment

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

| State | Menu | Cleanup |
|-------|------|---------|
| `GIT_DIR == GIT_COMMON` (normal repo) | Standard 4 options | No worktree to clean up |
| `GIT_DIR != GIT_COMMON`, named branch | Standard 4 options | Provenance-based (Step 6) |
| `GIT_DIR != GIT_COMMON`, detached HEAD | Reduced 3 options (no merge) | No cleanup (externally managed) |

### Step 3: Determine Base Branch

```bash
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "Branch split from main — correct?"

### Step 4: Present Options

**Normal repo or named-branch worktree — present exactly these 4 options:**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Detached HEAD — present exactly these 3 options:**

```
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)
3. Discard this work

Which option?
```

**Don't add explanation.** Keep options concise.

### Step 5: Execute Choice

#### Option 1: Merge Locally

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git checkout <base-branch>
git pull
git merge <feature-branch>
<test command>   # Verify tests on merged result
```

After merge succeeds: cleanup worktree (Step 6), then `git branch -d <feature-branch>`.

#### Option 2: Push and Create PR

```bash
git push -u origin <feature-branch>
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

**Do NOT clean up the worktree** — needed alive for PR feedback.

#### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>." No cleanup.

#### Option 4: Discard

**Confirm first** — require typed `discard`:

```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Confirmed: `cd` to main repo root, cleanup worktree (Step 6), then `git branch -D <feature-branch>`.

### Step 6: Cleanup Workspace

**Runs for Options 1 and 4 only.** Options 2 and 3 preserve worktree.

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

**If `GIT_DIR == GIT_COMMON`:** normal repo, nothing to clean up.

**If worktree path under `.worktrees/`, `worktrees/`, or `~/.config/reasonix/worktrees/`:** we created it — we own cleanup:

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git worktree remove "$WORKTREE_PATH"
git worktree prune
```

**Otherwise:** harness owns workspace. Do NOT remove it. Workspace-exit tool available? Use it. Else leave in place.

## Quick Reference

| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | yes | - | - | yes |
| 2. Create PR | - | yes | yes | - |
| 3. Keep as-is | - | - | yes | - |
| 4. Discard | - | - | - | yes (force) |

## Red Flags

**Never:** proceed on failing tests; merge without verifying tests on result; delete work without typed confirmation; force-push without explicit request; remove worktree before merge confirmed; clean up worktrees you didn't create; `git worktree remove` from inside the worktree.

**Always:** verify tests before options; detect environment before menu; present exactly 4 options (3 detached HEAD); typed confirmation for Option 4; clean up worktree for Options 1 & 4 only; `cd` to main repo root before removal; `git worktree prune` after.
