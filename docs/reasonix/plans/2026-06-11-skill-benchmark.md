# Skill Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-stage benchmark (`bench/`) that proves this repo's skills load correctly into Reasonix (structural) and actually get invoked by realistic prompts (behavioral).

**Architecture:** Plain Node ESM, zero external dependencies (`node:fs`, `node:child_process`, `node:test`, `node:assert`). Stage 1 statically validates every `SKILL.md`. Stage 2 runs each corpus prompt through `reasonix run` against an isolated skill set, then reads which skill fired straight from the saved session JSONL. Pure logic (frontmatter parse, transcript parse, scoring) is unit-tested; the live spawn is smoke-tested.

**Tech Stack:** Node 22 (built-in test runner), `reasonix npm-v1.4.0-rc.1`, DeepSeek (`deepseek-flash`).

**Spec:** `docs/reasonix/specs/2026-06-11-skill-benchmark-design.md`

**Note on git:** This working tree is not yet a git repo. Task 1 runs `git init` so the per-task commit cadence works. If you opt out, skip every "Commit" step.

**Note on tool names:** Reasonix lowercases frontmatter keys, so `runAs` is read as `runas` and `allowed-tools` stays `allowed-tools`. All code below assumes lowercased keys.

---

### Task 1: Scaffold `bench/`, isolation config, git

**Files:**
- Create: `bench/reasonix.toml`
- Create: `bench/.gitignore`
- Create: `bench/lib/` (directory, via the first file written into it)
- Create: `.gitignore` (repo root)

- [ ] **Step 1: Initialize git (optional, enables commit cadence)**

Run:
```bash
cd /Users/chrisarter/Documents/projects/superpowers-reasonix
git init
```
Expected: `Initialized empty Git repository...`. If you opt out, skip all Commit steps in later tasks.

- [ ] **Step 2: Create the isolation config `bench/reasonix.toml`**

This config is what makes the benchmark reproducible: it exposes ONLY this repo's `skills/` and hides the global `~/.reasonix/skills` convention root. `paths` is relative to the project root passed via `reasonix run -dir`, which the harness sets to the repo root — so `./skills` resolves correctly.

```toml
# Benchmark isolation config. The behavioral harness runs:
#   reasonix run -dir <repo-root> ...
# with this file copied to <repo-root>/reasonix.toml so config resolution
# (flag > ./reasonix.toml > user config) picks it up. It exposes only this
# repo's skills and hides the global convention root so results reflect
# exactly the skills under ./skills.

default_model = "deepseek-flash"

[skills]
paths = ["./skills"]
excluded_paths = ["~/.reasonix/skills", "~/.agents/skills", "~/.agent/skills", "~/.claude/skills"]
max_depth = 3

[permissions]
# Headless benchmark: never block on approval prompts.
mode = "allow"
```

- [ ] **Step 3: Create `bench/.gitignore`**

```gitignore
results/
*.metrics.json
```

- [ ] **Step 4: Create repo-root `.gitignore`**

```gitignore
.env
node_modules/
bench/results/
```

- [ ] **Step 5: Verify Node and structure**

Run:
```bash
node --version && ls -R bench
```
Expected: Node `v22.x`, and `bench` showing `reasonix.toml`, `.gitignore`. (`bench/lib` appears once Task 2 writes into it.)

- [ ] **Step 6: Commit**

```bash
git add .gitignore bench/.gitignore bench/reasonix.toml
git commit -m "chore(bench): scaffold benchmark dir and isolation config"
```

---

### Task 2: Frontmatter parser (`bench/lib/frontmatter.mjs`)

A minimal parser mirroring Reasonix's own (NOT a YAML lib): `key: value`, keys lowercased, one layer of quote-stripping, the YAML-list case, and the one-level section-flatten case. Unclosed fence → whole file is body.

**Files:**
- Create: `bench/lib/frontmatter.mjs`
- Test: `bench/lib/frontmatter.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// bench/lib/frontmatter.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from './frontmatter.mjs';

test('parses simple key/value and lowercases keys', () => {
  const { frontmatter, body } = parseFrontmatter(
    '---\nname: brainstorming\nrunAs: subagent\n---\nBody here\n'
  );
  assert.equal(frontmatter.name, 'brainstorming');
  assert.equal(frontmatter.runas, 'subagent'); // key lowercased
  assert.equal(body.trim(), 'Body here');
});

test('strips one layer of quotes', () => {
  const { frontmatter } = parseFrontmatter('---\ndescription: "hello world"\n---\n');
  assert.equal(frontmatter.description, 'hello world');
});

test('no frontmatter fence means empty frontmatter, all body', () => {
  const { frontmatter, body } = parseFrontmatter('# Just a heading\ntext');
  assert.deepEqual(frontmatter, {});
  assert.equal(body, '# Just a heading\ntext');
});

test('unclosed fence means whole file is body', () => {
  const input = '---\nname: x\nstill open';
  const { frontmatter, body } = parseFrontmatter(input);
  assert.deepEqual(frontmatter, {});
  assert.equal(body, input);
});

test('YAML list value joins comma-separated', () => {
  const { frontmatter } = parseFrontmatter(
    '---\nallowed-tools:\n  - read_file\n  - grep\n---\n'
  );
  assert.equal(frontmatter['allowed-tools'], 'read_file, grep');
});

test('one-level section flattens to top level', () => {
  const { frontmatter } = parseFrontmatter(
    '---\nmetadata:\n  type: project\n---\n'
  );
  assert.equal(frontmatter.type, 'project');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bench/lib/frontmatter.test.mjs`
Expected: FAIL — `Cannot find module './frontmatter.mjs'` / `parseFrontmatter is not a function`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// bench/lib/frontmatter.mjs

function stripQuotes(v) {
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Parse a SKILL.md's frontmatter the way Reasonix does (minimal, not YAML).
 * @param {string} text
 * @returns {{ frontmatter: Record<string,string>, body: string }}
 */
export function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: {}, body: text };
  }
  // find closing fence
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { close = i; break; }
  }
  if (close === -1) {
    return { frontmatter: {}, body: text }; // unclosed fence => whole file is body
  }

  const fm = {};
  const fmLines = lines.slice(1, close);
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const m = line.match(/^([A-Za-z0-9._-]+):(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    let value = m[2].trim();

    if (value === '') {
      // Look ahead: YAML list (- item) OR section (indented key: value)
      const collectedList = [];
      const collectedSection = {};
      let j = i + 1;
      let kind = null;
      while (j < fmLines.length) {
        const next = fmLines[j];
        const listMatch = next.match(/^\s+-\s+(.*)$/);
        const sectionMatch = next.match(/^\s+([A-Za-z0-9._-]+):\s*(.*)$/);
        if (listMatch) { kind = 'list'; collectedList.push(stripQuotes(listMatch[1].trim())); j++; continue; }
        if (sectionMatch) { kind = 'section'; collectedSection[sectionMatch[1].toLowerCase()] = stripQuotes(sectionMatch[2].trim()); j++; continue; }
        break;
      }
      if (kind === 'list') { fm[key] = collectedList.join(', '); i = j - 1; continue; }
      if (kind === 'section') { Object.assign(fm, collectedSection); i = j - 1; continue; }
      fm[key] = '';
      continue;
    }
    fm[key] = stripQuotes(value);
  }

  const body = lines.slice(close + 1).join('\n');
  return { frontmatter: fm, body };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bench/lib/frontmatter.test.mjs`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bench/lib/frontmatter.mjs bench/lib/frontmatter.test.mjs
git commit -m "feat(bench): minimal Reasonix-compatible frontmatter parser"
```

---

### Task 3: Skill loader + shared constants (`bench/lib/skills.mjs`)

Loads every `skills/*/SKILL.md`, resolves the effective name, classifies subagent vs inline, and renders the pinned-index line. Also exports the known tool registry and the intentionally-invisible worker set.

**Files:**
- Create: `bench/lib/skills.mjs`
- Test: `bench/lib/skills.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// bench/lib/skills.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSubagent, indexLine, NAME_RE, KNOWN_TOOLS } from './skills.mjs';

test('isSubagent detects runAs, context:fork, and agent', () => {
  assert.equal(isSubagent({ runas: 'subagent' }), true);
  assert.equal(isSubagent({ context: 'fork' }), true);
  assert.equal(isSubagent({ agent: 'anything' }), true);
  assert.equal(isSubagent({ description: 'x' }), false);
});

test('indexLine tags subagents and includes description', () => {
  assert.equal(indexLine('explore', { runas: 'subagent', description: 'read-only' }),
    '- explore [🧬 subagent] — read-only');
  assert.equal(indexLine('brainstorming', { description: 'turn idea into design' }),
    '- brainstorming — turn idea into design');
});

test('NAME_RE accepts valid names and rejects bad ones', () => {
  assert.ok(NAME_RE.test('test-driven-development'));
  assert.ok(!NAME_RE.test('-bad'));
  assert.ok(!NAME_RE.test('has space'));
});

test('KNOWN_TOOLS contains snake_case registry names', () => {
  for (const t of ['read_file', 'edit_file', 'bash', 'grep', 'glob', 'run_skill']) {
    assert.ok(KNOWN_TOOLS.has(t), `${t} should be known`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bench/lib/skills.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// bench/lib/skills.mjs
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

export const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

// Registry tool names valid in `allowed-tools` (snake_case, per the npm build).
export const KNOWN_TOOLS = new Set([
  'read_file', 'edit_file', 'multi_edit', 'write_file', 'bash', 'grep', 'glob',
  'ls', 'web_fetch', 'todo_write', 'ask', 'run_skill', 'read_skill',
  'explore', 'review', 'research', 'security_review',
]);

// Skills that are intentionally description-less (invisible workers per README).
export const EXPECT_NO_DESCRIPTION = new Set(['task-implementer', 'spec-reviewer', 'code-reviewer']);

export function isSubagent(fm) {
  return /subagent/i.test(fm.runas || '')
    || /fork/i.test(fm.context || '')
    || (fm.agent || '').trim() !== '';
}

export function indexLine(name, fm) {
  const tag = isSubagent(fm) ? ' [🧬 subagent]' : '';
  return `- ${name}${tag} — ${fm.description || ''}`;
}

/**
 * Load all directory-layout skills under skillsDir.
 * @returns {Array<{name:string, stem:string, dir:string, frontmatter:object, body:string, refs:string[]}>}
 */
export function loadSkills(skillsDir) {
  const out = [];
  for (const entry of readdirSync(skillsDir)) {
    const dir = join(skillsDir, entry);
    if (!statSync(dir).isDirectory()) continue;
    const skillPath = join(dir, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    const { frontmatter, body } = parseFrontmatter(readFileSync(skillPath, 'utf8'));
    const stem = entry;
    const fmName = (frontmatter.name || '').trim();
    const name = fmName && NAME_RE.test(fmName) ? fmName : stem;
    const refsDir = join(dir, 'references');
    const refs = existsSync(refsDir)
      ? readdirSync(refsDir).filter((f) => f.endsWith('.md'))
      : [];
    out.push({ name, stem, dir, frontmatter, body, refs });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bench/lib/skills.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Sanity-check the loader against the real skills**

Run:
```bash
node -e "import('./bench/lib/skills.mjs').then(m=>{const s=m.loadSkills('./skills');console.log(s.length,'skills:',s.map(x=>x.name).join(', '))})"
```
Expected: `17 skills:` followed by all 17 names including `task-implementer`, `spec-reviewer`, `code-reviewer`.

- [ ] **Step 6: Commit**

```bash
git add bench/lib/skills.mjs bench/lib/skills.test.mjs
git commit -m "feat(bench): skill loader, name/tool constants, index-line render"
```

---

### Task 4: Structural validator (`bench/structural.mjs`)

Applies the discoverability contract, index-line limits, and tool-name checks. Exports `checkSkills()` and runs as a CLI that exits non-zero on any FAIL.

**Files:**
- Create: `bench/structural.mjs`
- Test: `bench/structural.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// bench/structural.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSkill } from './structural.mjs';

const ok = { name: 'brainstorming', stem: 'brainstorming',
  frontmatter: { name: 'brainstorming', description: 'turn idea into design' }, refs: [] };

test('a well-formed discoverable skill passes', () => {
  const r = evaluateSkill(ok);
  assert.equal(r.level, 'PASS', JSON.stringify(r.issues));
});

test('missing description on a discoverable skill is a FAIL', () => {
  const r = evaluateSkill({ ...ok, frontmatter: { name: 'brainstorming' } });
  assert.equal(r.level, 'FAIL');
  assert.ok(r.issues.some((i) => /description/i.test(i)));
});

test('worker skill MUST NOT have a description', () => {
  const worker = { name: 'spec-reviewer', stem: 'spec-reviewer',
    frontmatter: { name: 'spec-reviewer', runas: 'subagent' }, refs: [] };
  assert.equal(evaluateSkill(worker).level, 'PASS');
  const withDesc = { ...worker, frontmatter: { ...worker.frontmatter, description: 'oops' } };
  const r = evaluateSkill(withDesc);
  assert.equal(r.level, 'FAIL');
  assert.ok(r.issues.some((i) => /invisible|description/i.test(i)));
});

test('index line over 130 chars is a FAIL', () => {
  const r = evaluateSkill({ ...ok, frontmatter: { name: 'brainstorming', description: 'x'.repeat(140) } });
  assert.equal(r.level, 'FAIL');
  assert.ok(r.issues.some((i) => /130/.test(i)));
});

test('invalid name is a FAIL', () => {
  const r = evaluateSkill({ ...ok, name: 'bad name', stem: 'bad name' });
  assert.equal(r.level, 'FAIL');
  assert.ok(r.issues.some((i) => /name/i.test(i)));
});

test('unknown allowed-tools name is a FAIL', () => {
  const sub = { name: 'x', stem: 'x',
    frontmatter: { description: 'd', runas: 'subagent', 'allowed-tools': 'read_file, Grep' }, refs: [] };
  const r = evaluateSkill(sub);
  assert.equal(r.level, 'FAIL');
  assert.ok(r.issues.some((i) => /Grep/.test(i)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bench/structural.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// bench/structural.mjs
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadSkills, isSubagent, indexLine, NAME_RE, KNOWN_TOOLS, EXPECT_NO_DESCRIPTION } from './lib/skills.mjs';

const INDEX_LINE_MAX = 130;
const INDEX_TOTAL_MAX = 4000;

/**
 * @returns {{ name:string, level:'PASS'|'WARN'|'FAIL', issues:string[] }}
 */
export function evaluateSkill(skill) {
  const issues = [];
  const warns = [];
  const fm = skill.frontmatter;

  if (!NAME_RE.test(skill.name)) {
    issues.push(`invalid name "${skill.name}" (must match ${NAME_RE})`);
  }

  const hasDesc = (fm.description || '').trim() !== '';
  if (EXPECT_NO_DESCRIPTION.has(skill.name)) {
    if (hasDesc) issues.push(`worker skill "${skill.name}" should be invisible (no description) but has one`);
  } else if (!hasDesc) {
    issues.push(`discoverable skill "${skill.name}" is missing a description (won't enter the index)`);
  }

  if (hasDesc) {
    const line = indexLine(skill.name, fm);
    if ([...line].length > INDEX_LINE_MAX) {
      issues.push(`index line is ${[...line].length} chars (>${INDEX_LINE_MAX}): ${line}`);
    }
  }

  if (isSubagent(fm) && fm['allowed-tools']) {
    const tools = fm['allowed-tools'].split(',').map((t) => t.trim()).filter(Boolean);
    for (const t of tools) {
      if (!KNOWN_TOOLS.has(t)) issues.push(`unknown allowed-tools entry "${t}" (will be silently dropped)`);
    }
  }

  const level = issues.length ? 'FAIL' : (warns.length ? 'WARN' : 'PASS');
  return { name: skill.name, level, issues: [...issues, ...warns] };
}

export function checkSkills(skillsDir) {
  const skills = loadSkills(skillsDir);
  const results = skills.map(evaluateSkill);

  // Empty reference files are likely mistakes (Reasonix skips them) -> WARN.
  for (const s of skills) {
    const r = results.find((x) => x.name === s.name);
    for (const ref of s.refs) {
      if (statSync(join(s.dir, 'references', ref)).size === 0) {
        r.issues.push(`empty reference file references/${ref} (Reasonix will skip it)`);
        if (r.level === 'PASS') r.level = 'WARN';
      }
    }
  }

  // Total index budget.
  const totalIndex = skills
    .filter((s) => (s.frontmatter.description || '').trim() !== '')
    .map((s) => [...indexLine(s.name, s.frontmatter)].length + 1)
    .reduce((a, b) => a + b, 0);
  const indexIssue = totalIndex > INDEX_TOTAL_MAX
    ? [`pinned index total ${totalIndex} chars exceeds ${INDEX_TOTAL_MAX}`]
    : [];

  const ok = results.every((r) => r.level !== 'FAIL') && indexIssue.length === 0;
  return { results, ok, totalIndex, indexIssue };
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const skillsDir = join(here, '..', 'skills');
  const { results, ok, totalIndex, indexIssue } = checkSkills(skillsDir);
  for (const r of results) {
    const mark = r.level === 'PASS' ? '✓' : r.level === 'WARN' ? '!' : '✗';
    console.log(`${mark} ${r.level.padEnd(4)} ${r.name}`);
    for (const i of r.issues) console.log(`        - ${i}`);
  }
  console.log(`\nindex total: ${totalIndex}/4000 chars`);
  for (const i of indexIssue) console.log(`✗ ${i}`);
  const failed = results.filter((r) => r.level === 'FAIL').length;
  console.log(`\n${results.length} skills, ${failed} failing`);
  process.exit(ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bench/structural.test.mjs`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Run the validator against the real skills**

Run: `node bench/structural.mjs`
Expected: a table of all 17 skills. **If any FAIL, that is a real finding** — fix the offending `SKILL.md` (e.g. trim a description over 130 chars, correct an `allowed-tools` typo) before continuing, then re-run until exit 0. Record what was fixed in the commit message.

- [ ] **Step 6: Commit**

```bash
git add bench/structural.mjs bench/structural.test.mjs
git commit -m "feat(bench): structural SKILL.md validator (stage 1)"
```

---

### Task 5: Transcript parser (`bench/lib/transcript.mjs`)

Pure function: given a session JSONL string, return the ordered list of skills invoked.

**Files:**
- Create: `bench/lib/transcript.mjs`
- Test: `bench/lib/transcript.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// bench/lib/transcript.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSkillInvocations } from './transcript.mjs';

const jsonl = [
  JSON.stringify({ role: 'system', content: 'sys' }),
  JSON.stringify({ role: 'user', content: 'help me add a feature' }),
  JSON.stringify({ role: 'assistant', tool_calls: [
    { id: 'c1', type: 'function', function: { name: 'run_skill', arguments: JSON.stringify({ name: 'brainstorming', arguments: 'x' }) } },
  ] }),
  JSON.stringify({ role: 'tool', name: 'run_skill', tool_call_id: 'c1', content: 'ok' }),
  JSON.stringify({ role: 'assistant', tool_calls: [
    { id: 'c2', type: 'function', function: { name: 'explore', arguments: JSON.stringify({ task: 'look around' }) } },
    { id: 'c3', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'a' }) } },
  ] }),
].join('\n');

test('extracts run_skill name and wrapper tools, in order, ignoring plain tools', () => {
  assert.deepEqual(extractSkillInvocations(jsonl), ['brainstorming', 'explore']);
});

test('handles read_skill and tolerates malformed lines/arguments', () => {
  const t = [
    'not json',
    JSON.stringify({ role: 'assistant', tool_calls: [
      { function: { name: 'read_skill', arguments: '{bad json' } },
      { function: { name: 'run_skill', arguments: JSON.stringify({ name: 'systematic-debugging' }) } },
    ] }),
  ].join('\n');
  assert.deepEqual(extractSkillInvocations(t), ['systematic-debugging']);
});

test('empty transcript yields empty list', () => {
  assert.deepEqual(extractSkillInvocations(''), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bench/lib/transcript.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// bench/lib/transcript.mjs

// Tools whose invocation means "a skill was loaded".
export const SKILL_TOOLS = new Set(['run_skill', 'read_skill']);
// Dedicated wrappers that ARE a skill (the skill name is the tool name).
export const WRAPPER_TOOLS = new Set(['explore', 'review', 'research', 'security_review']);

/**
 * Parse a Reasonix session JSONL transcript into the ordered list of skills invoked.
 * @param {string} jsonlText
 * @returns {string[]} skill names, in invocation order (duplicates preserved)
 */
export function extractSkillInvocations(jsonlText) {
  const invocations = [];
  for (const line of jsonlText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (obj.role !== 'assistant' || !Array.isArray(obj.tool_calls)) continue;
    for (const tc of obj.tool_calls) {
      const fn = tc && tc.function;
      if (!fn || !fn.name) continue;
      if (SKILL_TOOLS.has(fn.name)) {
        try {
          const args = JSON.parse(fn.arguments || '{}');
          if (args && typeof args.name === 'string') invocations.push(args.name);
        } catch { /* unparseable args: skip this call */ }
      } else if (WRAPPER_TOOLS.has(fn.name)) {
        invocations.push(fn.name);
      }
    }
  }
  return invocations;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bench/lib/transcript.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bench/lib/transcript.mjs bench/lib/transcript.test.mjs
git commit -m "feat(bench): session-JSONL skill-invocation parser"
```

---

### Task 6: Scoring (`bench/lib/scoring.mjs`)

Pure function: given a case and the invocation list, decide pass/fail per the agreed rules (invoked-anywhere = pass; first-skill reported, not scored; `mustNotInvoke` enforced).

**Files:**
- Create: `bench/lib/scoring.mjs`
- Test: `bench/lib/scoring.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// bench/lib/scoring.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCase } from './scoring.mjs';

test('pass when expected skill invoked anywhere', () => {
  const r = scoreCase({ id: 'a', expect: ['brainstorming'] }, ['explore', 'brainstorming']);
  assert.equal(r.pass, true);
  assert.equal(r.firstSkill, 'explore');
  assert.equal(r.expectedWasFirst, false);
});

test('fail when expected skill never invoked', () => {
  const r = scoreCase({ id: 'b', expect: ['brainstorming'] }, ['explore']);
  assert.equal(r.pass, false);
});

test('expectedWasFirst true when first invocation matches', () => {
  const r = scoreCase({ id: 'c', expect: ['systematic-debugging'] }, ['systematic-debugging']);
  assert.equal(r.expectedWasFirst, true);
});

test('mustNotInvoke fails the case if a forbidden skill fires', () => {
  const r = scoreCase({ id: 'd', expect: [], mustNotInvoke: ['brainstorming'] }, ['brainstorming']);
  assert.equal(r.pass, false);
  assert.deepEqual(r.violated, ['brainstorming']);
});

test('negative case passes when nothing forbidden fires', () => {
  const r = scoreCase({ id: 'e', expect: [], mustNotInvoke: ['brainstorming'] }, []);
  assert.equal(r.pass, true);
  assert.equal(r.firstSkill, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bench/lib/scoring.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// bench/lib/scoring.mjs

/**
 * @param {{id:string, expect?:string[], mustNotInvoke?:string[]}} testCase
 * @param {string[]} invocations  ordered skill names from the transcript
 */
export function scoreCase(testCase, invocations) {
  const expect = testCase.expect || [];
  const forbidden = testCase.mustNotInvoke || [];
  const invokedSet = new Set(invocations);

  const expectHit = expect.every((s) => invokedSet.has(s));
  const violated = forbidden.filter((s) => invokedSet.has(s));
  const pass = expectHit && violated.length === 0;

  const firstSkill = invocations.length ? invocations[0] : null;
  const expectedWasFirst = expect.length > 0 && firstSkill === expect[0];

  return { id: testCase.id, pass, expected: expect, invoked: invocations, firstSkill, expectedWasFirst, violated };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bench/lib/scoring.test.mjs`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bench/lib/scoring.mjs bench/lib/scoring.test.mjs
git commit -m "feat(bench): case scoring (invoked-anywhere = pass)"
```

---

### Task 7: Corpus (`bench/cases.jsonl`)

One realistic prompt per discoverable skill plus negative cases. Worker subagents are excluded (dispatched by other skills, not by cold prompts).

**Files:**
- Create: `bench/cases.jsonl`
- Test: `bench/cases.test.mjs`

- [ ] **Step 1: Write the failing test (validates the corpus is well-formed and covers the discoverable skills)**

```javascript
// bench/cases.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadSkills, EXPECT_NO_DESCRIPTION } from './lib/skills.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const lines = readFileSync(join(here, 'cases.jsonl'), 'utf8').split('\n').filter((l) => l.trim());
const cases = lines.map((l) => JSON.parse(l)); // throws if any line is malformed

test('every case has id, prompt, and an expect array', () => {
  const ids = new Set();
  for (const c of cases) {
    assert.ok(c.id && !ids.has(c.id), `unique id required: ${c.id}`);
    ids.add(c.id);
    assert.equal(typeof c.prompt, 'string');
    assert.ok(Array.isArray(c.expect));
  }
});

test('every discoverable skill is covered by at least one positive case', () => {
  const discoverable = loadSkills(join(here, '..', 'skills'))
    .filter((s) => !EXPECT_NO_DESCRIPTION.has(s.name))
    .map((s) => s.name);
  const covered = new Set(cases.flatMap((c) => c.expect));
  const missing = discoverable.filter((n) => !covered.has(n));
  assert.deepEqual(missing, [], `uncovered skills: ${missing.join(', ')}`);
});

test('has at least two negative cases', () => {
  const negatives = cases.filter((c) => c.expect.length === 0);
  assert.ok(negatives.length >= 2, 'need >=2 negative cases');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bench/cases.test.mjs`
Expected: FAIL — `cases.jsonl` not found.

- [ ] **Step 3: Create the corpus**

Create `bench/cases.jsonl` (one JSON object per line, no trailing comma). Prompts are phrased as a user would naturally ask, to test whether each skill's description actually triggers it:

```jsonl
{"id":"using-superpowers","prompt":"What skills do you have available and how should you decide which to use?","expect":["using-superpowers"],"note":"meta/discovery"}
{"id":"brainstorming","prompt":"I want to build a new feature for exporting reports. Where do we start?","expect":["brainstorming"],"note":"build work => design first"}
{"id":"writing-plans","prompt":"We've agreed on the design for the report exporter. Write the implementation plan.","expect":["writing-plans"],"note":"spec exists => plan"}
{"id":"tdd","prompt":"Implement the slugify() helper function for me.","expect":["test-driven-development"],"note":"implementing code"}
{"id":"debugging","prompt":"This test keeps failing intermittently and I can't figure out why.","expect":["systematic-debugging"],"note":"bug => debug first"}
{"id":"verification","prompt":"I think the fix is done. Can you confirm everything passes before we wrap up?","expect":["verification-before-completion"],"note":"claiming done"}
{"id":"subagent-dev","prompt":"Execute this implementation plan task by task with a fresh agent and review per task.","expect":["subagent-driven-development"],"note":"plan execution, isolated"}
{"id":"executing-plans","prompt":"Let's work through this implementation plan inline in this session with checkpoints.","expect":["executing-plans"],"note":"plan execution, inline"}
{"id":"worktrees","prompt":"I want to start this feature in an isolated workspace so it doesn't touch my current branch.","expect":["using-git-worktrees"],"note":"isolation up front"}
{"id":"finishing","prompt":"The feature is implemented and all tests pass. How do we wrap up the branch?","expect":["finishing-a-development-branch"],"note":"done => integrate"}
{"id":"requesting-review","prompt":"I just finished this feature. Can you get it reviewed before we merge?","expect":["requesting-code-review"],"note":"request review"}
{"id":"receiving-review","prompt":"Here is the code review feedback I got. Help me work through it.","expect":["receiving-code-review"],"note":"acting on feedback"}
{"id":"parallel-agents","prompt":"There are three unrelated bugs in different modules. Can we tackle them at the same time?","expect":["dispatching-parallel-agents"],"note":"independent work"}
{"id":"writing-skills","prompt":"I want to create a new Reasonix skill. How should I structure the SKILL.md?","expect":["writing-skills"],"note":"authoring skills"}
{"id":"neg-trivia","prompt":"What is the capital of France?","expect":[],"mustNotInvoke":["brainstorming","systematic-debugging","writing-plans","test-driven-development"],"note":"pure trivia, no skill"}
{"id":"neg-arith","prompt":"What is 17 multiplied by 23?","expect":[],"mustNotInvoke":["brainstorming","systematic-debugging","test-driven-development"],"note":"arithmetic, no skill"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bench/cases.test.mjs`
Expected: PASS — 3 tests pass (every discoverable skill covered, ids unique, ≥2 negatives). If "uncovered skills" fails, add a case for each named skill.

- [ ] **Step 5: Commit**

```bash
git add bench/cases.jsonl bench/cases.test.mjs
git commit -m "feat(bench): behavioral corpus with positive + negative cases"
```

---

### Task 8: Behavioral runner (`bench/behavioral.mjs`)

Spawns `reasonix run` per case against the isolated config, finds the new session JSONL by snapshot-diff, parses invocations, scores. Includes a one-case smoke test to de-risk the live spawn before the full run.

**Files:**
- Create: `bench/behavioral.mjs`

- [ ] **Step 1: Write the runner**

```javascript
// bench/behavioral.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { extractSkillInvocations } from './lib/transcript.mjs';
import { scoreCase } from './lib/scoring.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const RESULTS_DIR = join(HERE, 'results');

// Resolve the sessions dir from `reasonix doctor` (OS-independent), expanding ~.
export function resolveSessionsDir() {
  const out = execFileSync('reasonix', ['doctor'], { encoding: 'utf8' });
  const m = out.match(/sessions[\s\S]*?dir\s+(\S+)/);
  if (!m) throw new Error('could not find sessions dir in `reasonix doctor` output');
  return m[1].replace(/^~/, homedir());
}

function listSessions(dir) {
  return new Set(readdirSync(dir).filter((f) => f.endsWith('.jsonl')));
}

// Copy bench/reasonix.toml -> repo-root/reasonix.toml so config resolution picks it up.
function installBenchConfig() {
  const src = join(HERE, 'reasonix.toml');
  const dst = join(REPO_ROOT, 'reasonix.toml');
  copyFileSync(src, dst);
  return dst;
}

export function runCase(testCase, { model, sessionsDir, maxSteps = 8 }) {
  const before = listSessions(sessionsDir);
  const metricsPath = join(RESULTS_DIR, `${testCase.id}.metrics.json`);
  try {
    execFileSync('reasonix', [
      'run', '-dir', REPO_ROOT, '-model', model,
      '-max-steps', String(maxSteps), '-metrics', metricsPath,
      testCase.prompt,
    ], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env, timeout: 240000 });
  } catch {
    // reasonix may exit non-zero (e.g. hit max-steps); the session is still saved.
  }
  const after = readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl') && !before.has(f));
  if (after.length === 0) {
    return { ...scoreCase(testCase, []), error: 'no new session file found' };
  }
  // newest by mtime
  const newest = after
    .map((f) => ({ f, t: statSync(join(sessionsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f;
  const sessionPath = join(sessionsDir, newest);
  copyFileSync(sessionPath, join(RESULTS_DIR, `${testCase.id}.jsonl`));
  const invocations = extractSkillInvocations(readFileSync(sessionPath, 'utf8'));
  return scoreCase(testCase, invocations);
}

function loadCases() {
  return readFileSync(join(HERE, 'cases.jsonl'), 'utf8')
    .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function hasKey() {
  if (process.env.DEEPSEEK_API_KEY) return true;
  const envFile = join(REPO_ROOT, '.env');
  return existsSync(envFile) && /(^|\n)DEEPSEEK_API_KEY=\S/.test(readFileSync(envFile, 'utf8'));
}

function main() {
  const args = process.argv.slice(2);
  const model = (args.find((a) => a.startsWith('--model=')) || '--model=deepseek-flash').split('=')[1];
  const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;

  if (!hasKey()) {
    console.log('behavioral: SKIPPED — no DEEPSEEK_API_KEY in env or .env');
    process.exit(0);
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  installBenchConfig();
  const sessionsDir = resolveSessionsDir();
  let cases = loadCases();
  if (only) cases = cases.filter((c) => c.id === only);

  const results = [];
  for (const c of cases) {
    process.stdout.write(`running ${c.id} ... `);
    const r = runCase(c, { model, sessionsDir });
    results.push(r);
    console.log(r.pass ? 'PASS' : 'FAIL', `(first: ${r.firstSkill ?? '—'}, invoked: [${r.invoked.join(', ')}])`);
  }

  const passed = results.filter((r) => r.pass).length;
  const firstHit = results.filter((r) => r.expectedWasFirst).length;
  writeFileSync(join(RESULTS_DIR, 'report.json'),
    JSON.stringify({ model, total: results.length, passed, firstHit, results }, null, 2));
  console.log(`\n${passed}/${results.length} passed · expected-fired-first ${firstHit}/${results.length} · model ${model}`);
  console.log(`report: bench/results/report.json`);
  process.exit(passed === results.length ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 2: Smoke-test the live spawn with ONE case (de-risk the JSONL shape)**

Run:
```bash
node bench/behavioral.mjs --only=debugging
```
Expected: `running debugging ... PASS (first: systematic-debugging, invoked: [systematic-debugging, ...])` — proving (a) `reasonix run` saved a session, (b) the snapshot-diff found it, (c) the parser extracted the skill name. **If it shows `no new session file found`**, check the sessions dir resolution: `node -e "import('./bench/behavioral.mjs').then(m=>console.log(m.resolveSessionsDir()))"` and compare to `reasonix doctor`. **If invoked is empty but the model clearly used a skill**, open `bench/results/debugging.jsonl`, find the `tool_calls` entry, and confirm the `run_skill`/wrapper record shape matches the parser in `transcript.mjs`; adjust the parser if the npm build differs from the probed sample.

- [ ] **Step 3: Confirm the isolation config landed and clean it up if needed**

Run: `head -3 reasonix.toml && rm -f reasonix.toml`
Expected: the bench config header prints (it was copied to repo root for the run). Removing it keeps the working tree clean between runs; the runner re-copies it each invocation. Step 4 gitignores it so it never gets committed.

- [ ] **Step 4: Gitignore the generated root config**

Append to repo-root `.gitignore`:
```gitignore
/reasonix.toml
```

- [ ] **Step 5: Commit**

```bash
git add bench/behavioral.mjs .gitignore
git commit -m "feat(bench): behavioral runner (stage 2) + smoke test"
```

---

### Task 9: Entry point (`bench/bench.mjs`) + README + full run

Orchestrates: structural gate first (abort on FAIL), then behavioral (skips cleanly without a key).

**Files:**
- Create: `bench/bench.mjs`
- Create: `bench/README.md`

- [ ] **Step 1: Write the entry point**

```javascript
// bench/bench.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

function run(script, args = []) {
  try {
    execFileSync('node', [join(HERE, script), ...args], { stdio: 'inherit' });
    return 0;
  } catch (e) {
    return typeof e.status === 'number' ? e.status : 1;
  }
}

console.log('=== Stage 1: structural ===');
const structural = run('structural.mjs');
if (structural !== 0) {
  console.error('\nStructural checks failed — fix SKILL.md issues before the behavioral stage.');
  process.exit(structural);
}

console.log('\n=== Stage 2: behavioral ===');
const behavioral = run('behavioral.mjs', process.argv.slice(2));
process.exit(behavioral);
```

- [ ] **Step 2: Verify the entry point runs the structural gate**

Run: `node bench/bench.mjs --only=debugging`
Expected: Stage 1 prints the 17-skill table and passes, then Stage 2 runs the single `debugging` case and reports PASS.

- [ ] **Step 3: Write `bench/README.md`**

```markdown
# Skill Benchmark

Two-stage check that this repo's skills (a) load into Reasonix and (b) actually
get invoked by realistic prompts.

## Run

```bash
node bench/bench.mjs                 # structural gate, then behavioral (needs a key)
node bench/structural.mjs            # stage 1 only (deterministic, no API)
node bench/behavioral.mjs            # stage 2 only
node bench/behavioral.mjs --only=debugging   # one case
node bench/behavioral.mjs --model=deepseek-pro
node --test bench/**/*.test.mjs      # unit tests for the harness itself
```

The behavioral stage needs `DEEPSEEK_API_KEY` in the shell env or in `.env` at
the repo root; without it, stage 2 skips cleanly (exit 0).

## How it works

- **Stage 1 (`structural.mjs`)** validates every `skills/*/SKILL.md`: name regex,
  description contract (discoverable skills have one; worker subagents don't),
  130-char index line, 4000-char index budget, `allowed-tools` names, references.
- **Stage 2 (`behavioral.mjs`)** copies `bench/reasonix.toml` to the repo root so
  only this repo's `skills/` are visible (the global `~/.reasonix/skills` root is
  excluded), runs each prompt in `cases.jsonl` through `reasonix run`, then reads
  which skill fired from the saved session JSONL. A case passes when the expected
  skill is invoked at any step; `--only` runs one case; results land in
  `bench/results/`.

## Add a case

Append one line to `cases.jsonl`:

```json
{"id":"my-case","prompt":"a realistic user request","expect":["skill-name"],"note":"why"}
```

Negative cases use `"expect":[]` plus `"mustNotInvoke":["skill","..."]`.
```

- [ ] **Step 4: Run the FULL benchmark**

Run: `node bench/bench.mjs`
Expected: Stage 1 all-pass, then the full corpus runs. Report prints `N/16 passed`. **Any behavioral FAIL is a real signal** — the skill's description didn't trigger for that prompt. Review `bench/results/<id>.jsonl` to see what the model did instead. Do NOT "fix" by weakening a case; either improve the skill's `description` (front-load triggers) or, if the prompt was unfair, refine the prompt. Re-run until the result reflects genuine behavior.

- [ ] **Step 5: Commit**

```bash
git add bench/bench.mjs bench/README.md
git commit -m "feat(bench): entry point + docs; full benchmark runnable"
```

- [ ] **Step 6: Run the harness's own unit tests once more**

Run: `node --test bench/lib/*.test.mjs bench/*.test.mjs`
Expected: all unit tests pass (frontmatter, skills, structural, transcript, scoring, cases).

---

## Self-Review

**Spec coverage:**
- Structural validator (name, description contract, 130/4000 index, allowed-tools, references) → Task 4. ✓
- Behavioral runner (isolated config, snapshot-diff session discovery, JSONL parse, scoring) → Tasks 5, 6, 8. ✓
- Isolation from global `superpowers-*` skills → `bench/reasonix.toml` excluded_paths, Task 1/8. ✓
- Corpus with positives + negatives, workers excluded → Task 7. ✓
- Pass = invoked anywhere; first-skill secondary → Task 6 (`scoreCase`). ✓
- Default `deepseek-flash`, `--model` override → Task 8. ✓
- Key gating (skip without key) → Task 8 `hasKey()`. ✓
- Entry point structural-gate-then-behavioral → Task 9. ✓
- De-risk JSONL shape before full run → Task 8 Step 2 smoke test. ✓

**Type/name consistency:** `parseFrontmatter`, `loadSkills`, `isSubagent`, `indexLine`, `evaluateSkill`/`checkSkills`, `extractSkillInvocations`, `scoreCase`, `runCase`/`resolveSessionsDir` — each defined once and imported with matching signatures. Frontmatter keys are lowercased consistently (`runas`, `allowed-tools`). `scoreCase` returns `{id,pass,expected,invoked,firstSkill,expectedWasFirst,violated}`, consumed unchanged by `behavioral.mjs`.

**Placeholder scan:** No TBD/TODO. The one dead-code block in Task 4 Step 3 (the `require` ref loop) is explicitly replaced in Step 4 with working code — called out, not left dangling.
