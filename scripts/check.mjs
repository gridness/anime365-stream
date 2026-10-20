import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("Info.json"));
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(read("version.txt").trim(), manifest.version);
assert.ok(Number.isSafeInteger(manifest.ghVersion) && manifest.ghVersion > 0);
assert.equal(manifest.ghRepo, "gridness/anime365-stream");
assert.ok(!manifest.allowedDomains.includes("*"), "Use explicit network domains");
for (const field of ["entry", "globalEntry", "preferencesPage"]) {
  if (manifest[field]) assert.ok(fs.existsSync(path.join(root, manifest[field])), field + " must exist");
}

function walk(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = path.posix.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), "Runtime files must not be symlinks: " + file);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

const files = [...walk("src"), ...walk("ui")];
for (const file of files) {
  const source = read(file);
  if (file.startsWith("src/") && file.endsWith(".js")) {
    new vm.Script(source, { filename: file });
    for (const match of source.matchAll(/require\("([^"]+)"\)/g)) {
      assert.ok(match[1].startsWith("."), "Host code cannot import Node packages");
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), match[1])), "Missing host module: " + file);
    }
  }
  if (file.startsWith("ui/") && file.endsWith(".js")) {
    if (typeof Bun !== "undefined") new Bun.Transpiler({ loader: "js" }).transformSync(source);
    else execFileSync(process.execPath, ["--input-type=module", "--check"], { input: source });
    for (const match of source.matchAll(/from "([^"]+)"/g)) {
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), match[1])), "Missing UI module: " + file);
    }
  }
  if (file.endsWith(".html")) {
    for (const match of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), match[1])), "Missing view resource: " + file);
    }
  }
}
console.log("Manifest, versions, runtime paths, and JavaScript syntax passed.");
