import { computeDrift, hasDrift, composeIssueBody } from "./drift.mjs";

export async function runDriftCheck(manifest, deps) {
  const latest = await deps.fetchLatest();
  const need = {
    obra: latest.obra !== manifest.obra.lastSyncedCommit,
    reasonix: latest.reasonix !== manifest.reasonix.lastVerifiedCommit,
  };
  const compareFiles = {
    obra: need.obra ? await deps.fetchCompare("obra", manifest.obra.lastSyncedCommit, latest.obra) : null,
    reasonix: need.reasonix ? await deps.fetchCompare("reasonix", manifest.reasonix.lastVerifiedCommit, latest.reasonix) : null,
  };
  const report = computeDrift(manifest, latest, compareFiles);
  if (!hasDrift(report)) {
    deps.log("no upstream drift");
    return { drifted: false, report };
  }
  const body = composeIssueBody(report);
  const existing = await deps.issues.findOpen("upstream-drift");
  if (existing) {
    await deps.issues.update(existing.number, body);
    return { drifted: true, report, issue: existing.number };
  }
  await deps.issues.create({ title: "Upstream drift: superpowers + Reasonix", body, label: "upstream-drift" });
  return { drifted: true, report, issue: "new" };
}
