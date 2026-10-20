const { test } = require("node:test");
const assert = require("node:assert/strict");

test("automatic release merge refuses source changes and foreign PRs", async () => {
  const { validateCandidate } = await import("../scripts/release.mjs");
  const repository = "gridness/anime365-stream";
  const pr = { state: "open", user: { login: "github-actions[bot]" },
    base: { ref: "main", repo: { full_name: repository } },
    head: { ref: "release-please--branches--main", sha: "a".repeat(40), repo: { full_name: repository } } };
  const files = [{ filename: "Info.json", status: "modified" }];
  assert.doesNotThrow(() => validateCandidate(pr, files, repository));
  assert.throws(() => validateCandidate(pr, [{ filename: "src/global.js", status: "modified" }], repository));
  assert.throws(() => validateCandidate({ ...pr, user: { login: "contributor" } }, files, repository));
  assert.throws(() => validateCandidate({ ...pr, head: { ...pr.head, repo: { full_name: "other/repo" } } }, files, repository));
  assert.throws(() => validateCandidate(pr, [{ filename: "Info.json", status: "renamed" }], repository));
});

test("release metadata changes preserve permissions and advance IINA's counter exactly once", async () => {
  const { validateVersionChange } = await import("../scripts/release.mjs");
  const base = { version: "1.0.0", ghVersion: 1, permissions: ["network-request"] };
  const next = { ...base, version: "1.1.0", ghVersion: 2 };
  assert.doesNotThrow(() => validateVersionChange(base, next));
  assert.throws(() => validateVersionChange(base, { ...next, permissions: ["file-system"] }));
  assert.throws(() => validateVersionChange(base, { ...next, ghVersion: 1 }));
  assert.throws(() => validateVersionChange(base, { ...next, version: "invalid" }));
});
