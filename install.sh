#!/usr/bin/env bash
# superpowers-reasonix installer.
# Installs the latest released skills into your Reasonix skills root so they
# auto-load in every session. Re-run to upgrade.
#
#   curl -fsSL https://raw.githubusercontent.com/christopherarter/superpowers-reasonix/main/install.sh | bash
#
# Options:  --version vX.Y.Z   install a specific release (default: latest)
# Env:      REASONIX_SKILLS_DIR        skills root (default: ~/.reasonix/skills)
#           REASONIX_INSTALL_TARBALL   install from a local tarball (skips download)
set -euo pipefail

REPO="christopherarter/superpowers-reasonix"
ASSET="superpowers-reasonix-skills.tar.gz"
VERSION="latest"
SKILLS_ROOT="${REASONIX_SKILLS_DIR:-$HOME/.reasonix/skills}"
SUPPORT_DIR="$SKILLS_ROOT/.superpowers-reasonix"

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:?--version needs a value}"; shift 2 ;;
    --version=*) VERSION="${1#*=}"; shift ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

need() { command -v "$1" >/dev/null 2>&1 || { echo "error: '$1' is required but not installed" >&2; exit 1; }; }
need tar

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
tarball="$tmp/$ASSET"

if [ -n "${REASONIX_INSTALL_TARBALL:-}" ]; then
  cp "$REASONIX_INSTALL_TARBALL" "$tarball"
else
  need curl
  if [ "$VERSION" = "latest" ]; then
    url="https://github.com/$REPO/releases/latest/download/$ASSET"
  else
    url="https://github.com/$REPO/releases/download/$VERSION/$ASSET"
  fi
  echo "Downloading $url"
  curl -fsSL "$url" -o "$tarball"
fi

stage="$tmp/stage"
mkdir -p "$stage"
tar -xzf "$tarball" -C "$stage"
[ -d "$stage/skills" ] || { echo "error: tarball missing skills/ — corrupt download?" >&2; exit 1; }
[ -f "$stage/VERSION" ] && [ -f "$stage/AGENTS.md" ] || { echo "error: tarball missing VERSION or AGENTS.md — corrupt download?" >&2; exit 1; }

# Remove a previous managed install (only the dirs WE recorded), if any.
# NOTE: the installer owns every superpowers-* dir it records in the manifest; a re-run removes them. Don't keep your own dir named superpowers-* in this root.
if [ -f "$SUPPORT_DIR/manifest" ]; then
  while IFS= read -r d; do
    [ -n "$d" ] && rm -rf "${SKILLS_ROOT:?}/$d"
  done < "$SUPPORT_DIR/manifest"
fi
rm -rf "$SUPPORT_DIR"

mkdir -p "$SKILLS_ROOT" "$SUPPORT_DIR"
: > "$SUPPORT_DIR/manifest"
for dir in "$stage"/skills/*/; do
  name="$(basename "$dir")"
  rm -rf "${SKILLS_ROOT:?}/$name"
  cp -R "$dir" "$SKILLS_ROOT/$name"
  echo "$name" >> "$SUPPORT_DIR/manifest"
done
cp "$stage/VERSION" "$SUPPORT_DIR/VERSION"
cp "$stage/AGENTS.md" "$SUPPORT_DIR/AGENTS.md"

installed="$(cat "$SUPPORT_DIR/VERSION")"
n="$(wc -l < "$SUPPORT_DIR/manifest" | tr -d ' ')"
echo ""
echo "✓ superpowers-reasonix $installed — $n skills installed to $SKILLS_ROOT"
echo "  They auto-load in every Reasonix session (~/.reasonix/skills is scanned by default)."
echo "  For the always-on discipline, copy AGENTS.md into each project:"
echo "      cp $SUPPORT_DIR/AGENTS.md <your-project>/AGENTS.md"
echo "  Verify: reasonix doctor   (or /skills in a session)"
