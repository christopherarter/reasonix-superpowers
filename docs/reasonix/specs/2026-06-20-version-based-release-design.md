# Version-Based Release — Design

## Goal

Replace the manual "point `[skills] paths` at a checkout" install story with a
**versioned-release** model:

- A one-line `curl … | bash` installer in the README that downloads the **latest
  tagged release** and installs the skills so they auto-load in every Reasonix
  session.
- Real **GitHub Releases** per version, with **auto-generated release notes** —
  giving a changelog and a reason to re-announce the project (the `v1.0.0`
  relaunch: it now has an evaluation bench, hardened skills, and better calling).

Non-goals (YAGNI): npm/Homebrew distribution, an auto-updater/daemon, signing,
multi-tool installers beyond Reasonix, a hand-maintained `CHANGELOG.md`.

## Versioning

- Semver git tags `vX.Y.Z`. **First release: `v1.0.0`** (deliberate maturation
  signal; the project has stabilized into its true shape).
- The **git tag is the single source of truth**. The release embeds it in a
  `VERSION` file inside the tarball; `package.json` stays `private` and is not
  the version source (no npm publish).
- Light policy, since the **skill set** is the public surface (no downstream code
  links against it — upgrade = re-install):
  - retire/rename a skill → minor or major (author's judgment), called out in notes
  - add a skill → minor
  - body/wording/description refinement, bench tweaks → patch

## Components

Four units, each independently testable:

### 1. Release packager (CI) — `.github/workflows/release.yml`

- **Trigger:** push of a tag matching `v*`.
- **Does:**
  1. Checks out the tag.
  2. Builds **`superpowers-reasonix-skills.tar.gz`** containing: `skills/`,
     `AGENTS.md`, `AGENTS.md.example`, `reasonix.toml.example`, `LICENSE`, and a
     generated `VERSION` file (the tag, e.g. `v1.0.0`). The asset name is
     **stable across versions** so `releases/latest/download/<name>` resolves
     without an API call.
  3. Creates the GitHub Release for the tag with `generate_release_notes: true`
     and uploads the tarball as a release asset.
- **Interface:** consumes a `v*` tag; produces a published Release + a stable-named
  asset. Uses `softprops/action-gh-release` (or `gh release create`) with
  `contents: write` permission.

### 2. Installer — `install.sh` (repo root)

- **Invocation (README one-liner):**
  `curl -fsSL https://raw.githubusercontent.com/christopherarter/superpowers-reasonix/main/install.sh | bash`
  The *script* is served from `main` (always current); the *payload* is the
  latest **release** tarball. They are decoupled on purpose.
- **Behavior:**
  - `set -euo pipefail`; verify `curl` and `tar` exist, fail with a clear message
    otherwise.
  - Resolve the download URL:
    - default: `…/releases/latest/download/superpowers-reasonix-skills.tar.gz`
    - `--version vX.Y.Z` → `…/releases/download/vX.Y.Z/superpowers-reasonix-skills.tar.gz`
  - Download to a temp dir, extract.
  - Install skills into the **managed dir** (default
    `~/.reasonix/skills/superpowers-reasonix/`, override via
    `$REASONIX_SKILLS_DIR`): remove the prior managed copy first, then place the
    new one (atomic-ish: extract to temp, then move into place) → clean in-place
    upgrade.
  - Write a small manifest/marker (the installed `VERSION`) so re-runs and
    uninstall are unambiguous.
  - Print: installed version, install path, and the reminder to copy `AGENTS.md`
    into each project for the always-on discipline (with the exact path inside
    the managed dir).
  - Idempotent: re-running upgrades to latest with no residue.
- **Interface:** input = optional `--version`, `$REASONIX_SKILLS_DIR`; output =
  skills on disk under the global root + a printed summary; exit non-zero on any
  failure.

### 3. Skill discovery wiring

The chosen model is **auto-load with zero config editing**, which relies on
Reasonix scanning the default `~/.reasonix/skills` root (confirmed a default
convention root — the bench config *excludes* it, and the README symlink recipe
drops skill dirs straight into it).

**Open mechanic, resolved at build time:** whether Reasonix discovers skills
nested one level down (`~/.reasonix/skills/superpowers-reasonix/<skill>/SKILL.md`)
at the *default* scan depth, or only when they sit flat in the root.

- Build step: install nested, run `reasonix doctor` / list skills, confirm all
  ten are discovered.
- **If nested works:** keep the clean namespaced managed dir (preferred — trivial
  upgrade/uninstall).
- **If only flat works:** the installer places each skill dir directly under
  `~/.reasonix/skills/` and records the installed dir names in a manifest file
  (e.g. `~/.reasonix/skills/.superpowers-reasonix.manifest`) so upgrade/uninstall
  removes exactly our dirs and nothing else. The README install section reflects
  whichever layout ships.

### 4. README + docs

- New **"Install (one-liner)"** as the recommended top of the Install section:
  the `curl … | bash` command, what it does, where it lands, that re-running
  upgrades, and the `AGENTS.md`-per-project reminder.
- Keep the existing manual options (`paths` at a checkout, symlink, per-project)
  below, framed as "manual / for development."
- Rewrite the **"Versioning"** note: now semver-tagged; the installer pulls the
  latest release; link to the Releases page and the skill-set versioning policy.

## Testing

- **`shellcheck install.sh`** — add a step to `.github/workflows/ci.yml`.
- **Installer smoke test** (committed script, run in CI and locally): build the
  tarball the same way the release workflow does, run `install.sh` against it
  with `HOME` and `$REASONIX_SKILLS_DIR` pointed at a temp dir (and the download
  URL overridable to the local tarball, e.g. a `$REASONIX_INSTALL_TARBALL` env
  hook), then assert: all ten `SKILL.md` files landed under the managed dir, the
  `VERSION` marker is correct, and a second run upgrades cleanly with no residue.
- **Release workflow** validated by cutting the real `v1.0.0` tag and confirming
  the Release, notes, and asset; the `releases/latest/download/…` URL then
  resolves for the installer.

## Rollout

1. Land `install.sh`, `release.yml`, `ci.yml` shellcheck step, and README changes.
2. Verify the discovery mechanic (component 3) and the smoke test locally.
3. Tag `v1.0.0`, push the tag, confirm the Release + asset, then run the README
   one-liner end-to-end against the published release.
