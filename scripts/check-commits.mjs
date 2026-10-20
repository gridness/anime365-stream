import { execFileSync } from "node:child_process";

export const conventional = /^(feat|fix|perf|refactor|build|ci|chore|test|style|docs|revert)(\([a-zA-Z0-9_.\/-]+\))?!?: .+/;
export const documentation = (file) => /^(docs\/|tests\/|README\.md$|GLOSSARY\.md$|AGENTS\.md$|CHANGELOG\.md$|\.gitignore$|jsconfig\.json$|scripts\/check-(?:webview\.swift|iina-runtime\.py)$)/.test(file);

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

if (process.env.PR_TITLE) {
  if (!conventional.test(process.env.PR_TITLE)) throw new Error("Use a Conventional Commit PR title, such as feat: add episode search");
} else if (process.env.BASE_SHA) {
  const base = process.env.BASE_SHA;
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error("Invalid base SHA");
  const range = /^0+$/.test(base) ? "HEAD" : base + "..HEAD";
  const commits = git("rev-list", "--no-merges", range).split("\n").filter(Boolean);
  for (const commit of commits) {
    const files = git("diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit).split("\n").filter(Boolean);
    if (files.every(documentation)) continue;
    if (!conventional.test(git("show", "-s", "--format=%s", commit))) {
      throw new Error("Shipping commits need a Conventional Commit title: " + commit.slice(0, 12));
    }
  }
}
