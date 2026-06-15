---
name: superpowers-systematic-debugging
description: Any bug, failing or flaky test, or surprise behavior? Load BEFORE you investigate or guess.
---

# Systematic Debugging

## Overview

Random fixes waste time, create new bugs. Quick patches mask real issue.

**Core principle:** ALWAYS find root cause before fixes. Symptom fixes = failure.

**Break letter of process = break spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

Phase 1 not done? Cannot propose fixes.

## When to Use

ANY technical issue: test failures, production bugs, unexpected behavior, performance problems, build failures, integration issues.

**ESPECIALLY when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- Already tried multiple fixes
- Previous fix didn't work
- Don't fully understand the issue

**Don't skip when:**
- Issue seems simple (simple bugs have root causes too)
- In a hurry (rushing guarantees rework)
- Manager wants it NOW (systematic beats thrashing)

## The Four Phases

You MUST complete each phase before the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip errors or warnings — often contain the exact solution
   - Read stack traces completely; note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Trigger it reliably? Exact steps?
   - Not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this? (`git diff`, recent commits, new deps, config)

4. **Gather Evidence in Multi-Component Systems**

   **WHEN system has multiple components (CI → build → signing, API → service → database), BEFORE proposing fixes, add diagnostic instrumentation at each boundary:**
   ```
   For EACH component boundary:
     - Log what data enters the component
     - Log what data exits the component
     - Verify environment/config propagation
   Run once to gather evidence showing WHERE it breaks
   THEN investigate that specific component
   ```

   **Example (multi-layer system):**
   ```bash
   echo "=== Secrets available in workflow ==="
   echo "IDENTITY: ${IDENTITY:+SET}${IDENTITY:-UNSET}"
   echo "=== Env vars in build script ==="
   env | grep IDENTITY || echo "IDENTITY not in environment"
   echo "=== Keychain state ==="
   security find-identity -v
   ```
   **This reveals** which layer fails (secrets → workflow ✓, workflow → build ✗).

5. **Trace Data Flow**

   **WHEN error deep in call stack:** see **Root Cause Tracing** reference (auto-included below) for complete backward-tracing technique.

   **Quick version:** Where does bad value originate? What called this with bad value? Trace up until you find source. Fix at source, not symptom.

### Phase 2: Pattern Analysis

1. **Find Working Examples** — locate similar working code in same codebase
2. **Compare Against References** — implementing a pattern? Read reference implementation COMPLETELY (every line, no skimming)
3. **Identify Differences** — list every difference between working and broken, however small. Don't assume "that can't matter"
4. **Understand Dependencies** — what components, settings, config, environment, assumptions does this need?

### Phase 3: Hypothesis and Testing

1. **Form Single Hypothesis** — "I think X is root cause because Y." Write it down. Be specific.
2. **Test Minimally** — SMALLEST possible change to test it. One variable at a time.
3. **Verify Before Continuing** — Worked? → Phase 4. Didn't? → form NEW hypothesis. DON'T pile fixes on top.
4. **When You Don't Know** — say "I don't understand X." Don't pretend. Ask for help. Research more.

### Phase 4: Implementation

**Fix root cause, not symptom:**

1. **Create Failing Test Case** — simplest reproduction, automated if possible. MUST have before fixing. Use **superpowers-test-driven-development** skill.
2. **Implement Single Fix** — address root cause. ONE change. No "while I'm here" improvements, no bundled refactoring.
3. **Verify Fix** — test passes now? No other tests broken? Issue actually resolved? (Use **superpowers-verification-before-completion** skill.)
4. **If Fix Doesn't Work** — STOP. Count fixes tried. < 3: return to Phase 1 with new info. **≥ 3: STOP and question architecture (step 5).** DON'T attempt fix #4 without architectural discussion.
5. **If 3+ Fixes Failed: Question Architecture**
   - Pattern: each fix reveals new coupling elsewhere; fixes require "massive refactoring"; each fix creates new symptoms.
   - STOP. Question fundamentals: Is this pattern sound? Continuing through inertia? Refactor vs. keep patching symptoms?
   - **Discuss with your human partner before more fixes.** NOT a failed hypothesis — a wrong architecture.

## Red Flags - STOP and Follow Process

Catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Here are the main problems: [lists fixes without investigation]"
- Proposing solutions before tracing data flow
- **"One more fix attempt" (when already tried 2+)**
- **Each fix reveals a new problem in a different place**

**ALL of these mean: STOP. Return to Phase 1.** 3+ fixes failed: question architecture (Phase 4.5).

## Signals You're Doing It Wrong

Watch for these redirections from your human partner:
- "Is that not happening?" — you assumed without verifying
- "Will it show us...?" — you should have added evidence gathering
- "Stop guessing" — you're proposing fixes without understanding
- "We're stuck?" (frustrated) — your approach isn't working

**See these:** STOP. Return to Phase 1.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "Reference too long, I'll adapt the pattern" | Partial understanding guarantees bugs. Read it completely. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question pattern, don't fix again. |

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |

## When Process Reveals "No Root Cause"

Systematic investigation shows issue is truly environmental, timing-dependent, or external? Process complete. Document what you investigated, implement appropriate handling (retry, timeout, error message), add monitoring/logging.

**But:** 95% of "no root cause" cases = incomplete investigation.

## Supporting Techniques (auto-included references)

- **Root Cause Tracing** — trace bugs backward through call stack to original trigger
- **Defense in Depth** — add validation at multiple layers after finding root cause
- **Condition-Based Waiting** — replace arbitrary timeouts with condition polling

**Related skills:** **superpowers-test-driven-development** (Phase 4 failing test) · **superpowers-verification-before-completion** (confirm the fix).
