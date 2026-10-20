# Keep v1 viewing history local

V1 is a public, English-language IINA plugin with Anime365 search, episode and translation selection, playback, and Continue watching. Viewing history stays on the device, and v1 does not update watched episodes or viewing progress on Anime365. This keeps the first release focused on playback without introducing rules for reconciling local and website progress.

Continue watching appears in the Anime365 browsing window and shows episode names and saved positions. It must reopen the corresponding episode even if its media URL changes, rather than depending solely on a previously resolved media URL in IINA's History menu.

Continue watching shows one entry per series. It resumes the last started unfinished episode, or offers the next episode after the previous one completes. Completion is recorded only when playback reaches its end, so stopping during credits still offers Resume.

Viewing history is separate for each Anime365 account on the device. Signing out retains that account's history, which becomes visible again when the same account signs in. The plugin provides a Clear history action.

The plugin stores episode and translation identities and playback positions locally, and resolves media when playback starts. IINA handles playback and seeking; its native history is not the source of truth for Continue watching. This supports stable episode identity without adding the filesystem permission required by IINA 1.5.0's stable-page URL hook. The [IINA research](../research/iina-1.5.0.md#native-history-and-continue-watching) records that trade-off.
