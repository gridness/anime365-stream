# Project

This is an IINA plugin written in vanilla JavaScript. Its intended purpose is to
stream anime directly from smotret-anime.org.

The current code is the plugin template. It loads placeholder views and registers
window and overlay menu actions. Site integration and stream playback are not
implemented yet.

# Working conventions

- Keep the plugin in vanilla JavaScript with plain HTML and CSS for its views.
  Preserve the direct source layout unless a task requires build tooling.
- Match the existing two-space indentation and double-quoted JavaScript strings.
- In Russian output, use е instead of the letter with two dots above it.
- Use IINA's host APIs in plugin code. Verify API availability before adding
  calls; browser APIs and Node.js APIs are not interchangeable with the host API.
- Keep host operations in `src/` and DOM handling in `ui/`. When connecting them,
  verify IINA's messaging API for the relevant view.

# Where changes belong

- `Info.json` declares plugin metadata, entry points, permissions, allowed
  domains, and preferences. Keep its paths consistent with the actual files.
- `src/index.js` uses the injected `iina` object to register menu actions and load
  the standalone window, overlay, and sidebar. Overlay and sidebar setup currently
  runs on `iina.window-loaded`; preserve that lifecycle when extending it.
- `src/global.js` is the global entry point and currently only logs startup.
- `ui/window/`, `ui/sidebar/`, and `ui/overlay/` each contain an HTML page and an
  empty JavaScript module. Their scripts load with `type="module"`.
- `jsconfig.json` points to optional local IINA type definitions under
  `node_modules/iina-plugin-definition`. Those dependencies are not included.

The manifest still has template metadata and an unrestricted `allowedDomains`
list. It also references `pref.html`, which does not exist. Account for these
placeholders when working on configuration or packaging.

# Verification

There is no package manifest, build command, linter, or automated test suite.
Document any tooling introduced by a task alongside its runnable commands.

- For JavaScript changes, check syntax with an available parser. With Node.js,
  use `node --check src/index.js` and `node --check src/global.js` for host scripts,
  and `node --input-type=module --check < ui/window/index.js` for a UI module,
  substituting the changed view's path.
- For manifest or view changes, validate JSON and check that referenced entry
  points, HTML files, and scripts exist.
- Verify host behavior in IINA. For changes to the existing template, check
  startup logs, the Show Window action, the sidebar, and both overlay actions.
  Once streaming exists, exercise the changed playback flow and its failure case.
- Report which checks ran and whether IINA was available. Syntax checks alone
  do not verify IINA integration.

## Agent skills

### Issue tracker

Issues and specs use GitHub Issues in `gridness/anime365-stream`. Read `docs/agents/issue-tracker.md` before ticket operations.

### Triage labels

Use the five default triage labels. Read `docs/agents/triage-labels.md` before applying triage labels.

### Domain docs

Use a single-context layout with root `GLOSSARY.md` and `docs/adr/`. Read `docs/agents/domain.md` before exploring domain concepts or decisions.
