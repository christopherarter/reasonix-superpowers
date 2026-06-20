import { test } from "node:test";
import assert from "node:assert/strict";
import { runDriftCheck } from "./check.mjs";

const manifest = {
  obra: { skillsPath: "skills", lastSyncedCommit: "obra000" },
  reasonix: { contractPaths: ["internal/tool"], lastVerifiedCommit: "rx000" },
  skillMap: { "superpowers-brainstorming": "skills/brainstorming/SKILL.md" },
};

function fakeIssues() {
  const calls = [];
  return {
    calls,
    open: null,
    async findOpen() { return this.open; },
    async create(x) { calls.push(["create", x]); },
    async update(n, b) { calls.push(["update", n, b]); },
  };
}

test("no drift creates no issue", async () => {
  const issues = fakeIssues();
  const res = await runDriftCheck(manifest, {
    fetchLatest: async () => ({ obra: "obra000", reasonix: "rx000" }),
    fetchCompare: async () => [],
    issues, log() {},
  });
  assert.equal(res.drifted, false);
  assert.equal(issues.calls.length, 0);
});

test("drift with no open issue creates one", async () => {
  const issues = fakeIssues();
  await runDriftCheck(manifest, {
    fetchLatest: async () => ({ obra: "obra111", reasonix: "rx000" }),
    fetchCompare: async () => ["skills/brainstorming/SKILL.md"],
    issues, log() {},
  });
  assert.equal(issues.calls[0][0], "create");
  assert.match(issues.calls[0][1].body, /superpowers-brainstorming/);
});

test("drift with an open issue updates it", async () => {
  const issues = fakeIssues();
  issues.open = { number: 7 };
  await runDriftCheck(manifest, {
    fetchLatest: async () => ({ obra: "obra111", reasonix: "rx000" }),
    fetchCompare: async () => ["skills/brainstorming/SKILL.md"],
    issues, log() {},
  });
  assert.equal(issues.calls[0][0], "update");
  assert.equal(issues.calls[0][1], 7);
});

test("compare is only fetched for the drifted upstream", async () => {
  const seen = [];
  await runDriftCheck(manifest, {
    fetchLatest: async () => ({ obra: "obra111", reasonix: "rx000" }),
    fetchCompare: async (which) => { seen.push(which); return ["skills/brainstorming/SKILL.md"]; },
    issues: fakeIssues(), log() {},
  });
  assert.deepEqual(seen, ["obra"]);
});
