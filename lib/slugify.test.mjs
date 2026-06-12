import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './slugify.mjs';

test('converts a simple phrase to lowercase with hyphens', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('replaces multiple spaces with a single hyphen', () => {
  assert.equal(slugify('hello   world'), 'hello-world');
});

test('removes special characters', () => {
  assert.equal(slugify('Hello! World?'), 'hello-world');
});

test('trims leading and trailing whitespace', () => {
  assert.equal(slugify('  hello world  '), 'hello-world');
});

test('handles mixed case input', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('collapses consecutive hyphens into one', () => {
  assert.equal(slugify('hello---world'), 'hello-world');
});

test('strips non-alphanumeric characters except hyphens', () => {
  assert.equal(slugify('hello & world #1'), 'hello--world-1');
});

test('returns empty string for empty input', () => {
  assert.equal(slugify(''), '');
});

test('returns empty string for input with only special characters', () => {
  assert.equal(slugify('!!!'), '');
});

test('preserves numbers', () => {
  assert.equal(slugify('hello 2 world'), 'hello-2-world');
});
