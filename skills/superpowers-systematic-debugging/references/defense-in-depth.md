# Defense-in-Depth Validation

## Overview

Fix a bug caused by invalid data, validation at one place feels sufficient. But that single check gets bypassed by different code paths, refactoring, or mocks.

**Core principle:** Validate at EVERY layer data passes through. Make the bug structurally impossible.

## Why Multiple Layers

Single validation: "We fixed the bug." Multiple layers: "We made the bug impossible."

Different layers catch different cases:
- Entry validation catches most bugs
- Business logic catches edge cases
- Environment guards prevent context-specific dangers
- Debug logging helps when other layers fail

## The Four Layers

### Layer 1: Entry Point Validation
Reject obviously invalid input at API boundary.
```typescript
function createProject(name: string, workingDirectory: string) {
  if (!workingDirectory?.trim()) throw new Error('workingDirectory cannot be empty');
  if (!existsSync(workingDirectory)) throw new Error(`does not exist: ${workingDirectory}`);
  if (!statSync(workingDirectory).isDirectory()) throw new Error(`not a directory: ${workingDirectory}`);
}
```

### Layer 2: Business Logic Validation
Ensure data makes sense for this operation.
```typescript
function initializeWorkspace(projectDir: string, sessionId: string) {
  if (!projectDir) throw new Error('projectDir required for workspace initialization');
}
```

### Layer 3: Environment Guards
Prevent dangerous operations in specific contexts.
```typescript
async function gitInit(directory: string) {
  if (process.env.NODE_ENV === 'test') {
    const normalized = normalize(resolve(directory));
    const tmp = normalize(resolve(tmpdir()));
    if (!normalized.startsWith(tmp))
      throw new Error(`Refusing git init outside temp dir during tests: ${directory}`);
  }
}
```

### Layer 4: Debug Instrumentation
Capture context for forensics.
```typescript
logger.debug('About to git init', { directory, cwd: process.cwd(), stack: new Error().stack });
```

## Applying the Pattern

When you find a bug:
1. **Trace the data flow** — where does bad value originate? Where used?
2. **Map all checkpoints** — list every point data passes through
3. **Add validation at each layer** — entry, business, environment, debug
4. **Test each layer** — try to bypass layer 1, verify layer 2 catches it

## Key Insight

All four layers can be necessary. During testing, each catches bugs the others miss: different code paths bypass entry validation; mocks bypass business logic; edge cases on different platforms need environment guards; debug logging identifies structural misuse.

**Don't stop at one validation point.** Add checks at every layer.
