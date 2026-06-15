---
name: superpowers-writing-plans
description: Got a spec or requirements for a multi-step task? Load first, before touching code.
---

# Writing Plans

## Overview

Write plans for an engineer with zero codebase context and questionable taste. Document everything: files per task, code, testing, docs to check, how to test. Whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Skilled, but knows almost nothing about our toolset or domain. Assume weak test design.

**Announce at start:** "I'm using the superpowers-writing-plans skill to create the implementation plan."

**Context:** Isolated worktree? Created via the **superpowers-using-git-worktrees** skill at execution time.

**Save plans to:** `docs/reasonix/plans/YYYY-MM-DD-<feature-name>.md`
- (User plan-location preferences override this default)

## Scope Check

Spec spans multiple independent subsystems? Should have been split into sub-project specs during superpowers-brainstorming. If not, suggest separate plans — one per subsystem. Each plan produces working, testable software on its own.

## File Structure

Before tasks, map which files get created/modified and each one's responsibility. Decomposition locks in here.

- Clear boundaries, well-defined interfaces. One responsibility per file.
- You reason best about code held in context at once; focused files = reliable edits. Prefer small, focused files.
- Files that change together live together. Split by responsibility, not technical layer.
- Existing codebases: follow established patterns. Modifying an unwieldy file? Planning a split is fine.

## Bite-Sized Task Granularity

**Each step = one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** implement this plan task-by-task — dispatch a fresh subagent per task with the native `task` tool (recommended for quality), or use the superpowers-executing-plans skill to work through it inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step contains the actual content an engineer needs. These are **plan failures** — NEVER write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — engineer may read tasks out of order)
- Steps describing what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Remember
- Exact file paths always
- Complete code in every step — step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After the full plan, reread the spec fresh and check the plan against it. Checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each spec section/requirement. Point to a task implementing it? List gaps.

**2. Placeholder scan:** Search the plan for the "No Placeholders" red flags above. Fix them.

**3. Type consistency:** Types, method signatures, property names in later tasks match earlier tasks? `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

Fix inline. No re-review — fix and move on. Spec requirement with no task? Add the task.

## Execution Handoff

After saving, offer execution choice:

**"Plan complete and saved to `docs/reasonix/plans/<filename>.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session with checkpoints.

**Which approach?"**

**If Subagent-Driven chosen:** dispatch a fresh subagent per task with the native **`task`** tool. Discipline each task: subagent implements + tests (folding in superpowers-test-driven-development), then before moving on, verify it matches the spec (nothing more/less) and code-review with the native **`review`** tool. Use **`wait`** to join parallel jobs. Keep the implementer free of parent context — give it exactly the task text it needs.

**If Inline Execution chosen:** REQUIRED SUB-SKILL — use the **superpowers-executing-plans** skill (batch execution with checkpoints).
