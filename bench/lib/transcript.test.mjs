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

test('parses the REAL flat reasonix tool-call shape {id,name,arguments}', () => {
  // Captured verbatim from a reasonix npm-v1.4.0-rc.1 session JSONL.
  const t = [
    JSON.stringify({ role: 'assistant', tool_calls: [
      { id: 'call_00_x', name: 'bash', arguments: '{"command": "ls -la"}' },
    ] }),
    JSON.stringify({ role: 'assistant', tool_calls: [
      { id: 'call_00_y', name: 'run_skill', arguments: JSON.stringify({ name: 'systematic-debugging', arguments: 'help' }) },
      { id: 'call_00_z', name: 'explore', arguments: '{"task":"look"}' },
    ] }),
  ].join('\n');
  assert.deepEqual(extractSkillInvocations(t), ['systematic-debugging', 'explore']);
});
