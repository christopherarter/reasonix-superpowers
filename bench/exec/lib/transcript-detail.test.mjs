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
  assert.deepEqual(calls[0].args, {});
  assert.equal(calls[0].resultText, '');
});
