import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { extractToolCalls } from './lib/transcript-detail.mjs';
import { runMechanical } from './lib/mechanical.mjs';
import { extractSkillInvocations } from '../lib/transcript.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SKILLS_DIR = join(REPO_ROOT, 'skills');
const RESULTS = join(HERE, 'results');

export function resolveSessionsDir() {
  const out = execFileSync('reasonix', ['doctor'], { encoding: 'utf8' });
  const m = out.match(/sessions[\s\S]*?dir\s+(.+)/);
  if (!m) throw new Error('no sessions dir from reasonix doctor');
  return m[1].trim().replace(/^~/, homedir());
}

function isolatedConfig() {
  return [
    `default_model = "deepseek-flash"`,
    `[skills]`,
    `paths = ["./_skillsrc"]`,
    `excluded_paths = ["~/.reasonix/skills", "~/.agents/skills", "~/.agent/skills", "~/.claude/skills"]`,
    `[permissions]`,
    `mode = "allow"`,
    ``,
  ].join('\n');
}

function setupWorkspace(scenario) {
  const ws = mkdtempSync(join(tmpdir(), `exec-${scenario.skill}-`));
  // Copy the skills locally and reference them by a RELATIVE path in the config, so
  // the workspace reasonix.toml holds no absolute path back to the real repo —
  // otherwise the agent reads that breadcrumb and wanders into the real checkout.
  cpSync(SKILLS_DIR, join(ws, '_skillsrc'), { recursive: true });
  if (scenario.fixture) cpSync(join(HERE, 'fixtures', scenario.fixture), ws, { recursive: true });
  writeFileSync(join(ws, 'reasonix.toml'), isolatedConfig());
  if (scenario.git) {
    execFileSync('git', ['init', '-q'], { cwd: ws });
    execFileSync('git', ['add', '-A'], { cwd: ws });
    execFileSync('git', ['-c', 'user.email=e@e', '-c', 'user.name=n', 'commit', '-q', '-m', 'fixture'], { cwd: ws });
    if (scenario.git.branch) execFileSync('git', ['checkout', '-q', '-B', scenario.git.branch], { cwd: ws });
  }
  return ws;
}

function snapshotFiles(dir, base = '') {
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === '.git' || e === 'node_modules' || e === 'reasonix.toml' || e === '_skillsrc') continue;
    const abs = join(dir, e); const rel = base ? `${base}/${e}` : e;
    if (statSync(abs).isDirectory()) out.push(...snapshotFiles(abs, rel)); else out.push(rel);
  }
  return out;
}

export function generateOne(scenario, { model = 'deepseek-flash', sessionsDir }) {
  const ws = setupWorkspace(scenario);
  const before = new Set(readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl')));
  // This eval measures EXECUTION fidelity, not invocation — so force the skill to
  // load (get its body into context) via an explicit preamble. Whether the model
  // then FOLLOWS the loaded body is what the rubric scores. (Invocation is the
  // separate bench/ benchmark's job; the temp workspace has no AGENTS.md.)
  const prompt = `Use the \`${scenario.skill}\` skill for this task — load it and follow it.\n\n${scenario.prompt}`;
  try {
    execFileSync('reasonix', ['run', '-dir', ws, '-model', model, '-max-steps', String(scenario.maxSteps), prompt],
      { stdio: ['ignore', 'pipe', 'pipe'], env: process.env, timeout: 600000 });
  } catch { /* may hit max-steps / a pending ask; transcript still saved */ }

  const newSessions = readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl') && !before.has(f));
  const outDir = join(RESULTS, scenario.skill);
  mkdirSync(outDir, { recursive: true });
  let calls = [], invoked = [], jsonlPath = '';
  if (newSessions.length) {
    const newest = newSessions.map((f) => ({ f, t: statSync(join(sessionsDir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0].f;
    const jsonl = readFileSync(join(sessionsDir, newest), 'utf8');
    jsonlPath = join(outDir, 'transcript.jsonl');
    writeFileSync(jsonlPath, jsonl);
    calls = extractToolCalls(jsonl);
    invoked = extractSkillInvocations(jsonl);
  }
  const artDir = join(outDir, 'artifacts');
  mkdirSync(artDir, { recursive: true });
  for (const rel of snapshotFiles(ws)) {
    const dst = join(artDir, rel); mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(ws, rel), dst);
  }
  const mechanical = {};
  for (const c of scenario.rubric) {
    if (c.mechanical) mechanical[c.id] = runMechanical(c.mechanical, calls, ws);
  }
  const skillLoaded = invoked.includes(scenario.skill);
  const summary = { skill: scenario.skill, skillLoaded, invoked, mechanical, callCount: calls.length };
  writeFileSync(join(outDir, 'mechanical.json'), JSON.stringify(summary, null, 2));
  return summary;
}

function loadScenarios() {
  return readdirSync(join(HERE, 'scenarios')).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(HERE, 'scenarios', f), 'utf8')));
}
function hasKey() {
  if (process.env.DEEPSEEK_API_KEY) return true;
  const env = join(REPO_ROOT, '.env');
  return existsSync(env) && /(^|\n)DEEPSEEK_API_KEY=\S/.test(readFileSync(env, 'utf8'));
}

function main() {
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;
  if (!hasKey()) { console.log('exec/generate: SKIPPED — no DEEPSEEK_API_KEY'); process.exit(0); }
  mkdirSync(RESULTS, { recursive: true });
  const sessionsDir = resolveSessionsDir();
  let scenarios = loadScenarios();
  if (only) scenarios = scenarios.filter((s) => s.skill === only);
  for (const s of scenarios) {
    process.stdout.write(`generate ${s.skill} ... `);
    const r = generateOne(s, { sessionsDir });
    const mech = Object.entries(r.mechanical).map(([k, v]) => `${k}=${v.pass ? '✓' : '✗'}`).join(' ');
    console.log(r.skillLoaded ? 'skill-loaded' : 'SKILL-NOT-INVOKED', `| ${mech}`);
  }
  console.log(`\ntranscripts + artifacts + mechanical.json under bench/exec/results/<skill>/`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
