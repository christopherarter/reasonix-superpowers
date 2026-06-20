#!/usr/bin/env bash
# superpowers-reasonix installer.
# Installs the latest released skills into your Reasonix skills root so they
# auto-load in every session. Re-run to upgrade (idempotent: skips if current).
#
#   curl -fsSL https://raw.githubusercontent.com/christopherarter/superpowers-reasonix/main/install.sh | bash
#
# Options:  --version vX.Y.Z   install a specific release (default: latest)
#           --force            reinstall even if already up to date
# Env:      REASONIX_SKILLS_DIR        skills root (default: ~/.reasonix/skills)
#           REASONIX_INSTALL_TARBALL   install from a local tarball (skips download)
set -euo pipefail

REPO="christopherarter/superpowers-reasonix"
ASSET="superpowers-reasonix-skills.tar.gz"
VERSION="latest"
FORCE=""
SKILLS_ROOT="${REASONIX_SKILLS_DIR:-$HOME/.reasonix/skills}"
SUPPORT_DIR="$SKILLS_ROOT/.superpowers-reasonix"
BACKUP_ROOT="$(dirname "$SKILLS_ROOT")/superpowers-reasonix-backups"

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:?--version needs a value}"; shift 2 ;;
    --version=*) VERSION="${1#*=}"; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
if [ ! -f "$stage/VERSION" ] || [ ! -f "$stage/AGENTS.md" ]; then
  echo "error: tarball missing VERSION or AGENTS.md — corrupt download?" >&2
  exit 1
fi

new_version="$(cat "$stage/VERSION")"
installed_version=""
[ -f "$SUPPORT_DIR/VERSION" ] && installed_version="$(cat "$SUPPORT_DIR/VERSION")"

# Idempotent: if the exact version is already installed, do nothing (no
# clobber, no backups) unless --force is given.
if [ -n "$new_version" ] && [ "$installed_version" = "$new_version" ] && [ -z "$FORCE" ]; then
  echo "✓ superpowers-reasonix $new_version is already installed at $SKILLS_ROOT — already up to date."
  echo "  Re-run with --force to reinstall."
  exit 0
fi

# Remove a previous MANAGED install (only the dirs WE recorded), if any. This is
# how a retired skill gets cleaned up on upgrade. Anything else is left alone.
if [ -f "$SUPPORT_DIR/manifest" ]; then
  while IFS= read -r d; do
    [ -n "$d" ] && rm -rf "${SKILLS_ROOT:?}/$d"
  done < "$SUPPORT_DIR/manifest"
fi
rm -rf "$SUPPORT_DIR"

mkdir -p "$SKILLS_ROOT" "$SUPPORT_DIR"
: > "$SUPPORT_DIR/manifest"

# Install each skill. If a same-named dir is still present here, it is NOT one of
# ours (managed dirs were just removed) — it's a manual/symlink install or your
# own dir. Back it up outside the scanned root before adopting the name, so a
# backup is never re-loaded as a skill and nothing is silently destroyed.
backed_up=0
backup_dir=""
for dir in "$stage"/skills/*/; do
  name="$(basename "$dir")"
  target="$SKILLS_ROOT/$name"
  if [ -e "$target" ] || [ -L "$target" ]; then
    if [ -z "$backup_dir" ]; then
      backup_dir="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)-$$"
      mkdir -p "$backup_dir"
    fi
    mv "$target" "$backup_dir/$name"
    backed_up=$((backed_up + 1))
  fi
  cp -R "$dir" "$target"
  echo "$name" >> "$SUPPORT_DIR/manifest"
done
cp "$stage/VERSION" "$SUPPORT_DIR/VERSION"
cp "$stage/AGENTS.md" "$SUPPORT_DIR/AGENTS.md"

n="$(wc -l < "$SUPPORT_DIR/manifest" | tr -d ' ')"
echo ""
if [ -z "$installed_version" ]; then
  echo "✓ superpowers-reasonix $new_version — $n skills installed to $SKILLS_ROOT"
elif [ "$installed_version" = "$new_version" ]; then
  echo "✓ superpowers-reasonix $new_version — $n skills reinstalled (--force) in $SKILLS_ROOT"
else
  echo "✓ superpowers-reasonix — upgraded $installed_version → $new_version ($n skills) in $SKILLS_ROOT"
fi
if [ "$backed_up" -gt 0 ]; then
  echo "  Backed up $backed_up pre-existing non-managed skill dir(s) to $backup_dir"
fi
echo "  Skills auto-load in every Reasonix session (~/.reasonix/skills is scanned by default)."
echo "  For the always-on discipline, copy AGENTS.md into each project:"
echo "      cp $SUPPORT_DIR/AGENTS.md <your-project>/AGENTS.md"
echo "  Verify: reasonix doctor   (or /skills in a session)"
