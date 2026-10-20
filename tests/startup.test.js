const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function startup() {
  const menus = [];
  const listeners = new Map();
  const messages = [];
  const host = {
    preferences: { get() {}, set() {}, sync() {} },
    http: { get() { throw new Error("Unexpected network request"); } },
    console: { log() {} },
    utils: {},
    standaloneWindow: {
      loadFile() { listeners.clear(); }, open() {},
      onMessage(name, callback) { listeners.set(name, callback); },
      postMessage(name, value) { messages.push(value); },
    },
    global: { onMessage() {}, postMessage() {} },
    menu: { item(title, action) { return { title, action }; }, addItem(item) { menus.push(item); } },
  };
  const context = vm.createContext({ iina: host, setTimeout, clearTimeout });
  const stack = [];
  function evaluate(file, module) {
    stack.push(file);
    const content = fs.readFileSync(file, "utf8");
    const source = module ? "(function () { const module = {};\n" + content + "\nreturn module.exports; })()" : content;
    try { return new vm.Script(source, { filename: file }).runInContext(context); }
    finally { stack.pop(); }
  }
  // IINA resolves exact filenames relative to the evaluating file. Its relative
  // cache lookup does not match absolute cache keys, so repeated loads are real.
  context.require = (file) => evaluate(path.resolve(path.dirname(stack[stack.length - 1]), file), true);
  evaluate(path.resolve(__dirname, "../src/global.js"), false);
  return { menus, listeners, messages };
}

function decode(value) {
  return JSON.parse(value.wire.match(/.{4}/g).map((part) => String.fromCharCode(parseInt(part, 16))).join(""));
}

test("the global entry registers Browse Anime365 using IINA's module loader", () => {
  const instance = startup();
  assert.ok(instance.menus.some((item) => item.title === "Browse Anime365"));
  assert.ok(instance.listeners.has("rpc"));
});

test("errors from separately evaluated host modules retain their actionable code", async () => {
  const instance = startup();
  await instance.listeners.get("rpc")({ id: "guest-play", action: "play", parameters: { seriesId: 1, episodeId: 2 } });
  const result = instance.messages.map(decode).find((message) => message.type === "result");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "login");
});
