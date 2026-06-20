#!/usr/bin/env bash
# Offline smoke test for install.sh. Builds fixture tarballs matching the release
# layout and exercises: fresh install, idempotent skip, --force, upgrade (with
# unmanaged files surviving), and adoption of a prior non-managed install.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # repo root
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Expected skill count is derived from source so it never drifts.
expected="$(find "$HERE/skills" -maxdepth 1 -type d -name 'superpowers-*' | wc -l | tr -d ' ')"

# build_tarball <version> <outfile> — packages skills + support files like release.yml.
build_tarball() {
  local ver="$1" out="$2" s
  s="$(mktemp -d)"
  cp -R "$HERE/skills" "$s/skills"
  cp "$HERE/AGENTS.md" "$HERE/AGENTS.md.example" "$HERE/reasonix.toml.example" "$HERE/LICENSE" "$s/"
  echo "$ver" > "$s/VERSION"
  tar -czf "$out" -C "$s" .
  rm -rf "$s"
}

tb1="$work/v1.tgz"; build_tarball "v0.0.1-test" "$tb1"
tb2="$work/v2.tgz"; build_tarball "v0.0.2-test" "$tb2"

root="$work/skills-root"
backups="$(dirname "$root")/superpowers-reasonix-backups"
inst() { REASONIX_SKILLS_DIR="$root" REASONIX_INSTALL_TARBALL="$1" bash "$HERE/install.sh" "${@:2}"; }

# 1. Fresh install.
inst "$tb1" >/dev/null
[ -f "$root/superpowers-brainstorming/SKILL.md" ] || { echo "FAIL: fresh install missing skill"; exit 1; }
c="$(find "$root" -maxdepth 1 -type d -name 'superpowers-*' | wc -l | tr -d ' ')"
[ "$c" = "$expected" ] || { echo "FAIL: expected $expected skill dirs, got $c"; exit 1; }
[ "$(cat "$root/.superpowers-reasonix/VERSION")" = "v0.0.1-test" ] || { echo "FAIL: VERSION marker wrong"; exit 1; }
[ -f "$root/.superpowers-reasonix/AGENTS.md" ] || { echo "FAIL: AGENTS.md not stashed"; exit 1; }
[ "$(wc -l < "$root/.superpowers-reasonix/manifest" | tr -d ' ')" = "$expected" ] || { echo "FAIL: manifest count wrong"; exit 1; }

# 2. Idempotent: re-running the same version skips and makes no backups.
out="$(inst "$tb1")"
echo "$out" | grep -q "already up to date" || { echo "FAIL: same-version re-run did not skip"; exit 1; }
[ -d "$backups" ] && { echo "FAIL: a skip created a backup dir"; exit 1; }

# 3. --force reinstalls the same version.
out="$(inst "$tb1" --force)"
echo "$out" | grep -q "reinstalled (--force)" || { echo "FAIL: --force did not reinstall"; exit 1; }
[ "$(cat "$root/.superpowers-reasonix/VERSION")" = "v0.0.1-test" ] || { echo "FAIL: --force changed version"; exit 1; }

# 4. Upgrade to a new version; unmanaged file AND dir must survive untouched.
touch "$root/not-ours.txt"
mkdir -p "$root/my-own-skill" && touch "$root/my-own-skill/SKILL.md"
out="$(inst "$tb2")"
echo "$out" | grep -q "upgraded v0.0.1-test → v0.0.2-test" || { echo "FAIL: upgrade message missing"; exit 1; }
[ "$(cat "$root/.superpowers-reasonix/VERSION")" = "v0.0.2-test" ] || { echo "FAIL: upgrade did not update VERSION"; exit 1; }
[ -f "$root/not-ours.txt" ] || { echo "FAIL: upgrade clobbered an unmanaged file"; exit 1; }
[ -f "$root/my-own-skill/SKILL.md" ] || { echo "FAIL: upgrade clobbered an unmanaged dir"; exit 1; }

# 5. Adopt a prior NON-managed install (e.g. the old symlink recipe): the
#    same-named dir is backed up (data preserved), not silently destroyed.
ap="$work/adopt"; mkdir -p "$ap"
aroot="$ap/skills-root"
abackups="$(dirname "$aroot")/superpowers-reasonix-backups"
mkdir -p "$aroot/superpowers-brainstorming"
echo "MINE" > "$aroot/superpowers-brainstorming/SENTINEL"
out="$(REASONIX_SKILLS_DIR="$aroot" REASONIX_INSTALL_TARBALL="$tb1" bash "$HERE/install.sh")"
echo "$out" | grep -q "Backed up 1 pre-existing non-managed" || { echo "FAIL: adopt did not back up the manual install"; exit 1; }
[ -f "$aroot/superpowers-brainstorming/SKILL.md" ] || { echo "FAIL: adopt did not install the real skill"; exit 1; }
found="$(find "$abackups" -name SENTINEL | head -1)"
{ [ -n "$found" ] && [ "$(cat "$found")" = "MINE" ]; } || { echo "FAIL: adopt lost the user's data"; exit 1; }

echo "PASS: install-smoke"
