# Privacy and security

The public application identifier in `src/config.js` identifies the plugin. It is not a user credential. Passwords are passed unchanged to Anime365's official login API, never persisted by the plugin, and cleared from the form before submission. Only a verified access token can be saved in macOS Keychain.

Plugin preferences hold account IDs, series names, series and episode IDs, translation preferences, positions, and playback settings. History is local and separated by account. No watch progress is written to Anime365. Media URLs and credentials are absent from plugin history, preferences, UI state, and structured plugin logs.

IINA itself can retain playback URLs in native history and debug logs. The plugin's logical history is separate from those records. Signing out disables token restoration before attempting to clear the Keychain value. The API has no documented token-revocation endpoint, so local sign-out does not promise remote revocation.

## Boundary controls

- User inputs and API identities are validated in the host. Playback checks the current authenticated account and subscription.
- Requests use fixed HTTPS service URLs, explicit domains, bounded waits, and safe public errors. Search HTML is bounded, parsed as inert data, and never inserted as HTML into a view.
- Playback accepts the verified stream structure, HTTPS URLs, and explicitly allowed service/CDN domains. Embed pages and download entries are not playback sources.
- Views use a local Content Security Policy and DOM text nodes. Host-to-view payloads are hex encoded because IINA 1.5.0 interpolates JSON inside JavaScript template literals.
- The plugin requests network access without broad filesystem access. Keychain APIs cannot enforce Touch ID, and there is no documented native delete call, so sign-out overwrites the saved value and independently disables restoration.
- Automatic release merging accepts only the generated bot PR in this repository, only release metadata files, and the exact validated head SHA. Candidate manifests may change only `version` and `ghVersion`. Workflow actions are pinned to full commit hashes.

## Securability notes

Confidentiality, integrity, testability, and resilience drive the auth, HTML, playback, and native messaging boundaries. Applied ASVS guidance includes input validation and URL handling in V2.2, session storage in V3.5/V3.7 and V7.4, secret protection in V14.3, and safe diagnostics in V16.2/V16.5. Tests cover cross-account storage, secret-free errors/reports, unsafe URLs, message encoding, playback boundaries, and release candidate restrictions.

There is an explicit ASVS V14.2.1 exception: Anime365's published API requires passwords and tokens in HTTPS query parameters. The plugin passes them through IINA's request parameters and never opens those URLs in the browser or logs the options. The external service controls its own URL handling and logs. See the [first-party API evidence](research/anime365-api.md).
