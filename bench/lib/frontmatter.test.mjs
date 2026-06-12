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
