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

  const level = issues.length ? 'FAIL' : 'PASS';
  return { name: skill.name, level, issues };
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
