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

test("publication finds an untagged draft when GitHub's tag lookup returns 404", async () => {
  const { findRelease } = await import("../scripts/release.mjs");
  const draft = { id: 1, tag_name: "v1.0.0", draft: true };
  const api = { async request(route) {
    if (route === "releases/tags/v1.0.0") return null;
    assert.equal(route, "releases?per_page=100");
    return [{ id: 2, tag_name: "v0.9.0", draft: true }, draft];
  } };
  assert.equal(await findRelease(api, "v1.0.0"), draft);
});

test("draft discovery ignores other versions and leaves published tag lookup unchanged", async () => {
  const { findRelease } = await import("../scripts/release.mjs");
  const published = { id: 1, tag_name: "v1.0.0", draft: false };
  const direct = { async request(route) {
    assert.equal(route, "releases/tags/v1.0.0");
    return published;
  } };
  assert.equal(await findRelease(direct, "v1.0.0"), published);
  const missing = { async request(route) {
    return route.startsWith("releases/tags/") ? null : [{ id: 2, tag_name: "v0.9.0", draft: true }];
  } };
  assert.equal(await findRelease(missing, "v1.0.0"), null);
});
