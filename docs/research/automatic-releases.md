# Automatic release facts

Checked on 2026-10-20 against IINA's `v1.5.0` source and official upstream documentation. This note records tooling constraints and an implementation proposal. The later release-please section reflects the user's selected version policy.

## Packaging

The installed `/Applications/IINA.app/Contents/MacOS/iina-plugin --help` lists `pack <dir>`. Read-only `file` inspection identifies that bundled CLI as a macOS Mach-O executable for Intel and Apple Silicon. Neither command created a package or changed the app.

The pinned `packPlugin` implementation:

- Requires `Info.json` in the supplied directory and parses its `version` string.
- Names the archive `<directory-name>-<version>.iinaplgz` in the caller's current directory.
- Prompts before overwriting an existing output.
- Runs ordinary ZIP packaging inside the plugin directory, with `node_modules/*` and `.*` exclusion patterns, and preserves symlinks.
- Does not apply `.gitignore`, select only runtime files, check JavaScript syntax, validate remaining manifest fields, or verify referenced files.

The archive contains `Info.json` at its root. It has no enclosing plugin directory. Files such as non-hidden documentation, tests, and packaging scripts are not automatically excluded. [IINA 1.5.0 pack implementation](https://github.com/iina/iina/blob/v1.5.0/iina-plugin/main.swift)

A vanilla plugin needs packaging and validation without compilation or bundling. A normal ZIP writer on a Linux CI runner can produce the same archive structure. This follows from the pack implementation and installer format; running the macOS CLI is not a format requirement. A CI-created package still needs an installation check in IINA. Stage an explicit set of runtime files before archiving, validate the manifest and referenced files, and inspect the archive contents. These are proposed verification steps, not behavior provided by the CLI.

## GitHub installation and update detection

IINA 1.5.0 uses separate sources for installation and update discovery:

| Operation | Source |
| --- | --- |
| Install from a GitHub repository | First `.iinaplgz` asset returned by `releases/latest` |
| Installation fallback | Repository `archive/main.zip` |
| Discover an available plugin update | Repository `main/Info.json` |
| Decide whether it is newer | Remote integer `ghVersion` exceeds installed `ghVersion` |
| Display its version | Remote `version` string |

The installed manifest needs `ghRepo` and `ghVersion` for that update check. `updated()` uses the GitHub installation path again and checks that the plugin identifier matches. Artifact-only version stamping therefore leaves update discovery stale. Publish matching `version` and `ghVersion` in the archive and the root manifest on `main`. A change to the display version alone does not trigger an update. [Pinned installer and updater](https://github.com/iina/iina/blob/v1.5.0/iina/JavascriptPlugin.swift#L228-L291), [comparison logic](https://github.com/iina/iina/blob/v1.5.0/iina/JavascriptPlugin.swift#L468-L499)

GitHub's latest-release endpoint returns a published release rather than a draft or prerelease. A release intended for ordinary IINA repository installation must therefore be eligible for that endpoint and have its package uploaded. This also means publishing several alternative `.iinaplgz` assets introduces an avoidable selection ambiguity. [GitHub release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)

These sources can disagree temporarily during a failed or overlapping release. A release implementation should serialize publication, keep the advertised manifest consistent with the downloadable artifact, and make reruns reuse an existing version instead of inventing another one. The exact transaction order and retry behavior are implementation decisions to verify.

## GitHub Actions constraints

GitHub supplies a repository-scoped `GITHUB_TOKEN` for workflow jobs. The workflow can request its needed permissions explicitly. Creating a release requires repository Contents write permission; repository or organization restrictions can still limit the token. No personal access token is inherently required for a release from the repository's own workflow. [Token documentation](https://docs.github.com/en/actions/concepts/security/github_token), [release permissions](https://docs.github.com/en/rest/releases/releases#create-a-release)

Pushes and tags created with `GITHUB_TOKEN` do not trigger another ordinary push workflow. Release publication with that token also does not automatically start an independent release-event workflow. Keep validation, versioning, packaging, tagging, and release publication in one workflow execution, or invoke dependent work explicitly through a supported dispatch/reusable workflow. A bot version commit made during that execution must be validated and packaged there. [Workflow-trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

Direct bot commits to `main` depend on that branch's rules. Required pull requests or protected-branch requirements can prevent them even when the workflow has write permission. Automatic versioning needs a deliberate policy for how its manifest commit reaches `main`; broad bypass permissions should not be assumed. [Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

## Repository state and open choices

Read-only repository inspection during this session found `gridness/anime365-stream` public and empty remotely. Local `main` has no commits and the existing project files are untracked. No release, workflow, commit, tag, or remote configuration was created during this research. [Repository](https://github.com/gridness/anime365-stream)

The user requested builds from `main`, automatic GitHub Releases, automatic versioning, a `.iinaplgz` package, and GitHub installation instructions. The initial research left these choices open:

- How commits determine a semantic version, such as Conventional Commits or a patch increment per eligible push.
- Whether the first public release is `0.1.0` or `1.0.0`.
- Whether changes limited to documentation produce releases.
- How version and release metadata reach `main` while respecting its branch rules.

Regardless of the policy, increment `ghVersion` monotonically and keep the manifest, tag, release, and package tied to the same release contents. The current source layout does not require npm dependencies merely to package the plugin.

## Release-please configuration and automatic orchestration

The user subsequently selected release-please, an initial release of `1.0.0`, and checks without releases for changes limited to documentation. The configuration and sequence below are a proposal to implement those choices, not deployed behavior.

Use release-please's manifest mode for the root package. The relevant configuration is:

```json
{
  "packages": {
    ".": {
      "release-type": "simple",
      "package-name": "anime365-stream",
      "initial-version": "1.0.0",
      "version-file": "version.txt",
      "include-component-in-tag": false,
      "extra-files": [
        { "type": "json", "path": "Info.json", "jsonpath": "$.version" }
      ],
      "exclude-paths": ["docs", "README.md", "GLOSSARY.md", "AGENTS.md"]
    }
  }
}
```

The schema supports `initial-version`, `version-file`, JSON extra files, and excluded paths. An excluded-path commit is skipped only when all its changed files are excluded. Define the documentation paths explicitly; a mixed runtime/documentation commit must still count. Keep ordinary validation triggered for documentation changes. [Configuration schema](https://github.com/googleapis/release-please/blob/main/schemas/config.json), [JSON updates](https://github.com/googleapis/release-please/blob/main/docs/customizing.md#updating-arbitrary-json-files)

Create `version.txt` as the simple strategy's plain version file. Pointing that option at `Info.json` would replace the JSON with a version string. For an unreleased repository, begin with an empty `.release-please-manifest.json`; an entry declaring `1.0.0` instead tells release-please that version is already current. The first proposal uses `initial-version` when there is no previous release. [Simple strategy](https://github.com/googleapis/release-please/blob/main/src/strategies/simple.ts), [plain-file updater](https://github.com/googleapis/release-please/blob/main/src/updaters/default.ts), [bootstrap semantics](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md#initial-version), [initial version selection](https://github.com/googleapis/release-please/blob/main/src/strategies/base.ts#L521-L549)

When using the action with config and manifest files, omit its `release-type` input. Supplying that input makes the action build inline configuration instead of loading the manifest configuration. The PR outputs are `prs_created` and JSON `pr`/`prs`; fetch the resulting PR to obtain its final head SHA after any additional metadata commit. Root release outputs include `release_created`, `version`, `tag_name`, and `sha`. Package the returned release SHA. [Action configuration and outputs](https://github.com/googleapis/release-please-action), [action config loading](https://github.com/googleapis/release-please-action/blob/main/src/index.ts#L82-L128)

Default versioning chooses major for breaking changes, minor for `feat`/`feature`, and patch otherwise. However, an empty generated changelog suppresses a release PR. Configure visible `changelog-sections` for every permitted Conventional Commit type, including maintenance types that should yield patch releases. Exclude documentation by paths, rather than hiding every `docs` commit regardless of its files. Enforce the accepted commit grammar for runtime changes; release-please cannot promise a patch release for an arbitrary unparseable message through these settings alone. [Version selection](https://github.com/googleapis/release-please/blob/main/src/versioning-strategies/default.ts), [empty-changelog gate](https://github.com/googleapis/release-please/blob/main/src/strategies/base.ts#L263-L322)

JSON extra-file updates write the semantic version; they do not increment an independent integer. After release-please updates its PR, set its `Info.json.ghVersion` to the current base manifest's integer plus one. Repeating the operation against the same base must produce the same value. Commit that adjustment to the generated release branch before validation, so the merged main manifest and package agree. [JSON updater](https://github.com/googleapis/release-please/blob/main/src/updaters/generic-json.ts)

### Proposed minimum sequence

1. On an eligible main push, validate main and run release-please with `skip-github-release: true` to create or update its release PR.
2. Verify that PR belongs to this repository, targets main, and is the expected generated release branch. Apply the idempotent integer update, then read its final head SHA.
3. Check out and validate that exact SHA, including version agreement and staged-package contents. The existing main workflow can perform this directly. A checkout of another SHA does not move the workflow's own GitHub check result to that SHA.
4. Post a commit status for the validated head if branch protection requires an attached result. Merge through GitHub's API with its `sha` parameter equal to the validated head. If main changed, refresh and revalidate the candidate rather than reusing stale evidence. Confirm the merge result.
5. Explicitly dispatch a main publication run with the merged PR number/SHA. Run release-please with `skip-github-pull-request: true`, then validate and package its returned release `sha`, attach the `.iinaplgz`, and complete publication. Reruns must repair missing assets without assigning another version. Using a draft release until upload completes avoids exposing an assetless new latest release.

The action supports both skip inputs. The merge API accepts an expected head SHA and returns a conflict if it changed. Workflow dispatch accepts a branch/tag reference plus declared inputs and requires Actions write permission. The workflow file must exist on the default branch. [Action inputs](https://github.com/googleapis/release-please-action#action-inputs), [merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request), [dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event), [dispatch event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)

Current GitHub documentation says PR events caused by `GITHUB_TOKEN` create approval-required runs, while dispatch events run normally. Bot merges still do not cause another ordinary push run. This sequence therefore verifies the candidate explicitly and dispatches publication; it does not depend on automatic PR-event checks or bot self-approval. [Current token event rules](https://docs.github.com/en/actions/concepts/security/github_token)

The built-in token can create check runs with `checks: write`, or simpler commit statuses with `statuses: write`. No separate GitHub App is inherently needed for those writes. Use `contents: write`, `pull-requests: write`, and `issues: write` where release-please needs them, `statuses: write` only for the status publisher, and `actions: write` only for dispatch. Repository settings must permit Actions to create PRs. Independent required reviews or branch rules can still prevent unattended merging; the workflow must respect them. [Token permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions), [commit-status API](https://docs.github.com/en/rest/commits/statuses#create-a-commit-status)

Merging the release PR advances the manifest IINA reads before the release asset is published. A failed publication can therefore temporarily advertise a version whose package is not yet available. Keep the publication path immediate and recoverable, serialize release runs, and check that current main metadata agrees with the completed latest package. This ordering constraint remains even with release-please.
