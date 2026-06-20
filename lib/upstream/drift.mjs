// Pure drift computation and issue-body composition. No I/O.

export function computeDrift(manifest, latest, compareFiles) {
  return {
    obra: side({
      from: manifest.obra.lastSyncedCommit,
      to: latest.obra,
      files: compareFiles.obra,
      roots: [manifest.obra.skillsPath],
      label: "skill",
      skillMap: manifest.skillMap,
    }),
    reasonix: side({
      from: manifest.reasonix.lastVerifiedCommit,
      to: latest.reasonix,
      files: compareFiles.reasonix,
      roots: manifest.reasonix.contractPaths,
      label: "contract file",
    }),
  };
}

function side({ from, to, files, roots, label, skillMap }) {
  const drifted = from !== to;
  const out = { drifted, from, to, label, items: [], degraded: false };
  if (!drifted) return out;
  if (files == null) { out.degraded = true; return out; }
  const matched = files.filter((f) => roots.some((r) => f === r || f.startsWith(r + "/")));
  if (skillMap) {
    const pathToName = new Map(Object.entries(skillMap).map(([n, p]) => [p, n]));
    out.items = matched.map((f) => pathToName.get(f) ?? f);
  } else {
    out.items = matched;
  }
  return out;
}

export function hasDrift(report) {
  return report.obra.drifted || report.reasonix.drifted;
}

export function composeIssueBody(report) {
  const lines = ["Upstream drift detected. Run `/superpowers-sync-upstream` to re-port and re-pin.", ""];
  const sides = [["obra/superpowers", report.obra], ["DeepSeek-Reasonix main-v2", report.reasonix]];
  for (const [name, d] of sides) {
    if (!d.drifted) continue;
    lines.push(`### ${name}`, `\`${short(d.from)}\` to \`${short(d.to)}\``);
    if (d.degraded) {
      lines.push("Pinned commit unreachable (history rewritten); full diff unavailable. Re-pin during sync.");
    } else if (d.items.length) {
      lines.push(`Changed ${d.label}s:`, ...d.items.map((i) => `- ${i}`));
    } else {
      lines.push(`Advanced, but no watched ${d.label}s changed.`);
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

function short(sha) {
  return sha ? sha.slice(0, 9) : "unknown";
}
