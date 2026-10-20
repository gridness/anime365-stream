# Automate packaging and releases from main

V1 delivery includes an installable `.iinaplgz` archive, GitHub installation instructions, and setup and troubleshooting documentation. Builds, version assignment, and GitHub Releases are automated from `main`; IINA plugin-store submission remains a later release step. This keeps the direct vanilla JavaScript source layout while making releases reproducible without manual version edits or uploads.

The automation must synchronize the committed `Info.json` version and increasing `ghVersion` with the published package. IINA 1.5.0 checks `main/Info.json` to discover updates and prefers a `.iinaplgz` asset from the latest GitHub Release when installing them. Stamping a version only into the archive would leave update discovery stale. See the [version-pinned updater](https://github.com/iina/iina/blob/v1.5.0/iina/JavascriptPlugin.swift#L468-L499).

Release-please assigns semantic versions from Conventional Commits, starting at `1.0.0`. Features produce minor releases, fixes and maintenance produce patches, and breaking changes produce majors. Changes limited to documentation or verification do not publish a release.

Release-please maintains a release PR containing the version, changelog, and release manifest. Automation sets `ghVersion` to the current main value plus one, validates that exact PR head, and merges it automatically using an expected SHA. It accepts only the generated bot PR and the four release metadata files. Repository rules still apply.

After merging, automation explicitly dispatches publication on main because a merge made with `GITHUB_TOKEN` does not trigger an ordinary push workflow. The release stays a draft until the package and checksum are attached. Rerunning publication reuses the same release and verifies existing artifacts. The [release research](../research/automatic-releases.md) records the API and updater constraints.
