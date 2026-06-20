# Version-Based Release Implementation Plan

> **For agentic workers:** implement this plan task-by-task — dispatch a fresh subagent per task with the native `task` tool (recommended for quality), or use the superpowers-executing-plans skill to work through it inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship superpowers-reasonix as versioned GitHub Releases with a one-line `curl … | bash` installer that downloads the latest release and auto-loads the skills.

**Architecture:** A tag push (`v*`) triggers a GitHub Action that packages the skills into a stable-named tarball and cuts a Release with auto-generated notes. `install.sh` (served from `main`) downloads `releases/latest/download/<asset>` and installs the skill dirs flat into the default-scanned `~/.reasonix/skills/` root, tracked by a manifest for clean upgrades.

**Tech Stack:** Bash (`install.sh`, smoke test), GitHub Actions, `softprops/action-gh-release`.

## Global Constraints

- Repo: `christopherarter/superpowers-reasonix`. First tag: **`v1.0.0`**.
- Stable release asset name: **`superpowers-reasonix-skills.tar.gz`** (never version-suffixed, so `releases/latest/download/` resolves without an API call).
- Install target (default): skill dirs flat in `~/.reasonix/skills/`; support files (VERSION, AGENTS.md, manifest) in `~/.reasonix/skills/.superpowers-reasonix/`. Override the skills root via `$REASONIX_SKILLS_DIR`.
- `install.sh`: `set -euo pipefail`; must pass `shellcheck`; testable offline via `$REASONIX_INSTALL_TARBALL`.
- There are exactly **10** skills, all named `superpowers-*`, under `skills/`.
- `package.json` stays `private`; the git tag is the version source of truth.

---

### Task 1: `install.sh` + offline smoke test (TDD)

**Files:**
- Create: `install.sh` (repo root)
- Create: `scripts/install-smoke.sh` (test)

**Interfaces:**
- Produces: `install.sh` honoring `--version vX.Y.Z`, `$REASONIX_SKILLS_DIR`, `$REASONIX_INSTALL_TARBALL`. Installs each `skills/superpowers-*` dir flat into the skills root; writes `<root>/.superpowers-reasonix/{VERSION,AGENTS.md,manifest}` where `manifest` is newline-delimited installed skill dir names.
- Tarball layout it expects (produced by Task 2): archive root contains `skills/`, `AGENTS.md`, `AGENTS.md.example`, `reasonix.toml.example`, `LICENSE`, `VERSION`.

- [ ] **Step 1: Write the failing smoke test** — `scripts/install-smoke.sh`

```bash
#!/usr/bin/env bash
# Offline smoke test for install.sh: build a fixture tarball matching the
# release layout, install it into a temp skills root, assert the result, then
# assert a re-run upgrades cleanly with no residue.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # repo root
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
[ "$count" = "10" ] || { echo "FAIL: expected 10 skill dirs, got $count"; exit 1; }
[ "$(cat "$root/.superpowers-reasonix/VERSION")" = "v0.0.0-test" ] || { echo "FAIL: VERSION marker wrong"; exit 1; }
[ -f "$root/.superpowers-reasonix/AGENTS.md" ] || { echo "FAIL: AGENTS.md not stashed"; exit 1; }
[ "$(wc -l < "$root/.superpowers-reasonix/manifest" | tr -d ' ')" = "10" ] || { echo "FAIL: manifest should list 10 dirs"; exit 1; }

# Re-run upgrades cleanly: drop a stray marker, ensure a second run removes our
# managed dirs and reinstalls without leaving the stray inside a managed dir.
touch "$root/not-ours.txt"
run
[ -f "$root/not-ours.txt" ] || { echo "FAIL: re-run clobbered unmanaged files"; exit 1; }
count2="$(find "$root" -maxdepth 1 -type d -name 'superpowers-*' | wc -l | tr -d ' ')"
[ "$count2" = "10" ] || { echo "FAIL: re-run left $count2 skill dirs"; exit 1; }

echo "PASS: install-smoke"
```

- [ ] **Step 2: Run it, expect FAIL** (no `install.sh` yet)

Run: `bash scripts/install-smoke.sh`
Expected: FAIL — `install.sh` not found / first assertion fails.

- [ ] **Step 3: Write `install.sh`**

```bash
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
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

# Remove a previous managed install (only the dirs WE recorded), if any.
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
```

- [ ] **Step 4: Make it executable and run the smoke test, expect PASS**

Run: `chmod +x install.sh scripts/install-smoke.sh && bash scripts/install-smoke.sh`
Expected: `PASS: install-smoke`

- [ ] **Step 5: Lint**

Run: `shellcheck install.sh scripts/install-smoke.sh`
Expected: no warnings (fix any).

- [ ] **Step 6: Commit**

```bash
git add install.sh scripts/install-smoke.sh
git commit -m "feat(install): one-line installer + offline smoke test"
```

---

### Task 2: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: a pushed tag `v*`.
- Produces: a GitHub Release for the tag with auto-generated notes and the asset `superpowers-reasonix-skills.tar.gz` whose archive root matches Task 1's expected layout.

- [ ] **Step 1: Write the workflow**

```yaml
name: release
on:
  push:
    tags: ["v*"]
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build release tarball
        run: |
          set -euo pipefail
          stage="$(mktemp -d)"
          cp -R skills "$stage/skills"
          cp AGENTS.md AGENTS.md.example reasonix.toml.example LICENSE "$stage/"
          echo "${GITHUB_REF_NAME}" > "$stage/VERSION"
          tar -czf superpowers-reasonix-skills.tar.gz -C "$stage" .
      - name: Create release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: superpowers-reasonix-skills.tar.gz
```

- [ ] **Step 2: Validate YAML + asset layout locally** (no tag push yet)

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml')); print('yaml ok')"
# dry-run the exact packaging the workflow does and confirm install.sh accepts it:
stage="$(mktemp -d)"; cp -R skills "$stage/skills"; cp AGENTS.md AGENTS.md.example reasonix.toml.example LICENSE "$stage/"; echo "v0.0.0-dry" > "$stage/VERSION"
tar -czf /tmp/sr.tgz -C "$stage" .
root="$(mktemp -d)"; REASONIX_SKILLS_DIR="$root" REASONIX_INSTALL_TARBALL=/tmp/sr.tgz bash install.sh
test -f "$root/superpowers-writing-plans/SKILL.md" && echo "asset layout ok"
```
Expected: `yaml ok` then `asset layout ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): build skills tarball + GitHub Release on v* tag"
```

---

### Task 3: CI — shellcheck + smoke test

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `install.sh`, `scripts/install-smoke.sh` from Task 1.
- Produces: a CI job step that lints `install.sh` and runs the smoke test on every push/PR.

- [ ] **Step 1: Read the current CI file** to match its style

Run: `cat .github/workflows/ci.yml`

- [ ] **Step 2: Add an installer job/steps** (append a job; keep existing jobs intact)

```yaml
  installer:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: shellcheck
        run: shellcheck install.sh scripts/install-smoke.sh
      - name: install smoke test
        run: bash scripts/install-smoke.sh
```

(If `ci.yml` has a top-level single job rather than a `jobs:` map with names, add these as steps to the existing job instead — preserve the file's existing shape.)

- [ ] **Step 3: Validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: shellcheck + install smoke test"
```

---

### Task 4: README — install one-liner + versioning note

**Files:**
- Modify: `README.md` (the `## Install` section, lines ~26–50; the "Versioning" paragraph, ~line 123)

- [ ] **Step 1: Replace the top of `## Install`** with the one-liner, demoting the manual options into a `<details>`

```markdown
## Install

**One-liner (recommended).** Downloads the latest release and installs the skills into your global Reasonix skills root, where they auto-load in every session:

​```bash
curl -fsSL https://raw.githubusercontent.com/christopherarter/superpowers-reasonix/main/install.sh | bash
​```

Re-run anytime to upgrade. Pin a release with `--version v1.0.0`. Skills land in `~/.reasonix/skills/` (override with `REASONIX_SKILLS_DIR`). For the always-on discipline, copy the bundled `AGENTS.md` into each project:

​```bash
cp ~/.reasonix/skills/.superpowers-reasonix/AGENTS.md <your-project>/AGENTS.md
​```

<details>
<summary>Manual install (for development, or to pin a checkout)</summary>

Skills load from several roots. Pick the one that fits.

[move the EXISTING three options here verbatim: point `[skills] paths`, symlink into global root, drop into one project — plus the existing AGENTS.md and Verify paragraphs]

</details>
```

(Preserve the existing manual content word-for-word inside the `<details>`; only the one-liner block is new.)

- [ ] **Step 2: Rewrite the "Versioning" paragraph** (under License & attribution)

```markdown
**Versioning:** released as semver git tags (`vX.Y.Z`) on [Releases](https://github.com/christopherarter/superpowers-reasonix/releases); the installer pulls the latest. The **skill set** is the versioned surface — retiring/renaming a skill is a minor or major bump, adding one a minor, body/wording refinements a patch. `bench/BASELINE.json` is meaningful relative to the commit that captured it.
```

- [ ] **Step 3: Verify links + render**

Run: `grep -n "releases/latest/download\|raw.githubusercontent.com/christopherarter/superpowers-reasonix/main/install.sh" README.md`
Expected: the one-liner URL present; confirm the `<details>` block still contains all three original manual options.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): one-line installer + semver versioning note"
```

---

### Task 5: Cut `v1.0.0` (human-gated)

**Files:** none (release operation). Do this only after Tasks 1–4 are merged to `main` and CI is green.

- [ ] **Step 1: Confirm `main` is green and up to date**

Run: `git checkout main && git pull && gh run list --branch main --limit 3`
Expected: latest CI run success.

- [ ] **Step 2: Tag and push**

```bash
git tag -a v1.0.0 -m "v1.0.0 — first versioned release"
git push origin v1.0.0
```

- [ ] **Step 3: Watch the release workflow**

Run: `gh run watch "$(gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId')"`
Expected: success; `gh release view v1.0.0` shows notes + the `superpowers-reasonix-skills.tar.gz` asset.

- [ ] **Step 4: End-to-end verify the published one-liner**

```bash
root="$(mktemp -d)"
REASONIX_SKILLS_DIR="$root" bash <(curl -fsSL https://raw.githubusercontent.com/christopherarter/superpowers-reasonix/main/install.sh)
ls "$root"/superpowers-* | head; cat "$root/.superpowers-reasonix/VERSION"
```
Expected: 10 skill dirs; `VERSION` == `v1.0.0`.

---

## Self-Review

**Spec coverage:** versioning/v1.0.0 (Global Constraints + Task 5) ✓; release CI + stable asset + auto notes (Task 2) ✓; install.sh behavior incl. `--version`, `$REASONIX_SKILLS_DIR`, in-place upgrade, AGENTS.md reminder (Task 1) ✓; discovery wiring resolved to flat+manifest (Global Constraints; supersedes the spec's open mechanic with its documented fallback) ✓; README one-liner + manual options kept + versioning rewrite (Task 4) ✓; testing = shellcheck + smoke test (Tasks 1, 3) ✓; rollout (Task 5) ✓.

**Placeholder scan:** README Task 4 Step 1 says "move the existing three options here verbatim" — that's an explicit instruction referencing concrete existing content (README lines ~30–50), not a TBD. All code blocks are complete.

**Type consistency:** asset name `superpowers-reasonix-skills.tar.gz`, support dir `.superpowers-reasonix`, manifest = newline-delimited skill dir names, tarball root layout (`skills/`, `VERSION`, `AGENTS.md`, …) — identical across Task 1 (install.sh + smoke test), Task 2 (release.yml), and Task 3. `VERSION` content = the tag (`GITHUB_REF_NAME`), matched by Task 5's expectation.
