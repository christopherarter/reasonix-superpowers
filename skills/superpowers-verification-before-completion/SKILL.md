---
name: superpowers-verification-before-completion
description: About to say done, fixed, or passing? STOP. Load first, show real evidence.
---

# Verification Before Completion

## Overview

Claiming work complete without verification = dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

**Break the letter = break the spirit.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

Haven't run the verification command in this message? Cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete) via bash
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Subagent completed | VCS diff shows changes | Subagent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

## Red Flags - STOP

- "should", "probably", "seems to"
- Satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR unverified
- Trusting subagent success reports
- Relying on partial verification
- "just this once"
- Tired, want work over
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Subagent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ excuse |
| "Partial check is enough" | Partial proves nothing |
| "Different words, rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Subagent delegation:**
```
✅ Subagent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust subagent report
```

## When To Apply

**ALWAYS before:**
- ANY success/completion claim
- ANY expression of satisfaction
- ANY positive statement about work state
- Commit, PR, task completion
- Next task
- Delegating to subagents

**Applies to:** exact phrases, paraphrases, synonyms, implications of success, ANY communication suggesting completion/correctness.

## The Bottom Line

**No shortcuts for verification.**

Run the command. Read the output. THEN claim the result.

Non-negotiable.
