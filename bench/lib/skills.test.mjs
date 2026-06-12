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
