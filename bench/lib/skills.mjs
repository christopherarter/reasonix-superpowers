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
