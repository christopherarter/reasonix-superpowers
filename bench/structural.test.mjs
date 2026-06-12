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
