# Use a browsing window and a playback sidebar

Search and Continue watching use a dedicated Anime365 window, while episode and translation controls remain in IINA's sidebar during playback. This gives browsing enough space without requiring the viewer to return to the browsing window to choose another episode.

Translation choices are remembered per series. If the chosen translation is unavailable for another episode, the plugin shows the translation picker. Autoplay is available through a toggle and defaults to on.

A remembered translation must match language, dub/subtitle type, credited group, and TV or Blu-ray source. Missing or ambiguous matches show the picker. Changing the translation during playback preserves the current timestamp, with Start over available separately.

Autoplay advances through regular episodes within the same series. Previews and specials require manual selection, and playback stops at the series end. Playback resolution defaults to the highest available, with a selector when alternatives exist and a remembered quality preference.

The plugin reuses one Anime365 playback window. Selecting another episode saves the current playback position before switching, and other IINA windows remain independent.

On a playback or network failure, the plugin tries resolving the same translation once more and resumes at the saved position. Another failure stops playback and presents Retry. It never skips an unavailable episode automatically, and authentication or subscription errors immediately show the relevant action.
