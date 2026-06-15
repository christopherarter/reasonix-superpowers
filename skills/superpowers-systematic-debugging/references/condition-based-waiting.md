# Condition-Based Waiting

## Overview

Flaky tests guess at timing with arbitrary delays. Creates race conditions: tests pass on fast machines, fail under load or in CI.

**Core principle:** Wait for the actual condition you care about, not a guess about how long it takes.

## When to Use

**Use when:** tests have arbitrary delays (`setTimeout`, `sleep`, `time.sleep()`); tests flaky (pass sometimes, fail under load); tests timeout when run in parallel; waiting for async operations to complete.

**Don't use when:** testing actual timing behavior (debounce, throttle intervals) — but always document WHY if using an arbitrary timeout.

## Core Pattern

```typescript
// ❌ BEFORE: Guessing at timing
await new Promise(r => setTimeout(r, 50));
const result = getResult();
expect(result).toBeDefined();

// ✅ AFTER: Waiting for condition
await waitFor(() => getResult() !== undefined, 'result to be set');
expect(getResult()).toBeDefined();
```

## Quick Patterns

| Scenario | Pattern |
|----------|---------|
| Wait for event | `waitFor(() => events.find(e => e.type === 'DONE'))` |
| Wait for state | `waitFor(() => machine.state === 'ready')` |
| Wait for count | `waitFor(() => items.length >= 5)` |
| Wait for file | `waitFor(() => fs.existsSync(path))` |
| Complex condition | `waitFor(() => obj.ready && obj.value > 10)` |

## Implementation

```typescript
async function waitFor<T>(
  condition: () => T | undefined | null | false,
  description: string,
  timeoutMs = 5000
): Promise<T> {
  const startTime = Date.now();
  while (true) {
    const result = condition();
    if (result) return result;
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, 10)); // Poll every 10ms
  }
}
```

## Common Mistakes

- **❌ Polling too fast** (`setTimeout(check, 1)`) wastes CPU → **✅** poll every 10ms
- **❌ No timeout** loops forever → **✅** always include a timeout with clear error
- **❌ Stale data** cached before loop → **✅** call getter inside loop for fresh data

## When Arbitrary Timeout IS Correct

```typescript
await waitForEvent(manager, 'TOOL_STARTED'); // First: wait for the triggering condition
await new Promise(r => setTimeout(r, 200));   // Then: wait for timed behavior (2 ticks @ 100ms)
```

**Requirements:** first wait for triggering condition; base delay on known timing (not guessing); comment explaining WHY.
