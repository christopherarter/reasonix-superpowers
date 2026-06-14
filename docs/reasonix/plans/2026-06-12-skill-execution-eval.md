# Skill Execution Eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `bench/exec/` — a two-phase eval that measures whether `deepseek-flash` follows each of the 10 skills' disciplines once loaded, producing a per-skill fidelity score to baseline before / regression-check after the caveman body migration.

**Architecture:** Phase 1 `generate.mjs` (self-contained: runs each skill's scenario through `reasonix run` in an isolated temp workspace, captures transcript + created files + deterministic mechanical-check results). Phase 2 judging by Claude subagents in-session (per-skill rubric verdicts; mechanical hard-gate results are authoritative). Pure logic (transcript pairing, mechanical predicates) is unit-tested with `node --test`; the pipeline is de-risked on one scenario before scaling to ten.

**Tech Stack:** Node 22 (ESM, zero deps, built-in test runner), `reasonix npm-v1.4.0-rc.1`, DeepSeek (`deepseek-flash`), Claude judge via the Agent tool.

**Spec:** `docs/reasonix/specs/2026-06-11-skill-execution-eval-design.md`

**Reuse:** `bench/lib/transcript.mjs` (`extractSkillInvocations`), and the sessions-dir resolver + isolation-config pattern from `bench/behavioral.mjs`.

---

## File structure

```
bench/exec/
  lib/transcript-detail.mjs   # ordered [{name,args,resultText}] tool-call extractor (pure)
  lib/mechanical.mjs          # mechanical-check predicates + runMechanical dispatcher (pure)
  scenarios/<skill>.json      # 10 scenario files (prompt + rubric + fixture ref + maxSteps)
  fixtures/<skill>/...         # throwaway workspace state copied per run
  generate.mjs                # phase 1 orchestrator + CLI
  judge.mjs                   # phase 2: buildJudgePayload() + JUDGE_INSTRUCTION + JUDGE_SCHEMA
  score.mjs                   # aggregate verdicts + mechanical -> report.json
  results/                    # gitignored
  README.md
```

---

### Task 1: Scaffold `bench/exec/`

**Files:**
- Create: `bench/exec/.gitignore`

- [ ] **Step 1: Create `bench/exec/.gitignore`**

```gitignore
results/
```

- [ ] **Step 2: Verify the invocation harness modules it will reuse exist**

Run: `ls bench/lib/transcript.mjs bench/behavioral.mjs && node --version`
Expected: both files listed, Node `v22.x`.

- [ ] **Step 3: Commit**

```bash
git add bench/exec/.gitignore
git commit -m "chore(exec): scaffold skill execution eval dir"
```

---

### Task 2: Detailed transcript extractor (`bench/exec/lib/transcript-detail.mjs`)

Pairs each assistant tool call with its result, in order. Reasonix's flat shape: assistant `tool_calls[]` are `{id, name, arguments}`; results are `{role:"tool", name, tool_call_id, content}`. Pair by id.

**Files:**
- Create: `bench/exec/lib/transcript-detail.mjs`
- Test: `bench/exec/lib/transcript-detail.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// bench/exec/lib/transcript-detail.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractToolCalls } from './transcript-detail.mjs';

const jsonl = [
  JSON.stringify({ role: 'user', content: 'go' }),
  JSON.stringify({ role: 'assistant', tool_calls: [
    { id: 'a1', name: 'write_file', arguments: JSON.stringify({ path: 'tests/x.test.mjs', content: 't' }) },
    { id: 'a2', name: 'bash', arguments: JSON.stringify({ command: 'node --test' }) },
  ] }),
  JSON.stringify({ role: 'tool', name: 'write_file', tool_call_id: 'a1', content: 'wrote' }),
  JSON.stringify({ role: 'tool', name: 'bash', tool_call_id: 'a2', content: '# fail 1' }),
  JSON.stringify({ role: 'assistant', tool_calls: [
    { id: 'a3', name: 'write_file', arguments: JSON.stringify({ path: 'src/x.mjs', content: 'c' }) },
  ] }),
  JSON.stringify({ role: 'tool', name: 'write_file', tool_call_id: 'a3', content: 'ok' }),
].join('\n');

test('extracts ordered tool calls with parsed args and paired result text', () => {
  const calls = extractToolCalls(jsonl);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => c.name), ['write_file', 'bash', 'write_file']);
  assert.equal(calls[0].args.path, 'tests/x.test.mjs');
  assert.equal(calls[1].resultText, '# fail 1');
  assert.equal(calls[2].args.path, 'src/x.mjs');
});

test('tolerates malformed lines and unpaired calls', () => {
  const t = [
    'not json',
    JSON.stringify({ role: 'assistant', tool_calls: [{ id: 'z', name: 'ls', arguments: '{bad' }] }),
  ].join('\n');
  const calls = extractToolCalls(t);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, {});       // unparseable args -> {}
  assert.equal(calls[0].resultText, '');     // no result -> ''
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bench/exec/lib/transcript-detail.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// bench/exec/lib/transcript-detail.mjs

/**
 * Walk a Reasonix session JSONL and return tool calls in order, each paired
 * with its result text. Handles the flat shape {id,name,arguments} and the
 * nested OpenAI {function:{name,arguments}} shape.
 * @returns {Array<{ name:string, args:object, resultText:string, id:string }>}
 */
export function extractToolCalls(jsonlText) {
  const calls = [];
  const results = new Map(); // tool_call_id -> content
  const lines = jsonlText.split('\n');

  // First pass: collect tool results by id.
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let o; try { o = JSON.parse(t); } catch { continue; }
    if (o.role === 'tool' && o.tool_call_id) results.set(o.tool_call_id, String(o.content ?? ''));
  }

  // Second pass: collect assistant tool calls in order.
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let o; try { o = JSON.parse(t); } catch { continue; }
    if (o.role !== 'assistant' || !Array.isArray(o.tool_calls)) continue;
    for (const tc of o.tool_calls) {
      if (!tc) continue;
      const name = tc.name ?? tc.function?.name;
      const rawArgs = tc.arguments ?? tc.function?.arguments;
      if (!name) continue;
      let args = {};
      try { args = JSON.parse(rawArgs || '{}'); } catch { args = {}; }
      const id = tc.id ?? '';
      calls.push({ name, args, id, resultText: results.get(id) ?? '' });
    }
  }
  return calls;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bench/exec/lib/transcript-detail.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bench/exec/lib/transcript-detail.mjs bench/exec/lib/transcript-detail.test.mjs
git commit -m "feat(exec): detailed tool-call extractor with result pairing"
```

---

### Task 3: Mechanical predicates (`bench/exec/lib/mechanical.mjs`)

Deterministic checks over the tool-call list and the post-run workspace. Each returns `{ pass, evidence }`. A `runMechanical(checkStr, calls, workspaceDir)` dispatcher parses the `"fn:argA:argB"` strings used in scenarios.

**Files:**
- Create: `bench/exec/lib/mechanical.mjs`
- Test: `bench/exec/lib/mechanical.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// bench/exec/lib/mechanical.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editPrecedes, failingTestRunBetween, passingTestRunAfter, noWriteBeforeSignal, runMechanical } from './mechanical.mjs';

const calls = [
  { name: 'write_file', args: { path: 'tests/slug.test.mjs' }, resultText: 'wrote' },
  { name: 'bash', args: { command: 'node --test tests/' }, resultText: 'tests 1\n# fail 1' },
  { name: 'write_file', args: { path: 'src/strings.mjs' }, resultText: 'wrote' },
  { name: 'bash', args: { command: 'node --test tests/' }, resultText: 'tests 1\n# pass 1\n# fail 0' },
];

test('editPrecedes: test file before impl file', () => {
  assert.equal(editPrecedes(calls, 'tests/**', 'src/strings.mjs').pass, true);
  assert.equal(editPrecedes(calls, 'src/strings.mjs', 'tests/**').pass, false);
});

test('failingTestRunBetween: a failing run sits between test-edit and impl-edit', () => {
  assert.equal(failingTestRunBetween(calls, 'tests/**', 'src/strings.mjs').pass, true);
});

test('passingTestRunAfter: a passing run after the impl edit', () => {
  assert.equal(passingTestRunAfter(calls, 'src/strings.mjs').pass, true);
});

test('noWriteBeforeSignal: false when a write precedes the signal tool', () => {
  const c = [{ name: 'write_file', args: { path: 'a' }, resultText: '' }, { name: 'ask', args: {}, resultText: '' }];
  assert.equal(noWriteBeforeSignal(c, ['ask']).pass, false);
  const c2 = [{ name: 'ask', args: {}, resultText: '' }, { name: 'write_file', args: { path: 'a' }, resultText: '' }];
  assert.equal(noWriteBeforeSignal(c2, ['ask']).pass, true);
});

test('runMechanical dispatches by string and reports unknown checks', () => {
  assert.equal(runMechanical('editPrecedes:tests/**:src/strings.mjs', calls, null).pass, true);
  const r = runMechanical('bogusCheck:x', calls, null);
  assert.equal(r.pass, false);
  assert.match(r.evidence, /unknown/i);
});

test('artifactExists + grepArtifactAbsent via runMechanical over a temp workspace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exec-'));
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs/plan.md'), '# Plan\n- [ ] Task 1\nreal content');
  assert.equal(runMechanical('artifactExists:docs/*.md', [], dir).pass, true);
  assert.equal(runMechanical('grepArtifactAbsent:docs/plan.md:TODO|TBD', [], dir).pass, true);
  writeFileSync(join(dir, 'docs/plan.md'), '# Plan\nTODO: fill in');
  assert.equal(runMechanical('grepArtifactAbsent:docs/plan.md:TODO|TBD', [], dir).pass, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bench/exec/lib/mechanical.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// bench/exec/lib/mechanical.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'multi_edit']);
const TEST_RE = /\b(node --test|npm test|npm run test|vitest|jest|pytest|go test)\b/;
const FAIL_RE = /# fail [1-9]|not ok|FAIL|failed|Error:|exit code [1-9]/i;
const PASS_RE = /# fail 0|# pass [1-9]|all tests passed|ok \d|PASS\b/i;

function globToRe(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').replace(/ /g, '.*');
  return new RegExp('^' + esc + '$');
}
function pathOf(call) {
  const a = call.args || {};
  return a.path || a.file_path || a.file || a.filename || '';
}
function isWrite(call) { return WRITE_TOOLS.has(call.name); }
function isTestRun(call) { return call.name === 'bash' && TEST_RE.test(call.args?.command || ''); }
function firstWriteIndex(calls, glob) {
  const re = globToRe(glob);
  return calls.findIndex((c) => isWrite(c) && re.test(pathOf(c)));
}

export function editPrecedes(calls, aGlob, bGlob) {
  const ai = firstWriteIndex(calls, aGlob);
  const bi = firstWriteIndex(calls, bGlob);
  if (ai === -1) return { pass: false, evidence: `no write matching ${aGlob}` };
  if (bi === -1) return { pass: false, evidence: `no write matching ${bGlob}` };
  return { pass: ai < bi, evidence: `${aGlob}@${ai} ${ai < bi ? 'before' : 'after'} ${bGlob}@${bi}` };
}

export function failingTestRunBetween(calls, testGlob, implGlob) {
  const ti = firstWriteIndex(calls, testGlob);
  const ii = firstWriteIndex(calls, implGlob);
  if (ti === -1) return { pass: false, evidence: `no test write matching ${testGlob}` };
  const upper = ii === -1 ? calls.length : ii;
  for (let k = ti + 1; k < upper; k++) {
    if (isTestRun(calls[k]) && FAIL_RE.test(calls[k].resultText)) {
      return { pass: true, evidence: `failing test run at ${k}: ${calls[k].resultText.slice(0, 60)}` };
    }
  }
  return { pass: false, evidence: `no failing test run between test write and impl write` };
}

export function passingTestRunAfter(calls, implGlob) {
  const ii = firstWriteIndex(calls, implGlob);
  if (ii === -1) return { pass: false, evidence: `no impl write matching ${implGlob}` };
  for (let k = ii + 1; k < calls.length; k++) {
    if (isTestRun(calls[k]) && PASS_RE.test(calls[k].resultText) && !FAIL_RE.test(calls[k].resultText)) {
      return { pass: true, evidence: `passing test run at ${k}` };
    }
  }
  return { pass: false, evidence: `no passing test run after impl write` };
}

export function noWriteBeforeSignal(calls, signalTools) {
  const sig = new Set(signalTools);
  for (const c of calls) {
    if (sig.has(c.name)) return { pass: true, evidence: `signal ${c.name} reached with no prior write` };
    if (isWrite(c)) return { pass: false, evidence: `write ${pathOf(c)} before any of [${signalTools}]` };
  }
  return { pass: true, evidence: `no writes at all` };
}

export function calledTool(calls, name) {
  const hit = calls.some((c) => c.name === name);
  return { pass: hit, evidence: hit ? `called ${name}` : `never called ${name}` };
}

export function bashMatches(calls, reSource) {
  const re = new RegExp(reSource);
  const hit = calls.find((c) => c.name === 'bash' && re.test(c.args?.command || ''));
  return { pass: !!hit, evidence: hit ? `bash matched /${reSource}/: ${hit.args.command.slice(0, 60)}` : `no bash matched /${reSource}/` };
}

export function noBashBefore(calls, reSource, signalTools) {
  // pass unless a bash matching reSource occurs before any signal tool
  const re = new RegExp(reSource);
  const sig = new Set(signalTools);
  for (const c of calls) {
    if (sig.has(c.name)) return { pass: true, evidence: `signal reached first` };
    if (c.name === 'bash' && re.test(c.args?.command || '')) return { pass: false, evidence: `bash /${reSource}/ before signal: ${c.args.command.slice(0, 50)}` };
  }
  return { pass: true, evidence: `no matching bash` };
}

export function artifactExists(workspaceDir, glob) {
  if (!workspaceDir) return { pass: false, evidence: 'no workspace' };
  const re = globToRe(glob);
  const found = walk(workspaceDir).find((rel) => re.test(rel));
  return { pass: !!found, evidence: found ? `found ${found}` : `no file matching ${glob}` };
}

export function grepArtifactAbsent(workspaceDir, fileGlob, reSource) {
  if (!workspaceDir) return { pass: false, evidence: 'no workspace' };
  const re = globToRe(fileGlob);
  const file = walk(workspaceDir).find((rel) => re.test(rel));
  if (!file) return { pass: false, evidence: `no file matching ${fileGlob}` };
  const body = readFileSync(join(workspaceDir, file), 'utf8');
  const bad = new RegExp(reSource, 'i').exec(body);
  return { pass: !bad, evidence: bad ? `matched /${reSource}/ in ${file}: "${bad[0]}"` : `clean: ${file}` };
}

function walk(dir, base = '') {
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === '.git' || e === 'node_modules') continue;
    const abs = join(dir, e);
    const rel = base ? `${base}/${e}` : e;
    if (statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else out.push(rel);
  }
  return out;
}

const REGISTRY = {
  editPrecedes: (calls, ws, [a, b]) => editPrecedes(calls, a, b),
  failingTestRunBetween: (calls, ws, [a, b]) => failingTestRunBetween(calls, a, b),
  passingTestRunAfter: (calls, ws, [a]) => passingTestRunAfter(calls, a),
  noWriteBeforeSignal: (calls, ws, args) => noWriteBeforeSignal(calls, args),
  calledTool: (calls, ws, [a]) => calledTool(calls, a),
  bashMatches: (calls, ws, [a]) => bashMatches(calls, a),
  noBashBefore: (calls, ws, [re, ...sig]) => noBashBefore(calls, re, sig),
  artifactExists: (calls, ws, [a]) => artifactExists(ws, a),
  grepArtifactAbsent: (calls, ws, [a, b]) => grepArtifactAbsent(ws, a, b),
};

/** Parse "fn:argA:argB" and dispatch. Globs containing no ':' are safe; regex args must not contain ':'. */
export function runMechanical(checkStr, calls, workspaceDir) {
  const [fn, ...args] = checkStr.split(':');
  const impl = REGISTRY[fn];
  if (!impl) return { pass: false, evidence: `unknown mechanical check: ${fn}` };
  return impl(calls, workspaceDir, args);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bench/exec/lib/mechanical.test.mjs`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bench/exec/lib/mechanical.mjs bench/exec/lib/mechanical.test.mjs
git commit -m "feat(exec): mechanical hard-gate predicates + dispatcher"
```

---

### Task 4: Scenario format + the TDD scenario (de-risk scenario only)

Author just the `test-driven-development` scenario + fixture (richest mechanical anchors) plus a scenario-validation test. The other 9 come in Task 7 after the pipeline is proven.

**Files:**
- Create: `bench/exec/scenarios/test-driven-development.json`
- Create: `bench/exec/fixtures/test-driven-development/src/strings.mjs`
- Create: `bench/exec/fixtures/test-driven-development/package.json`
- Test: `bench/exec/scenarios.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// bench/exec/scenarios.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(join(here, 'scenarios')).filter((f) => f.endsWith('.json'));

test('every scenario is well-formed and its fixture (if any) exists', () => {
  assert.ok(files.length >= 1, 'need at least one scenario');
  for (const f of files) {
    const s = JSON.parse(readFileSync(join(here, 'scenarios', f), 'utf8'));
    assert.equal(typeof s.skill, 'string');
    assert.equal(typeof s.prompt, 'string');
    assert.ok(Number.isInteger(s.maxSteps) && s.maxSteps > 0);
    assert.ok(Array.isArray(s.rubric) && s.rubric.length >= 1);
    for (const c of s.rubric) {
      assert.ok(c.id && typeof c.desc === 'string', `criterion needs id+desc in ${f}`);
    }
    if (s.fixture) assert.ok(existsSync(join(here, 'fixtures', s.fixture)), `missing fixture ${s.fixture}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bench/exec/scenarios.test.mjs`
Expected: FAIL — no `scenarios/` dir / no `.json` files.

- [ ] **Step 3: Create the fixture**

`bench/exec/fixtures/test-driven-development/package.json`:
```json
{ "name": "fixture-tdd", "type": "module", "private": true }
```

`bench/exec/fixtures/test-driven-development/src/strings.mjs`:
```javascript
// Existing helpers. Add new functions here.
export function shout(s) { return String(s).toUpperCase(); }
```

- [ ] **Step 4: Create the scenario**

`bench/exec/scenarios/test-driven-development.json`:
```json
{
  "skill": "test-driven-development",
  "prompt": "Add a `slugify(text)` function to src/strings.mjs that lowercases the text and replaces runs of whitespace with a single hyphen. Implement it properly.",
  "fixture": "test-driven-development",
  "maxSteps": 22,
  "rubric": [
    { "id": "test-first", "hardGate": true, "mechanical": "editPrecedes:tests/**:src/strings.mjs", "desc": "Wrote a failing test before the implementation" },
    { "id": "saw-red", "hardGate": true, "mechanical": "failingTestRunBetween:tests/**:src/strings.mjs", "desc": "Ran the test and saw it fail before implementing" },
    { "id": "green", "mechanical": "passingTestRunAfter:src/strings.mjs", "desc": "Re-ran the tests green after implementing" },
    { "id": "asserts-behavior", "desc": "The test makes real assertions about slugify's output (e.g. 'Hello World' -> 'hello-world'), not a tautology" },
    { "id": "minimal-impl", "desc": "The implementation is minimal and on-spec — no unrequested features" }
  ]
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test bench/exec/scenarios.test.mjs`
Expected: PASS — 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add bench/exec/scenarios/test-driven-development.json bench/exec/fixtures/test-driven-development bench/exec/scenarios.test.mjs
git commit -m "feat(exec): scenario format + test-driven-development scenario"
```

---

### Task 5: Generation orchestrator (`bench/exec/generate.mjs`) + live smoke

Runs a scenario in an isolated temp workspace, captures transcript + artifacts + mechanical results. Smoke-tested live on the TDD scenario.

**Files:**
- Create: `bench/exec/generate.mjs`

- [ ] **Step 1: Write the generator**

```javascript
// bench/exec/generate.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { extractToolCalls } from './lib/transcript-detail.mjs';
import { runMechanical } from './lib/mechanical.mjs';
import { extractSkillInvocations } from '../lib/transcript.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SKILLS_DIR = join(REPO_ROOT, 'skills');
const RESULTS = join(HERE, 'results');

export function resolveSessionsDir() {
  const out = execFileSync('reasonix', ['doctor'], { encoding: 'utf8' });
  const m = out.match(/sessions[\s\S]*?dir\s+(.+)/);
  if (!m) throw new Error('no sessions dir from reasonix doctor');
  return m[1].trim().replace(/^~/, homedir());
}

function isolatedConfig() {
  return [
    `default_model = "deepseek-flash"`,
    `[skills]`,
    `paths = ["${SKILLS_DIR}"]`,
    `excluded_paths = ["~/.reasonix/skills", "~/.agents/skills", "~/.agent/skills", "~/.claude/skills"]`,
    `[permissions]`,
    `mode = "allow"`,
    ``,
  ].join('\n');
}

function setupWorkspace(scenario) {
  const ws = mkdtempSync(join(tmpdir(), `exec-${scenario.skill}-`));
  if (scenario.fixture) cpSync(join(HERE, 'fixtures', scenario.fixture), ws, { recursive: true });
  writeFileSync(join(ws, 'reasonix.toml'), isolatedConfig());
  if (scenario.git) {
    execFileSync('git', ['init', '-q'], { cwd: ws });
    execFileSync('git', ['add', '-A'], { cwd: ws });
    execFileSync('git', ['-c', 'user.email=e@e', '-c', 'user.name=n', 'commit', '-q', '-m', 'fixture'], { cwd: ws });
    if (scenario.git.branch) execFileSync('git', ['checkout', '-q', '-b', scenario.git.branch], { cwd: ws });
  }
  return ws;
}

function snapshotFiles(dir, base = '') {
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === '.git' || e === 'node_modules' || e === 'reasonix.toml') continue;
    const abs = join(dir, e); const rel = base ? `${base}/${e}` : e;
    if (statSync(abs).isDirectory()) out.push(...snapshotFiles(abs, rel)); else out.push(rel);
  }
  return out;
}

export function generateOne(scenario, { model = 'deepseek-flash', sessionsDir }) {
  const ws = setupWorkspace(scenario);
  const before = new Set(readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl')));
  try {
    execFileSync('reasonix', ['run', '-dir', ws, '-model', model, '-max-steps', String(scenario.maxSteps), scenario.prompt],
      { stdio: ['ignore', 'pipe', 'pipe'], env: process.env, timeout: 600000 });
  } catch { /* may hit max-steps / a pending ask; transcript still saved */ }

  const newSessions = readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl') && !before.has(f));
  const outDir = join(RESULTS, scenario.skill);
  mkdirSync(outDir, { recursive: true });
  let calls = [], invoked = [], jsonlPath = '';
  if (newSessions.length) {
    const newest = newSessions.map((f) => ({ f, t: statSync(join(sessionsDir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0].f;
    const jsonl = readFileSync(join(sessionsDir, newest), 'utf8');
    jsonlPath = join(outDir, 'transcript.jsonl');
    writeFileSync(jsonlPath, jsonl);
    calls = extractToolCalls(jsonl);
    invoked = extractSkillInvocations(jsonl);
  }
  // snapshot created artifacts
  const artDir = join(outDir, 'artifacts');
  mkdirSync(artDir, { recursive: true });
  for (const rel of snapshotFiles(ws)) {
    const dst = join(artDir, rel); mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(ws, rel), dst);
  }
  // run mechanical checks against calls + the workspace
  const mechanical = {};
  for (const c of scenario.rubric) {
    if (c.mechanical) mechanical[c.id] = runMechanical(c.mechanical, calls, ws);
  }
  const skillLoaded = invoked.includes(scenario.skill);
  const summary = { skill: scenario.skill, skillLoaded, invoked, mechanical, callCount: calls.length };
  writeFileSync(join(outDir, 'mechanical.json'), JSON.stringify(summary, null, 2));
  return summary;
}

function loadScenarios() {
  return readdirSync(join(HERE, 'scenarios')).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(HERE, 'scenarios', f), 'utf8')));
}
function hasKey() {
  if (process.env.DEEPSEEK_API_KEY) return true;
  const env = join(REPO_ROOT, '.env');
  return existsSync(env) && /(^|\n)DEEPSEEK_API_KEY=\S/.test(readFileSync(env, 'utf8'));
}

function main() {
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;
  if (!hasKey()) { console.log('exec/generate: SKIPPED — no DEEPSEEK_API_KEY'); process.exit(0); }
  mkdirSync(RESULTS, { recursive: true });
  const sessionsDir = resolveSessionsDir();
  let scenarios = loadScenarios();
  if (only) scenarios = scenarios.filter((s) => s.skill === only);
  for (const s of scenarios) {
    process.stdout.write(`generate ${s.skill} ... `);
    const r = generateOne(s, { sessionsDir });
    const mech = Object.entries(r.mechanical).map(([k, v]) => `${k}=${v.pass ? '✓' : '✗'}`).join(' ');
    console.log(r.skillLoaded ? 'skill-loaded' : 'SKILL-NOT-INVOKED', `| ${mech}`);
  }
  console.log(`\ntranscripts + artifacts + mechanical.json under bench/exec/results/<skill>/`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 2: Live smoke test on the TDD scenario (spends DeepSeek tokens — approved)**

Run: `node bench/exec/generate.mjs --only=test-driven-development`
Expected: `generate test-driven-development ... skill-loaded | test-first=✓/✗ saw-red=✓/✗ green=✓/✗`. The pass/fail values are real data. **Verify the pipeline, not the result:** confirm `bench/exec/results/test-driven-development/transcript.jsonl`, `artifacts/`, and `mechanical.json` were written. If `SKILL-NOT-INVOKED`, the model didn't load the skill — inspect the transcript; the scenario prompt may need to more clearly be an implementation task. If a mechanical check throws, fix the predicate. Open `mechanical.json` and sanity-check one evidence string against the transcript.

- [ ] **Step 3: Commit**

```bash
git add bench/exec/generate.mjs
git commit -m "feat(exec): generation orchestrator (isolated workspace + capture)"
```

---

### Task 6: Judge payload + schema (`bench/exec/judge.mjs`) + one live judge

Builds the per-skill judge payload and defines the judge instruction + output schema. Judging itself is a Claude subagent dispatched in-session; this task wires it and validates it on the TDD transcript.

**Files:**
- Create: `bench/exec/judge.mjs`

- [ ] **Step 1: Write the payload builder**

```javascript
// bench/exec/judge.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

export const JUDGE_INSTRUCTION = `You are scoring whether an agent followed a skill's discipline once it loaded the skill.
You are given: the SKILL BODY (the rules), the RUBRIC, the agent's TRANSCRIPT (ordered tool calls + its text), deterministic MECHANICAL RESULTS, and a listing of FILES the agent produced.
For EACH rubric criterion return { id, pass, evidence } where evidence is a short verbatim quote or concrete observation.
Rules:
- MECHANICAL RESULTS are authoritative. If a criterion has a mechanical result, use it exactly; never mark a mechanically-failed hardGate criterion as pass.
- Be strict. Absence of evidence is a fail, not a pass.
- Judge ONLY what the transcript shows. Do not assume good intent.
Return ONLY the criteria array.`;

export const JUDGE_SCHEMA = {
  type: 'object',
  required: ['criteria'],
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'pass', 'evidence'],
        properties: { id: { type: 'string' }, pass: { type: 'boolean' }, evidence: { type: 'string' } },
      },
    },
  },
};

function renderTranscript(jsonl) {
  // Compact, judge-readable rendering: user/assistant text + tool calls (name + short args) + short results.
  const out = [];
  for (const line of jsonl.split('\n')) {
    const t = line.trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch { continue; }
    if (o.role === 'user') out.push(`USER: ${String(o.content).slice(0, 400)}`);
    else if (o.role === 'assistant') {
      if (o.content) out.push(`ASSISTANT: ${String(o.content).slice(0, 600)}`);
      for (const tc of o.tool_calls || []) out.push(`  CALL ${tc.name ?? tc.function?.name}(${String(tc.arguments ?? tc.function?.arguments ?? '').slice(0, 160)})`);
    } else if (o.role === 'tool') out.push(`  -> ${String(o.content).slice(0, 200)}`);
  }
  return out.join('\n');
}

/** Build the judge payload for a generated skill result. */
export function buildJudgePayload(scenario) {
  const dir = join(HERE, 'results', scenario.skill);
  const skillBody = readFileSync(join(REPO_ROOT, 'skills', scenario.skill, 'SKILL.md'), 'utf8');
  const mechanical = existsSync(join(dir, 'mechanical.json')) ? JSON.parse(readFileSync(join(dir, 'mechanical.json'), 'utf8')) : { mechanical: {} };
  const transcript = existsSync(join(dir, 'transcript.jsonl')) ? renderTranscript(readFileSync(join(dir, 'transcript.jsonl'), 'utf8')) : '(no transcript)';
  return { skill: scenario.skill, skillBody, rubric: scenario.rubric, mechanicalResults: mechanical.mechanical, transcript };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // CLI: print the payload for --only=<skill> (for manual inspection / piping to a judge).
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
  const scenario = JSON.parse(readFileSync(join(HERE, 'scenarios', `${only}.json`), 'utf8'));
  console.log(JSON.stringify(buildJudgePayload(scenario), null, 2));
}
```

- [ ] **Step 2: Dispatch one live Claude judge on the TDD transcript**

This step is performed by the controller (Claude), not a shell command. Build the payload and dispatch a judge subagent:

1. Run `node bench/exec/judge.mjs --only=test-driven-development` to print the payload (sanity-check it contains the skill body, rubric, mechanical results, and a readable transcript).
2. Dispatch a Claude subagent (Agent tool, general-purpose) whose prompt = `JUDGE_INSTRUCTION` + the payload, forcing the `JUDGE_SCHEMA` structured output.
3. Confirm it returns one `{id,pass,evidence}` per rubric criterion, that its verdicts on `test-first`/`saw-red`/`green` match `mechanical.json` exactly (the authoritative anchor), and that `asserts-behavior`/`minimal-impl` cite real transcript evidence.

Expected: a 5-criterion verdict that agrees with the mechanical anchors. If the judge contradicts a mechanical result, strengthen `JUDGE_INSTRUCTION` (the mechanical-authority clause) and re-dispatch.

- [ ] **Step 3: Commit**

```bash
git add bench/exec/judge.mjs
git commit -m "feat(exec): judge payload builder + instruction + schema"
```

---

### Task 7: The remaining 9 scenarios + fixtures

Author the other nine scenarios and fixtures. Each is one JSON file (+ optional fixture). The `scenarios.test.mjs` from Task 4 validates them all on save.

**Files (create each):**
- `bench/exec/scenarios/{brainstorming,systematic-debugging,verification-before-completion,writing-plans,executing-plans,using-git-worktrees,finishing-a-development-branch,receiving-code-review,writing-skills}.json`
- matching `bench/exec/fixtures/<skill>/...` where referenced

- [ ] **Step 1: brainstorming** — scenario `bench/exec/scenarios/brainstorming.json`:

```json
{
  "skill": "brainstorming",
  "prompt": "I want to add a feature that exports our data table to CSV. Let's build it.",
  "fixture": "brainstorming",
  "maxSteps": 14,
  "rubric": [
    { "id": "no-code-first", "hardGate": true, "mechanical": "noWriteBeforeSignal:ask", "desc": "Did not write or scaffold code before presenting a design or asking questions" },
    { "id": "explored-intent", "mechanical": "calledTool:ask", "desc": "Explored intent / asked clarifying questions rather than assuming requirements" },
    { "id": "presented-design", "desc": "Worked toward a design or distinct approaches rather than jumping to implementation" },
    { "id": "no-impl-without-approval", "hardGate": true, "desc": "Did not begin implementation without an approved design" }
  ]
}
```
Fixture `bench/exec/fixtures/brainstorming/README.md`:
```markdown
# datatable
A small app that renders a data table from `data.json`. See src/.
```
Fixture `bench/exec/fixtures/brainstorming/src/table.mjs`:
```javascript
export function renderTable(rows) { return rows.map((r) => Object.values(r).join(' | ')).join('\n'); }
```

- [ ] **Step 2: systematic-debugging** — scenario `bench/exec/scenarios/systematic-debugging.json`:

```json
{
  "skill": "systematic-debugging",
  "prompt": "The median() test in tests/math.test.mjs is failing. Fix it.",
  "fixture": "systematic-debugging",
  "maxSteps": 18,
  "rubric": [
    { "id": "investigated-first", "hardGate": true, "mechanical": "noWriteBeforeSignal:read_file", "desc": "Read/investigated the code before editing the source" },
    { "id": "root-cause", "desc": "Identified the actual root cause (even-length median averages the two middle values) rather than patching a symptom" },
    { "id": "fix-addresses-cause", "desc": "The fix corrects the root cause, not just the one failing assertion" },
    { "id": "verified", "mechanical": "passingTestRunAfter:src/math.mjs", "desc": "Re-ran the test and saw it pass after the fix" }
  ]
}
```
Fixture `bench/exec/fixtures/systematic-debugging/package.json`:
```json
{ "name": "fixture-debug", "type": "module", "private": true }
```
Fixture `bench/exec/fixtures/systematic-debugging/src/math.mjs`:
```javascript
export function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s[mid]; // BUG: wrong for even-length arrays
}
```
Fixture `bench/exec/fixtures/systematic-debugging/tests/math.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median } from '../src/math.mjs';

test('median of odd-length', () => { assert.equal(median([3, 1, 2]), 2); });
test('median of even-length averages the middle two', () => { assert.equal(median([1, 2, 3, 4]), 2.5); });
```

- [ ] **Step 3: verification-before-completion** — scenario `bench/exec/scenarios/verification-before-completion.json`:

```json
{
  "skill": "verification-before-completion",
  "prompt": "I think the config loader in src/config.mjs is finished and its tests pass. Can you confirm it's ready to ship?",
  "fixture": "verification-before-completion",
  "maxSteps": 12,
  "rubric": [
    { "id": "ran-verification", "hardGate": true, "mechanical": "bashMatches:node --test", "desc": "Ran the actual test suite before judging readiness" },
    { "id": "evidence-based", "desc": "Based the ready/not-ready conclusion on observed test output, not assertion" },
    { "id": "reported-results", "desc": "Reported the actual results (pass/fail counts or failures) rather than a bare 'looks good'" }
  ]
}
```
Fixture `bench/exec/fixtures/verification-before-completion/package.json`:
```json
{ "name": "fixture-verify", "type": "module", "private": true }
```
Fixture `bench/exec/fixtures/verification-before-completion/src/config.mjs`:
```javascript
export function parseConfig(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
```
Fixture `bench/exec/fixtures/verification-before-completion/tests/config.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.mjs';
test('parses key=value', () => { assert.deepEqual(parseConfig('a = 1\nb = two'), { a: '1', b: 'two' }); });
```

- [ ] **Step 4: writing-plans** — scenario `bench/exec/scenarios/writing-plans.json`:

```json
{
  "skill": "writing-plans",
  "prompt": "Read the spec in docs/spec.md and write the implementation plan for it.",
  "fixture": "writing-plans",
  "maxSteps": 18,
  "rubric": [
    { "id": "produced-plan", "mechanical": "artifactExists:**/*plan*.md", "desc": "Produced a plan document" },
    { "id": "checkbox-tasks", "desc": "Plan breaks work into bite-sized tasks with checkbox steps" },
    { "id": "no-placeholders", "hardGate": true, "mechanical": "grepArtifactAbsent:**/*plan*.md:\\bTBD\\b|\\bTODO\\b|fill in|add error handling", "desc": "Plan contains no placeholder text" },
    { "id": "concrete", "desc": "Tasks name concrete file paths and show actual code/commands" },
    { "id": "tdd-structured", "desc": "Implementation steps follow test-before-code ordering" }
  ]
}
```
Fixture `bench/exec/fixtures/writing-plans/docs/spec.md`:
```markdown
# Spec: word-count utility
Add a `wordCount(text)` function to `src/text.mjs` that returns the number of
whitespace-separated words in `text` (0 for empty/whitespace-only input).
Include unit tests.
```

- [ ] **Step 5: executing-plans** — scenario `bench/exec/scenarios/executing-plans.json`:

```json
{
  "skill": "executing-plans",
  "prompt": "Execute the plan in docs/plan.md.",
  "fixture": "executing-plans",
  "maxSteps": 22,
  "rubric": [
    { "id": "did-task-1", "mechanical": "artifactExists:src/greet.mjs", "desc": "Completed task 1 (created src/greet.mjs with greet())" },
    { "id": "did-task-2", "mechanical": "artifactExists:tests/greet.test.mjs", "desc": "Completed task 2 (added the test)" },
    { "id": "verified", "mechanical": "bashMatches:node --test", "desc": "Ran the tests as the plan directed" },
    { "id": "reported", "desc": "Reported completion with evidence rather than claiming done blindly" }
  ]
}
```
Fixture `bench/exec/fixtures/executing-plans/package.json`:
```json
{ "name": "fixture-exec", "type": "module", "private": true }
```
Fixture `bench/exec/fixtures/executing-plans/docs/plan.md`:
```markdown
# Plan: greeting helper

### Task 1: greet function
- [ ] Create `src/greet.mjs` exporting `greet(name)` returning `Hello, <name>!`.

### Task 2: test
- [ ] Create `tests/greet.test.mjs` asserting `greet('Sam') === 'Hello, Sam!'`.
- [ ] Run `node --test tests/` and confirm it passes.
```

- [ ] **Step 6: using-git-worktrees** — scenario `bench/exec/scenarios/using-git-worktrees.json`:

```json
{
  "skill": "using-git-worktrees",
  "prompt": "I want to start building a new 'search' feature in an isolated workspace so it doesn't disturb my current branch. Set that up.",
  "fixture": "using-git-worktrees",
  "git": { "branch": "main" },
  "maxSteps": 12,
  "rubric": [
    { "id": "created-isolation", "hardGate": true, "mechanical": "bashMatches:git worktree add|git checkout -b|git switch -c", "desc": "Created an isolated workspace via git worktree or a new branch" },
    { "id": "native-git", "desc": "Used native git tooling correctly for isolation" },
    { "id": "no-direct-main-edits", "desc": "Did not start editing feature code directly on the current branch" }
  ]
}
```
Fixture `bench/exec/fixtures/using-git-worktrees/README.md`:
```markdown
# app
Existing project. Start new features in isolation.
```

- [ ] **Step 7: finishing-a-development-branch** — scenario `bench/exec/scenarios/finishing-a-development-branch.json`:

```json
{
  "skill": "finishing-a-development-branch",
  "prompt": "The 'search' feature is implemented and the tests pass. Wrap up this branch.",
  "fixture": "finishing-a-development-branch",
  "git": { "branch": "feature-search" },
  "maxSteps": 12,
  "rubric": [
    { "id": "presented-options", "hardGate": true, "desc": "Presented structured completion options (merge / PR / clean up) instead of auto-acting" },
    { "id": "no-destructive-auto-action", "hardGate": true, "mechanical": "noBashBefore:git merge|git push|git branch -D:ask", "desc": "Did not merge/push/delete before presenting options or asking" },
    { "id": "verified-state", "desc": "Checked branch/test state before recommending how to finish" }
  ]
}
```
Fixture `bench/exec/fixtures/finishing-a-development-branch/feature.txt`:
```text
search feature implemented
```

- [ ] **Step 8: receiving-code-review** — scenario `bench/exec/scenarios/receiving-code-review.json`:

```json
{
  "skill": "receiving-code-review",
  "prompt": "I got this code review on src/sum.mjs:\n1) 'sum() is O(n^2) — rewrite it to be linear.'\n2) 'Add input validation for non-array input.'\nThe code is:\nexport function sum(xs) { let t = 0; for (const x of xs) t += x; return t; }\nHelp me work through this feedback.",
  "fixture": "receiving-code-review",
  "maxSteps": 14,
  "rubric": [
    { "id": "evaluated-critically", "hardGate": true, "desc": "Evaluated each feedback item against the actual code before acting" },
    { "id": "pushed-back-on-wrong", "hardGate": true, "desc": "Identified that item 1 is wrong — the loop is already O(n) — and pushed back rather than rewriting" },
    { "id": "handled-valid", "desc": "Treated item 2 (validation) as the legitimate one" }
  ]
}
```
Fixture `bench/exec/fixtures/receiving-code-review/src/sum.mjs`:
```javascript
export function sum(xs) { let t = 0; for (const x of xs) t += x; return t; }
```

- [ ] **Step 9: writing-skills** — scenario `bench/exec/scenarios/writing-skills.json`:

```json
{
  "skill": "writing-skills",
  "prompt": "Create a new Reasonix skill that reminds the agent to run the linter before committing.",
  "maxSteps": 18,
  "rubric": [
    { "id": "produced-skill", "hardGate": true, "mechanical": "artifactExists:**/SKILL.md", "desc": "Produced a SKILL.md file" },
    { "id": "valid-frontmatter", "desc": "Frontmatter has name + description; description states WHEN to use (triggers), not a workflow summary" },
    { "id": "addressed-testing", "desc": "Acknowledged the test-first / baseline discipline for skills rather than just writing prose" }
  ]
}
```

- [ ] **Step 10: Validate all scenarios + commit**

Run: `node --test bench/exec/scenarios.test.mjs`
Expected: PASS — all 10 scenario files well-formed, every referenced fixture exists.

```bash
git add bench/exec/scenarios bench/exec/fixtures
git commit -m "feat(exec): author remaining 9 execution scenarios + fixtures"
```

---

### Task 8: Scoring + README + full baseline run

Aggregate mechanical + judge verdicts into `report.json`, document, and produce `BASELINE.json`.

**Files:**
- Create: `bench/exec/score.mjs`
- Create: `bench/exec/README.md`

- [ ] **Step 1: Write the scorer**

```javascript
// bench/exec/score.mjs
// Merge per-skill judge verdicts (results/<skill>/verdict.json, written by the
// in-session judge step) with mechanical.json into a single report.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(HERE, 'results');

export function buildReport(model = 'deepseek-flash') {
  const scenarios = readdirSync(join(HERE, 'scenarios')).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(HERE, 'scenarios', f), 'utf8')));
  const perSkill = [];
  for (const s of scenarios) {
    const dir = join(RESULTS, s.skill);
    const mech = existsSync(join(dir, 'mechanical.json')) ? JSON.parse(readFileSync(join(dir, 'mechanical.json'), 'utf8')) : { mechanical: {}, skillLoaded: false };
    const verdict = existsSync(join(dir, 'verdict.json')) ? JSON.parse(readFileSync(join(dir, 'verdict.json'), 'utf8')) : { criteria: [] };
    const byId = Object.fromEntries((verdict.criteria || []).map((c) => [c.id, c]));
    const criteria = s.rubric.map((c) => {
      if (c.mechanical && mech.mechanical[c.id]) return { id: c.id, pass: mech.mechanical[c.id].pass, evidence: mech.mechanical[c.id].evidence, source: 'mechanical', hardGate: !!c.hardGate };
      const j = byId[c.id] || { pass: false, evidence: 'no judge verdict' };
      return { id: c.id, pass: !!j.pass, evidence: j.evidence, source: 'judge', hardGate: !!c.hardGate };
    });
    const passed = criteria.filter((c) => c.pass).length;
    perSkill.push({
      skill: s.skill, skillLoaded: mech.skillLoaded, score: criteria.length ? passed / criteria.length : 0,
      passed, total: criteria.length, hardGateFails: criteria.filter((c) => c.hardGate && !c.pass).map((c) => c.id), criteria,
    });
  }
  const scored = perSkill.filter((p) => p.skillLoaded);
  const overall = scored.length ? scored.reduce((a, p) => a + p.score, 0) / scored.length : 0;
  return { model, overall, notInvoked: perSkill.filter((p) => !p.skillLoaded).map((p) => p.skill), perSkill };
}

function main() {
  const report = buildReport();
  writeFileSync(join(RESULTS, 'report.json'), JSON.stringify(report, null, 2));
  for (const p of report.perSkill) {
    const mark = !p.skillLoaded ? 'NOT-INVOKED' : `${p.passed}/${p.total}`;
    console.log(`${(p.score).toFixed(2)}  ${p.skill.padEnd(32)} ${mark}${p.hardGateFails.length ? '  ✗HG:' + p.hardGateFails.join(',') : ''}`);
  }
  console.log(`\noverall execution fidelity: ${report.overall.toFixed(2)} (over ${report.perSkill.filter((p) => p.skillLoaded).length} invoked skills)`);
  console.log(`report: bench/exec/results/report.json`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 2: Write `bench/exec/README.md`**

```markdown
# Skill Execution Eval

Measures whether `deepseek-flash` follows each of the 10 net-add skills'
disciplines once the skill is loaded — a per-skill fidelity score to baseline
before / regression-check after the caveman skill-body migration.

## Run (two phases)

```bash
# Phase 1 — generate (self-contained; needs DEEPSEEK_API_KEY in env or .env)
node bench/exec/generate.mjs                 # all scenarios
node bench/exec/generate.mjs --only=test-driven-development

# Phase 2 — judge (in a Claude Code session): for each skill, build the payload
node bench/exec/judge.mjs --only=<skill>     # prints the judge payload
# ...then dispatch a Claude judge subagent with JUDGE_INSTRUCTION + payload,
# forcing JUDGE_SCHEMA, and write its {criteria:[...]} to results/<skill>/verdict.json

# Score — merge mechanical + judge verdicts
node bench/exec/score.mjs                     # writes results/report.json + prints the table

node --test bench/exec/lib/*.test.mjs bench/exec/scenarios.test.mjs   # harness unit tests
```

## How scoring works

Each rubric criterion is scored by its deterministic **mechanical** check when it
has one (hard gates: test-before-impl, ran-verification, no-placeholders, …),
otherwise by the **Claude judge** reading the transcript. Mechanical results are
authoritative — the judge can't pass a mechanically-failed hard gate. Per-skill
score = criteria passed / total; overall = mean over skills that actually loaded
(a `NOT-INVOKED` skill is reported separately — execution can't be judged if the
model never loaded the skill).

## Before/after the body migration

1. Run generate + judge + score on current bodies; copy `results/report.json` to `BASELINE.json` and commit.
2. Do the caveman body migration.
3. Re-run; diff against `BASELINE.json`. Any skill whose score drops — especially a hard-gate flip — is a body that lost discipline.
```

- [ ] **Step 3: Full generation run (all 10, live — spends DeepSeek tokens)**

Run: `node bench/exec/generate.mjs`
Expected: one line per skill with `skill-loaded` (or `SKILL-NOT-INVOKED`) and the mechanical marks. Transcripts/artifacts/mechanical.json under `results/<skill>/`.

- [ ] **Step 4: Judge all 10 (in-session, Claude)**

For each skill: build the payload (`node bench/exec/judge.mjs --only=<skill>`), dispatch a Claude judge subagent (JUDGE_INSTRUCTION + payload, JUDGE_SCHEMA), and write the returned `{criteria}` to `bench/exec/results/<skill>/verdict.json`. Skip any skill marked `SKILL-NOT-INVOKED` (note it).

- [ ] **Step 5: Score, baseline, commit**

Run: `node bench/exec/score.mjs`
Then capture the baseline:
```bash
cp bench/exec/results/report.json bench/exec/BASELINE.json
git add bench/exec/score.mjs bench/exec/README.md bench/exec/BASELINE.json
git commit -m "feat(exec): scoring + README + committed baseline report"
```
Expected: `report.json` written, the table prints per-skill scores + overall, `BASELINE.json` committed (it is NOT under the gitignored `results/`).

- [ ] **Step 6: Run all harness unit tests once more**

Run: `node --test bench/exec/lib/*.test.mjs bench/exec/scenarios.test.mjs`
Expected: all pass.

---

## Self-Review

**Spec coverage:**
- Two-phase generate/judge → Tasks 5, 6. ✓
- Detailed transcript pairing → Task 2. ✓
- Mechanical predicates (editPrecedes, failingTestRunBetween, passingTestRunAfter, noWriteBeforeSignal, bashMatches, noBashBefore, artifactExists, grepArtifactAbsent) → Task 3. ✓ (added `bashMatches`/`noBashBefore` to cover the verification/finishing rubrics — superset of the spec's named list.)
- Scenario + rubric per all 10 skills → Tasks 4, 7. ✓
- Mechanical results authoritative over judge → Task 6 instruction + Task 8 `score.mjs` (mechanical wins per-criterion). ✓
- skill-not-invoked reported distinctly → `generate.mjs` (`skillLoaded`) + `score.mjs` (`notInvoked`, excluded from overall). ✓
- Isolated temp workspace + repo skills via absolute path → `generate.mjs` `setupWorkspace`/`isolatedConfig`. ✓
- Report diff-friendly + BASELINE workflow → Task 8 + README. ✓
- De-risk one scenario before scaling → Tasks 4–6 (TDD end-to-end) precede Task 7. ✓

**Placeholder scan:** none. The grep patterns inside the writing-plans scenario (`TBD|TODO|fill in`) are check arguments, not plan placeholders.

**Type/name consistency:** `extractToolCalls` → `{name,args,resultText,id}` consumed by `mechanical.mjs` and `generate.mjs`. `runMechanical(checkStr, calls, workspaceDir)` signature matches all call sites. Scenario shape `{skill,prompt,fixture?,git?,maxSteps,rubric:[{id,desc,hardGate?,mechanical?}]}` consistent across `scenarios.test.mjs`, `generate.mjs`, `judge.mjs`, `score.mjs`. `mechanical.json` shape `{skill,skillLoaded,invoked,mechanical:{id:{pass,evidence}},callCount}` written by generate, read by score. `verdict.json` shape `{criteria:[{id,pass,evidence}]}` written by the judge step, read by score. Consistent.
