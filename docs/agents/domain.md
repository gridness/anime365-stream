# Domain docs

This repo uses a single-context layout:

- `GLOSSARY.md` at the repo root defines domain terms.
- `docs/adr/` holds architectural decision records, numbered
  `0001-<decision>.md`, `0002-<decision>.md`, and so on.

## Before exploring

Read the root glossary and ADRs relevant to the area being explored.

If these files do not exist, proceed silently. The `domain-modeling` skill
creates them when terms or decisions are resolved.

## Vocabulary

Use glossary terms in issue titles, proposals, hypotheses, and test names.
Follow any guidance about synonyms to avoid.

If a needed concept is missing, reconsider whether the project uses it.
Note a real vocabulary gap for `domain-modeling`.

## Decision conflicts

If a proposal contradicts an ADR, identify the ADR and explain why the
decision should be reconsidered.
