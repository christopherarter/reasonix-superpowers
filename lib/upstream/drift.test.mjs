import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDrift, hasDrift, composeIssueBody } from "./drift.mjs";

const manifest = {
  obra: { skillsPath: "skills", lastSyncedCommit: "obra000" },
  reasonix: { contractPaths: ["internal/tool", "internal/hook"], lastVerifiedCommit: "rx000" },
  skillMap: { "superpowers-brainstorming": "skills/brainstorming/SKILL.md" },
};

test("no change → no drift", () => {
  const r = computeDrift(manifest, { obra: "obra000", reasonix: "rx000" }, { obra: null, reasonix: null });
  assert.equal(hasDrift(r), false);
});

test("obra change maps changed file to skill name", () => {
  const r = computeDrift(manifest, { obra: "obra111", reasonix: "rx000" },
    { obra: ["skills/brainstorming/SKILL.md", "README.md"], reasonix: null });
  assert.equal(r.obra.drifted, true);
  assert.deepEqual(r.obra.items, ["superpowers-brainstorming"]);
  assert.equal(r.reasonix.drifted, false);
});

test("reasonix change keeps only watched contract paths", () => {
  const r = computeDrift(manifest, { obra: "obra000", reasonix: "rx111" },
    { obra: null, reasonix: ["internal/tool/read.go", "internal/tooling/x.go", "docs/x.md"] });
  assert.deepEqual(r.reasonix.items, ["internal/tool/read.go"]);
});

test("unreachable compare (null while drifted) is degraded", () => {
  const r = computeDrift(manifest, { obra: "obra111", reasonix: "rx000" }, { obra: null, reasonix: null });
  assert.equal(r.obra.degraded, true);
});

test("issue body names both upstreams and the command", () => {
  const r = computeDrift(manifest, { obra: "obra111", reasonix: "rx000" },
    { obra: ["skills/brainstorming/SKILL.md"], reasonix: null });
  const body = composeIssueBody(r);
  assert.match(body, /\/superpowers-sync-upstream/);
  assert.match(body, /obra\/superpowers/);
  assert.match(body, /superpowers-brainstorming/);
});
