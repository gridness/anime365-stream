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

test("release validation uses the counter commit even when GitHub's PR head is stale", async () => {
  const { synchronizeReleaseCounter } = await import("../scripts/release.mjs");
  const previousSHA = "a".repeat(40);
  const updatedSHA = "b".repeat(40);
  const base = { version: "1.0.0", ghVersion: 1 };
  const candidate = { value: { ...base }, sha: "c".repeat(40) };
  const pr = { number: 1, head: { ref: "release-please--branches--main", sha: previousSHA } };
  const api = { async request(route, method, body) {
    if (method === "PUT") {
      assert.equal(route, "contents/Info.json");
      assert.equal(JSON.parse(Buffer.from(body.content, "base64")).ghVersion, 2);
      assert.equal(body.sha, candidate.sha);
      assert.equal(body.branch, pr.head.ref);
      return { commit: { sha: updatedSHA } };
    }
    return pr;
  } };
  assert.equal(await synchronizeReleaseCounter(api, pr, base, candidate), updatedSHA);
});

test("release recovery reuses a candidate whose counter is already synchronized", async () => {
  const { synchronizeReleaseCounter } = await import("../scripts/release.mjs");
  const base = { version: "1.0.0", ghVersion: 1 };
  const candidate = { value: { ...base, ghVersion: 2 }, sha: "c".repeat(40) };
  const pr = { number: 1, head: { ref: "release-please--branches--main", sha: "b".repeat(40) } };
  const api = { async request() { assert.fail("Recovery must not create another counter commit"); } };
  assert.equal(await synchronizeReleaseCounter(api, pr, base, candidate), pr.head.sha);
});
