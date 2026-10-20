# Troubleshooting

## Browse Anime365 is missing

Open IINA Settings > Plugins and enable Anime365. Installing or linking a development plugin does not automatically enable it. Restart IINA after changing host scripts or network domains. Reopening Browse Anime365 reloads the view, but does not reload host code.

## The window is blank

Install the current package and restart IINA. The template's `type="module"` scripts failed under IINA's native file-loading configuration. Current views use ordered classic scripts and display a loading message even before JavaScript starts.

## Search behaves differently

The plugin uses `/catalog/search?q=...&page=...`, rather than the API's differently ranked `/api/series?query=...`. Results retain website order. Load more keeps the submitted query even if you edit the field. Submit a new search to use the edited query.

The HTML reader extracts only text and numeric series IDs. If Anime365 changes its page structure, the plugin displays a search compatibility error instead of guessing at unrelated links or treating a service error as no results.

## Sign-in or playback is rejected

Sign-in and subscription status are checked separately. Renew an expired subscription on Anime365, then retry. For social-only accounts, use browser sign-in and token import. If Keychain cannot save or read the token, the plugin reports that sign-in is available only for the current session.

## A safe compatibility report appears

Copy the report shown in the plugin. It contains field names, types, array counts, and hostnames. It excludes token values, media paths, and query strings. Share that report with the maintainer. Do not share the raw API response, password, access token, or playback URL.

The verified response contains `stream: [{height, urls: ["https://..."]}]`, separate `download` entries, and an optional `subtitlesUrl`. External ASS subtitles load through IINA's subtitle API. The plugin resolves `/...` subtitle links against `https://smotret-anime.org`, adds HTTPS to `//host/...` links, and upgrades HTTP subtitle links to HTTPS before validating them. Signed paths and query strings are preserved. The observed media CDN is `quantum-phantom-moon.ru`. New media or subtitle domains require verification and an allowlist update.

Multiple URLs inside one stream represent a multipart format in Anime365's website player. V1 reports that format as unsupported. It does not select the first part or treat the parts as mirrors.

## Playback stops

Recognized opening failures, timeouts, and truncated EOF trigger one fresh resolution of the same translation. A second failure offers Retry. Manual Stop saves progress and does not restart playback.

IINA 1.5.0 exposes `end-file` without its reason. Some failures during playback therefore cannot be distinguished from manual Stop. In that case use Retry. Only actual `eof-reached` marks an episode complete.

## IINA quits when playback starts

Use the current plugin and restart IINA. Earlier development code made synchronous callbacks between the global and player JavaScript contexts, which reproduced a native JavaScriptCore crash even with a local test clip. Current code defers both message directions and creates players on the main run loop. The native runtime check exercises that flow without account data.

For a new crash, share the IINA version, action, and exception/stack summary. IINA's own history and debug logs may contain signed playback URLs, so do not post complete logs without reviewing them.
