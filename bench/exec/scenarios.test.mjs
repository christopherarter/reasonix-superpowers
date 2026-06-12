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
