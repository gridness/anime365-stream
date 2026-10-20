import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const allowedFiles = new Set(["Info.json", "version.txt", "CHANGELOG.md", ".release-please-manifest.json"]);
const hash = (value) => createHash("sha256").update(value).digest("hex");

export function validateCandidate(pr, files, repository) {
  assert.equal(pr.state, "open");
  assert.equal(pr.user.login, "github-actions[bot]");
  assert.equal(pr.base.ref, "main");
  assert.equal(pr.base.repo.full_name, repository);
  assert.equal(pr.head.repo.full_name, repository);
  assert.match(pr.head.ref, /^release-please--branches--main(?:--[a-zA-Z0-9-]+)?$/);
  assert.match(pr.head.sha, /^[a-f0-9]{40}$/);
  assert.ok(files.length > 0 && files.length <= allowedFiles.size);
  for (const file of files) {
    assert.ok(allowedFiles.has(file.filename), "Release PR changes a runtime or unexpected file");
    assert.ok(["added", "modified"].includes(file.status), "Release PR must not rename or delete files");
  }
}

export function validateVersionChange(base, candidate) {
  const strip = ({ version, ghVersion, ...rest }) => rest;
  assert.deepEqual(strip(candidate), strip(base), "Release PR changed plugin configuration");
  assert.match(candidate.version, /^\d+\.\d+\.\d+$/);
  assert.equal(candidate.ghVersion, base.ghVersion + 1);
  assert.ok(Number.isSafeInteger(candidate.ghVersion));
}

export async function synchronizeReleaseCounter(api, pr, base, candidate) {
  const manifest = { ...candidate.value, ghVersion: base.ghVersion + 1 };
  validateVersionChange(base, manifest);
  if (candidate.value.ghVersion === manifest.ghVersion) return pr.head.sha;
  const update = await api.request("contents/Info.json", "PUT", {
    message: "chore: synchronize IINA release counter",
    content: Buffer.from(JSON.stringify(manifest, null, 2) + "\n").toString("base64"),
    sha: candidate.sha, branch: pr.head.ref,
  });
  // ASVS 15.4.2: validate the write's exact commit; PR metadata may still show its previous head.
  assert.match(update.commit.sha, /^[a-f0-9]{40}$/);
  return update.commit.sha;
}

function subprocess(command, args, cwd = process.cwd()) {
  const environment = { ...process.env };
  delete environment.GH_TOKEN;
  delete environment.GITHUB_TOKEN;
  return execFileSync(command, args, { cwd, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function client(repository, token) {
  async function request(route, method = "GET", body, missing = false) {
    const response = await fetch("https://api.github.com/repos/" + repository + "/" + route, {
      method,
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new Error("GitHub operation failed: " + method + " " + route.split("?")[0] + " (" + response.status + ")");
    return response.status === 204 ? null : response.json();
  }
  return { request, token, repository };
}

async function readJSON(api, file, ref) {
  const value = await api.request("contents/" + file + "?ref=" + encodeURIComponent(ref));
  assert.equal(value.encoding, "base64");
  return { value: JSON.parse(Buffer.from(value.content, "base64").toString("utf8")), sha: value.sha };
}

function worktree(sha) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  subprocess("git", ["fetch", "--no-tags", "origin", sha]);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "anime365-release-"));
  const directory = path.join(temporary, "source");
  subprocess("git", ["worktree", "add", "--detach", directory, sha]);
  return {
    directory,
    clean() {
      subprocess("git", ["worktree", "remove", "--force", directory]);
      fs.rmSync(temporary, { recursive: true, force: true });
    },
  };
}

function validate(directory) {
  subprocess(process.execPath, ["scripts/check.mjs"], directory);
  const tests = fs.readdirSync(path.join(directory, "tests")).filter((file) => file.endsWith(".test.js")).map((file) => "tests/" + file);
  subprocess(process.execPath, ["--test", ...tests], directory);
  subprocess("python3", ["scripts/package.py"], directory);
}

async function upload(api, release, filename, content) {
  const previous = release.assets.find((asset) => asset.name === filename);
  if (previous && !release.draft) {
    if (previous.digest) assert.equal(previous.digest, "sha256:" + hash(content), "Published asset differs from its release source");
    else {
      const response = await fetch(previous.browser_download_url, { signal: AbortSignal.timeout(30000) });
      assert.ok(response.ok, "Could not verify the published package");
      assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(content));
    }
    return;
  }
  if (previous) await api.request("releases/assets/" + previous.id, "DELETE");
  const target = new URL(release.upload_url.replace(/\{.*$/, ""));
  assert.equal(target.protocol, "https:");
  assert.equal(target.hostname, "uploads.github.com");
  target.searchParams.set("name", filename);
  const response = await fetch(target, {
    method: "POST", body: content, signal: AbortSignal.timeout(60000),
    headers: { Authorization: "Bearer " + api.token, "Content-Type": "application/octet-stream" },
  });
  if (!response.ok) throw new Error("Release asset upload failed (" + response.status + ")");
}

export async function findRelease(api, tag) {
  const release = await api.request("releases/tags/" + tag, "GET", undefined, true);
  if (release) return release;
  const releases = await api.request("releases?per_page=100");
  const drafts = releases.filter((item) => item.draft && item.tag_name === tag);
  assert.ok(drafts.length <= 1, "More than one draft has the requested release version");
  return drafts[0] || null;
}

async function publish(api) {
  const main = (await readJSON(api, "Info.json", "main")).value;
  const tag = process.env.RELEASE_TAG || "v" + main.version;
  assert.match(tag, /^v\d+\.\d+\.\d+$/);
  const release = await findRelease(api, tag);
  if (!release) return;
  const sha = process.env.RELEASE_SHA || release.target_commitish;
  assert.match(sha, /^[a-f0-9]{40}$/, "Recovery needs the release's exact target SHA");
  const source = worktree(sha);
  try {
    validate(source.directory);
    const manifest = JSON.parse(fs.readFileSync(path.join(source.directory, "Info.json"), "utf8"));
    assert.equal(tag, "v" + manifest.version);
    const filename = "Anime365-" + manifest.version + ".iinaplgz";
    const archive = fs.readFileSync(path.join(source.directory, "dist", filename));
    await upload(api, release, filename, archive);
    await upload(api, release, "SHA256SUMS", Buffer.from(hash(archive) + "  " + filename + "\n"));
    if (release.draft) await api.request("releases/" + release.id, "PATCH", { draft: false, tag_name: tag, target_commitish: sha });
    console.log("Verified and published " + tag + ".");
  } finally { source.clean(); }
}

async function prepare(api, number) {
  const pr = await api.request("pulls/" + number);
  const files = await api.request("pulls/" + number + "/files?per_page=100");
  validateCandidate(pr, files, api.repository);
  const baseSHA = (await api.request("git/ref/heads/main")).object.sha;
  assert.equal(pr.base.sha, baseSHA, "Main advanced; rerun release preparation");
  const base = await readJSON(api, "Info.json", baseSHA);
  const candidate = await readJSON(api, "Info.json", pr.head.sha);
  const validatedSHA = await synchronizeReleaseCounter(api, pr, base.value, candidate);
  const source = worktree(validatedSHA);
  try {
    validate(source.directory);
    const finalManifest = JSON.parse(fs.readFileSync(path.join(source.directory, "Info.json"), "utf8"));
    validateVersionChange(base.value, finalManifest);
  } finally { source.clean(); }
  const finalFiles = await api.request("pulls/" + number + "/files?per_page=100");
  validateCandidate(await api.request("pulls/" + number), finalFiles, api.repository);
  assert.equal((await api.request("git/ref/heads/main")).object.sha, baseSHA, "Main advanced during validation; rerun");
  await api.request("statuses/" + validatedSHA, "POST", { state: "success", context: "release-candidate", description: "Validated exact release head and installer" });
  const merged = await api.request("pulls/" + number + "/merge", "PUT", {
    sha: validatedSHA, merge_method: "squash", commit_title: pr.title,
  });
  assert.equal(merged.merged, true, "Repository rules prevented automatic release PR merge");
  await api.request("actions/workflows/release.yml/dispatches", "POST", { ref: "main" });
  console.log("Merged validated release PR #" + number + " and dispatched publication.");
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  assert.equal(repository, "gridness/anime365-stream");
  assert.ok(process.env.GH_TOKEN, "GH_TOKEN is required in GitHub Actions");
  const api = client(repository, process.env.GH_TOKEN);
  const operation = process.argv[2];
  assert.ok(["publish", "prepare"].includes(operation), "Choose publish or prepare");
  if (operation === "publish") return publish(api);
  const prs = JSON.parse(process.env.RELEASE_PRS || "[]");
  for (const pr of prs) {
    assert.ok(Number.isSafeInteger(pr.number) && pr.number > 0);
    await prepare(api, pr.number);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
