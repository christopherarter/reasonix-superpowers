# Root Cause Tracing

## Overview

Bugs often manifest deep in call stack (git init in wrong directory, file created in wrong location, database opened with wrong path). Instinct: fix where error appears. That treats a symptom.

**Core principle:** Trace backward through the call chain until you find the original trigger, then fix at the source.

## When to Use

```dot
digraph when_to_use {
    "Bug appears deep in stack?" [shape=diamond];
    "Can trace backwards?" [shape=diamond];
    "Fix at symptom point" [shape=box];
    "Trace to original trigger" [shape=box];
    "BETTER: Also add defense-in-depth" [shape=box];

    "Bug appears deep in stack?" -> "Can trace backwards?" [label="yes"];
    "Can trace backwards?" -> "Trace to original trigger" [label="yes"];
    "Can trace backwards?" -> "Fix at symptom point" [label="no - dead end"];
    "Trace to original trigger" -> "BETTER: Also add defense-in-depth";
}
```

**Use when:** error happens deep in execution (not at entry point); stack trace shows long call chain; unclear where invalid data originated; need to find which test/code triggers the problem.

## The Tracing Process

1. **Observe the Symptom** — `Error: git init failed in ~/project/packages/core`
2. **Find Immediate Cause** — what code directly causes this? `await execFileAsync('git', ['init'], { cwd: projectDir })`
3. **Ask: What Called This?** — `createSessionWorktree(projectDir)` ← `initializeWorkspace()` ← `Session.create()` ← test
4. **Keep Tracing Up** — what value was passed? `projectDir = ''` (empty string → resolves to `process.cwd()` → the source dir!)
5. **Find Original Trigger** — where did the empty string come from? `const ctx = setupCoreTest(); // { tempDir: '' }` accessed before `beforeEach`

## Adding Stack Traces

Can't trace manually? Add instrumentation:

```typescript
async function gitInit(directory: string) {
  console.error('DEBUG git init:', {
    directory, cwd: process.cwd(), stack: new Error().stack,
  });
  await execFileAsync('git', ['init'], { cwd: directory });
}
```

**Critical:** Use `console.error()` in tests (loggers may be suppressed). Log **before** the dangerous operation, not after it fails. Include directory, cwd, env vars, timestamps. Capture `new Error().stack` for full call chain.

**Run and capture:** `npm test 2>&1 | grep 'DEBUG git init'`. Look for test file names and line numbers; identify the pattern (same test? same parameter?).

## Finding Which Test Causes Pollution

Something appears during tests but you don't know which test? Bisect with the bundled `scripts/find-polluter.sh`:

```bash
./scripts/find-polluter.sh '.git' 'src/**/*.test.ts'
```

Runs tests one-by-one, stops at the first polluter.

## Key Principle

```dot
digraph principle {
    "Found immediate cause" [shape=ellipse];
    "Can trace one level up?" [shape=diamond];
    "Trace backwards" [shape=box];
    "Is this the source?" [shape=diamond];
    "Fix at source" [shape=box];
    "Add validation at each layer" [shape=box];
    "Bug impossible" [shape=doublecircle];
    "NEVER fix just the symptom" [shape=octagon, style=filled, fillcolor=red, fontcolor=white];

    "Found immediate cause" -> "Can trace one level up?";
    "Can trace one level up?" -> "Trace backwards" [label="yes"];
    "Can trace one level up?" -> "NEVER fix just the symptom" [label="no"];
    "Trace backwards" -> "Is this the source?";
    "Is this the source?" -> "Trace backwards" [label="no - keeps going"];
    "Is this the source?" -> "Fix at source" [label="yes"];
    "Fix at source" -> "Add validation at each layer";
    "Add validation at each layer" -> "Bug impossible";
}
```

**NEVER fix just where the error appears.** Trace back to the original trigger, fix at the source, then add defense-in-depth validation at each layer the bad value passed through.
