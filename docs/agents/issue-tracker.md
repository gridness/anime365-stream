# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `gridness/anime365-stream`.
Use `gh` from this clone, or pass `--repo gridness/anime365-stream` explicitly.

## Issue operations

- Create: `gh issue create --title "<title>" --body-file <file>`.
- Read with labels and comments: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`. Add label filters as needed.
- Comment: `gh issue comment <number> --body-file <file>`.
- Update the body: `gh issue edit <number> --body-file <file>`.
- Add or remove labels: `gh issue edit <number> --add-label "<label>"` or `--remove-label "<label>"`.
- Close: `gh issue close <number>`.

For multiline bodies and comments, write the exact text to a temporary file and
pass it with `--body-file`.

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read the issue with its labels and comments.

## Pull requests as a triage surface

**PRs as a request surface: no.**

If enabled later, use the `gh pr` equivalents for reading, commenting, labeling,
and closing. Read the diff with `gh pr diff <number>`.
Issues and PRs share a number space. For an ambiguous reference, try
`gh pr view <number>`, then `gh issue view <number>`.

## Wayfinding operations

- Map: one issue labeled `wayfinder:map`, with Notes, Decisions-so-far, and Fog.
- Child ticket: create with `gh issue create --parent <map-number>`, or attach
  with `gh issue edit <map-number> --add-sub-issue <child-number>`.
  Use `wayfinder:<type>` labels with `research`, `prototype`, `grilling`, or `task`.
- Blocking: use native dependencies with
  `gh issue edit <child-number> --add-blocked-by <blocker-number>`.
  A ticket is unblocked when every blocker is closed.
- Frontier: inspect the map's open children in map order. Select the first
  unassigned ticket with no open blockers.
- Claim: `gh issue edit <number> --add-assignee @me`.
- Resolve: comment with the result, close the ticket, and append a summary
  and link to the map's Decisions-so-far.

If sub-issues are unavailable, use a task list in the map and
`Part of #<map-number>` in each child. If dependencies are unavailable, use
`Blocked by: #<number>` lines and check the referenced issues' states.
