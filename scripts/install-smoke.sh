#!/usr/bin/env bash
# Offline smoke test for install.sh: build a fixture tarball matching the
# release layout, install it into a temp skills root, assert the result, then
# assert a re-run upgrades cleanly with no residue.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # repo root
expected="$(find "$HERE/skills" -maxdepth 1 -type d -name 'superpowers-*' | wc -l | tr -d ' ')"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Build a fixture tarball the same way release.yml will (skills + support files).
stage="$work/pkg"
mkdir -p "$stage"
cp -R "$HERE/skills" "$stage/skills"
cp "$HERE/AGENTS.md" "$stage/AGENTS.md"
cp "$HERE/AGENTS.md.example" "$stage/AGENTS.md.example"
cp "$HERE/reasonix.toml.example" "$stage/reasonix.toml.example"
cp "$HERE/LICENSE" "$stage/LICENSE"
echo "v0.0.0-test" > "$stage/VERSION"
tarball="$work/superpowers-reasonix-skills.tar.gz"
tar -czf "$tarball" -C "$stage" .

root="$work/skills-root"
run() { REASONIX_SKILLS_DIR="$root" REASONIX_INSTALL_TARBALL="$tarball" bash "$HERE/install.sh"; }

# First install
run
[ -f "$root/superpowers-brainstorming/SKILL.md" ] || { echo "FAIL: skill not installed"; exit 1; }
count="$(find "$root" -maxdepth 1 -type d -name 'superpowers-*' | wc -l | tr -d ' ')"
[ "$count" = "$expected" ] || { echo "FAIL: expected $expected skill dirs, got $count"; exit 1; }
[ "$(cat "$root/.superpowers-reasonix/VERSION")" = "v0.0.0-test" ] || { echo "FAIL: VERSION marker wrong"; exit 1; }
[ -f "$root/.superpowers-reasonix/AGENTS.md" ] || { echo "FAIL: AGENTS.md not stashed"; exit 1; }
[ "$(wc -l < "$root/.superpowers-reasonix/manifest" | tr -d ' ')" = "$expected" ] || { echo "FAIL: manifest should list $expected dirs"; exit 1; }

# Re-run upgrades cleanly: drop a stray marker, ensure a second run removes our
# managed dirs and reinstalls without leaving the stray inside a managed dir.
touch "$root/not-ours.txt"
mkdir -p "$root/my-own-skill" && touch "$root/my-own-skill/SKILL.md"
run
[ -f "$root/not-ours.txt" ] || { echo "FAIL: re-run clobbered unmanaged files"; exit 1; }
[ -f "$root/my-own-skill/SKILL.md" ] || { echo "FAIL: re-run clobbered an unmanaged dir"; exit 1; }
count2="$(find "$root" -maxdepth 1 -type d -name 'superpowers-*' | wc -l | tr -d ' ')"
[ "$count2" = "$expected" ] || { echo "FAIL: re-run left $count2 skill dirs"; exit 1; }

echo "PASS: install-smoke"
