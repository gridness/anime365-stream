const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAPI } = require("../src/api.js");
const { createAuth } = require("../src/auth.js");

const config = { api: "https://smotret-anime.org/api", app: "public-app", timeout: 100 };

test("HTTP 200 error envelopes never become successful playback data", async () => {
  const api = createAPI({ get: async () => ({ statusCode: 200, data: { error: { code: 403, message: "PRIVATE" } } }) }, config);
  await assert.rejects(api.embed(123, "SECRET"), (error) => error.code === "access" && !error.message.includes("PRIVATE"));
});

test("passwords reach the API unchanged and errors do not disclose request credentials", async () => {
  let captured;
  const api = createAPI({ get: async (url, options) => { captured = { url, options }; throw new Error("email=user&password=SECRET"); } }, config);
  await assert.rejects(api.login("person@example.test", "  SECRET  "), (error) => !error.message.includes("SECRET"));
  assert.equal(captured.url, config.api + "/login");
  assert.equal(captured.options.params.password, "  SECRET  ");
  assert.equal(captured.options.params.app, "public-app");
});

test("an unresponsive host request gets a bounded timeout", async () => {
  const api = createAPI({ get: () => new Promise(() => {}) }, { ...config, timeout: 5 });
  await assert.rejects(api.search("gate"), { code: "network" });
});

test("remembered login stores only the token and sign-out disables restore when clearing fails", async () => {
  const values = {};
  const secrets = {};
  let failWrite = false;
  const host = {
    preferences: { get: (key) => values[key], set: (key, value) => { values[key] = value; }, sync() {} },
    utils: {
      keychainWrite(service, name, value) { if (failWrite) return false; secrets[service + name] = value; return true; },
      keychainRead(service, name) { return secrets[service + name]; },
    },
  };
  const auth = createAuth(host, { login: async () => "TOKEN", me: async () => ({ id: 1, name: "Viewer", premium: true }) }, () => {}, () => {});
  await auth.login("person@example.test", "PASSWORD", true);
  assert.equal(values.rememberSession, true);
  assert.ok(!JSON.stringify(values).includes("TOKEN"));
  assert.ok(!JSON.stringify(secrets).includes("PASSWORD"));
  failWrite = true;
  auth.signOut();
  assert.equal(auth.user, null);
  assert.equal(values.rememberSession, false);
  await auth.restore();
  assert.equal(auth.user, null);
});
