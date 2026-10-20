# Release setup and recovery

The workflows are in `.github/workflows/checks.yml` and `release.yml`. They use Node.js 24 and Python 3 without installing project dependencies. The local source layout remains directly loadable by IINA.

## Repository setup

Publish this source on the repository's `main` branch. In Settings > Actions > General, allow GitHub Actions to create pull requests. GitHub exposes that capability in its combined create/approve PR setting. The workflow does not submit approving reviews.

The release job explicitly requests Contents, Pull requests, Issues, Statuses, and Actions write permissions for release-please, release metadata, exact-head validation, merging, and dispatch. No personal access token is required. Required independent reviews or branch rules remain enforced and may prevent unattended merging. Squash merging must be enabled.

An unreleased repository begins with an empty `.release-please-manifest.json`; `initial-version` is `1.0.0`. Do not insert `1.0.0` into the manifest before its first release. Release-please maintains it after publication. `version.txt` and `Info.json.version` must agree.

## Automatic sequence

1. Validate main and run release-please. Eligible Conventional Commits create or update its release PR. Documentation and verification paths are excluded from version calculation.
2. Accept only the bot's expected release branch, in this repository, targeting main. Permit changes only to `Info.json`, `version.txt`, `CHANGELOG.md`, and `.release-please-manifest.json`.
3. Set `Info.json.ghVersion` to main's value plus one. Check out the final candidate SHA, validate its manifest and behavior, and build its installer. Confirm main has not advanced.
4. Post a `release-candidate` status and merge with the validated expected SHA. Dispatch the release workflow explicitly; a `GITHUB_TOKEN` merge does not trigger an ordinary push run.
5. Release-please creates a draft release. Validate and package its exact SHA, attach one `.iinaplgz` asset and `SHA256SUMS`, then publish it.

IINA discovers updates through `main/Info.json` and compares the increasing integer `ghVersion`. It installs from the latest published release. Those manifests must match. The brief interval between merging version metadata and publishing assets cannot be made atomic across these separate endpoints.

## Recovery

For a failed candidate validation, correct the underlying code on main and rerun Release. Do not merge a different head using stale validation. For a branch-rule or Actions permission failure, change the relevant repository setting or fulfill the required review, then rerun. The workflow does not bypass those rules.

For an interrupted draft upload, rerun Release from Actions > Release > Run workflow on main. Publication reuses the draft, replaces incomplete draft assets, and publishes after both artifacts are attached. Existing published assets are verified by SHA-256 and are never silently replaced with different bytes.

Keep a draft's exact target SHA available. Publication accepts release-please's returned SHA or the draft's exact `target_commitish`; it refuses an ambiguous branch name. See [source-linked release research](research/automatic-releases.md) for the GitHub and IINA contracts.
