# Anime365 for IINA

A vanilla JavaScript plugin for IINA 1.5.0. Search Anime365, choose an episode and translation, and watch in an IINA player window. Playback requires an Anime365 account with an active subscription.

Search uses [Anime365's existing website search](https://smotret-anime.org/catalog/search), including its ordering, spelling matching, pagination, and supported external catalog links. The plugin displays the returned titles and fetches episode details when you select a series.

## Install

1. Download the `.iinaplgz` installer from [GitHub Releases](https://github.com/gridness/anime365-stream/releases/latest).
2. In IINA, open Settings > Plugins and install the package. Enable **Anime365** and accept its declared network permission.
3. Choose Plugins > Browse Anime365. Sign in, search for a series, select an episode, and choose a translation.

For a local build before a release is published, install `dist/Anime365-1.0.0.iinaplgz` after running the build commands below. Development links also need to be enabled in Settings > Plugins.

## Sign in

Use your Anime365 email and password. “Remember me with macOS Keychain” saves only the access token. The password is never stored by the plugin. IINA's Keychain API does not provide a way for this plugin to require Touch ID.

For browser or social sign-in, choose “Use a browser token instead.” Open website login, sign in there, then choose “Get token.” Paste the returned `access_token` into the plugin. Treat it like a password. The public API app identifier is already configured; viewers do not need to register their own app.

Signing out stops playback and disables remembered sign-in. Viewing history stays on this Mac and reappears when the same Anime365 account signs in again. Clear history removes that account's saved episode positions. It does not affect other accounts.

## Playback

Continue watching shows one entry per series. It resumes the last unfinished episode, or offers the next regular episode after completion. Each episode retains its own position. Completion means reaching actual EOF; stopping during credits keeps the saved position.

Autoplay defaults to on and can be switched off in the playback controls. It advances through regular episodes in the same series. Specials and previews require manual selection. An unavailable next episode stops autoplay rather than being skipped.

Translation preferences match the language, dub/subtitle kind, author group, and TV or Blu-ray source. Missing or ambiguous matches show the picker. Changing translation or quality preserves the current position. Start over resets it. Quality defaults to the highest resolution; a remembered limit selects the best available resolution at or below it.

One plugin-managed player is reused. Other IINA windows remain independent. The plugin resolves fresh playback URLs each time and retries a recognized playback failure once before presenting Retry.

External subtitles from `subtitlesUrl`, including ASS, load into IINA after the video opens. Site-relative and protocol-relative subtitle links resolve to HTTPS, and HTTP subtitle links are upgraded to HTTPS. All subtitle URLs must pass the service/CDN domain allowlist.

V1 supports the authenticated API's `stream[].urls` entries containing one URL each. Multipart entries are reported as unsupported so an episode cannot silently stop after its first part. See [troubleshooting](docs/troubleshooting.md) for other host limitations.

## Development

No bundler or runtime dependencies are required. Host code is in `src/`; plain HTML, CSS, and DOM code are in `ui/`. Views use ordered classic scripts because native WebKit file loading rejected the template's module scripts.

With Node.js 24 and Python 3:

```sh
node scripts/check.mjs
node --test tests/*.test.js
python3 scripts/package.py
```

With Bun instead of Node.js:

```sh
bun scripts/check.mjs
bun test tests
python3 scripts/package.py
```

Packaging produces a deterministic `.iinaplgz` ZIP containing `Info.json`, `src/`, and `ui/` at its root. Tests, credentials, and development scripts are excluded.

On macOS, native view checks use Swift and WebKit:

```sh
swift scripts/check-webview.swift --search
swift scripts/check-webview.swift ui/sidebar/index.html
```

The native playback check requires installed IINA and ffmpeg:

```sh
python3 scripts/check-iina-runtime.py
```

It stages a temporary plugin with its own identity, requests public API data without credentials, and plays a generated local video and ASS subtitle through the actual controller and player. It checks background HTTP, native plugin messaging, subtitle selection and text, sidebar loading, and real EOF, then closes its process and removes its link. It does not verify subscriber media access.

IINA resolves HTTP promises on a background queue and calls global message listeners synchronously. Player creation runs in a main-loop timer callback; messages in both directions are deferred to separate turns to avoid a reproduced JavaScriptCore crash. Keep these boundaries when extending playback.

## Releases

Every main push runs syntax, manifest, behavior, and package checks. Release-please starts at `1.0.0`, maintains the changelog and version PR, and automatically merges a validated release candidate. The publication run builds the exact release SHA, attaches the installer and SHA-256 checksum, and publishes the draft release. Documentation and verification changes alone do not create releases.

Use Conventional Commit titles, such as `feat: add episode filters`, `fix: preserve resume position`, or `chore: update packaging`. See [release setup and recovery](docs/releases.md), [privacy and security](docs/security.md), and the source-linked [research notes](docs/research/).
