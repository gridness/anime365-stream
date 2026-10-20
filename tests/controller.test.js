const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createController } = require("../src/controller.js");

const settle = () => new Promise((resolve) => setImmediate(resolve));

async function fixture(mainOnly = false, subtitlesUrl = null, episodeType = "tv") {
  const values = {};
  const commands = [];
  const requests = [];
  let position = 0;
  let background = false;
  let mainDispatches = 0;
  let controller;
  const episodes = [20, 21].map((id, index) => ({ id, episodeInt: index + 1, episodeType, episodeFull: "Episode " + (index + 1), isActive: 1 }));
  const host = {
    http: { async get(url) {
      background = true;
      requests.push(url);
      if (url.endsWith("/me")) return { data: { data: { id: 1, name: "Viewer", isLogined: true, isPremium: true } } };
      if (url.endsWith("/series/10")) return { data: { data: { id: 10, title: "Series", episodes } } };
      const episode = /\/episodes\/(\d+)$/.exec(url);
      if (episode) return { data: { data: { ...episodes.find((value) => value.id === Number(episode[1])), translations: [
        { id: Number(episode[1]) + 100, type: "subEn", typeKind: "sub", typeLang: "en", authorsList: ["Group"], qualityType: "tv", isActive: 1 },
      ] } } };
      if (url.includes("/translations/embed/")) return { data: { data: { stream: [{ urls: ["https://ru-534543.quantum-phantom-moon.ru/episode?signature=PRIVATE"], height: 1080 }], subtitlesUrl } } };
      throw new Error("Unexpected test URL");
    } },
    preferences: { get: (key) => values[key], set(key, value) { values[key] = value; }, sync() {} },
    utils: { keychainWrite() { return true; } },
    console: { log() {} },
    standaloneWindow: { postMessage() {} },
    global: {
      createPlayerInstance() {
        assert.ok(!mainOnly || !background, "Native player creation must run in the main-loop callback");
        return 7;
      },
      postMessage(player, name, value) {
        assert.equal(player, 7);
        if (name !== "command") return;
        commands.push(value);
        if (value.requestId) queueMicrotask(() => {
          const playing = commands.filter((command) => command.kind === "play").at(-1);
          if (value.kind === "capture" && playing) controller.playerEvent({ kind: "progress", handshake: value.handshake, jobId: playing.jobId, position, duration: 1200 }, "managed");
          controller.playerEvent({ kind: "ack", handshake: value.handshake, requestId: value.requestId }, "managed");
        });
      },
    },
  };
  controller = createController(host, (callback) => { mainDispatches += 1; background = false; callback(); });
  await controller.dispatch("token-login", { token: "SECRET", remember: false });
  function event(kind, extra = {}) {
    const playing = commands.filter((command) => command.kind === "play").at(-1);
    controller.playerEvent({ kind, handshake: playing.handshake, jobId: playing.jobId, position, duration: 1200, ...extra }, "managed");
  }
  return { controller, commands, requests, values, event, setPosition(value) { position = value; },
    mainDispatches: () => mainDispatches,
    play: () => controller.dispatch("play", { seriesId: 10, episodeId: 20, translationId: 120 }),
    opens: () => commands.filter((command) => command.kind === "play") };
}

test("native player creation runs in the main-loop callback after HTTP completion", async () => {
  const f = await fixture(true);
  await f.play();
  assert.ok(f.mainDispatches() > 0);
  assert.equal(f.opens().length, 1);
});

test("subtitled translations reach the player without exposing subtitle URLs in UI or preferences", async () => {
  const f = await fixture(false, "/subtitles/120.ass?signature=SUBTITLE_SECRET");
  await f.play();
  assert.equal(f.opens().length, 1);
  assert.equal(f.opens()[0].subtitle, "https://smotret-anime.org/subtitles/120.ass?signature=SUBTITLE_SECRET");
  const saved = JSON.stringify({ state: f.controller.state(), preferences: f.values });
  assert.ok(!saved.includes("SUBTITLE_SECRET"));
  assert.ok(!saved.includes("120.ass"));
});

test("an unsafe subtitle URL prevents playback", async () => {
  const f = await fixture(false, "//evil.test/subtitles.ass");
  await assert.rejects(f.play(), { code: "media-host" });
  assert.equal(f.opens().length, 0);
});

test("quality changes use freshly captured progress and never expose media secrets in UI state", async () => {
  const f = await fixture();
  await f.play();
  f.event("loaded");
  f.setPosition(237);
  await f.controller.dispatch("quality", { value: "720" });
  assert.equal(f.opens().at(-1).position, 237);
  assert.equal(f.requests.filter((url) => url.includes("/translations/embed/")).length, 2);
  const snapshot = JSON.stringify(f.controller.state());
  assert.ok(!snapshot.includes("PRIVATE") && !snapshot.includes("SECRET") && !snapshot.includes("episode.mp4"));
});

test("playback retries once automatically, and manual Retry starts a new retry budget", async () => {
  const f = await fixture();
  await f.play();
  f.event("failed");
  await settle();
  assert.equal(f.opens().length, 2);
  f.event("failed");
  await settle();
  assert.equal(f.opens().length, 2);
  assert.equal(f.controller.state().error.code, "playback");
  await f.controller.dispatch("retry");
  f.event("failed");
  await settle();
  assert.equal(f.opens().length, 4);
});

test("EOF autoplays the next regular episode and disabling autoplay retains completed history", async () => {
  const f = await fixture();
  await f.play();
  assert.equal(f.controller.state().autoplay, true);
  f.setPosition(1200);
  f.event("completed");
  await settle();
  assert.equal(f.controller.state().current.episode.id, 21);
  await f.controller.dispatch("autoplay", { value: false });
  f.event("completed");
  await settle();
  assert.equal(f.opens().length, 2);
  assert.equal(f.controller.state().history[0].completed, true);
  assert.equal(f.controller.state().history[0].next, null);
});

for (const type of ["ona", "ova"]) {
  test("Next episode advances a numbered " + type.toUpperCase() + " series", async () => {
    const f = await fixture(false, null, type);
    await f.play();
    f.event("loaded");
    await f.controller.dispatch("next");
    assert.equal(f.controller.state().current.episode.id, 21);
    assert.equal(f.opens().length, 2);
    assert.equal(f.opens()[1].position, 0);
  });

  test("EOF autoplays a numbered " + type.toUpperCase() + " series", async () => {
    const f = await fixture(false, null, type);
    await f.play();
    f.setPosition(1200);
    f.event("completed");
    await settle();
    assert.equal(f.controller.state().current.episode.id, 21);
    assert.equal(f.opens().length, 2);
  });
}

test("returning to an earlier unfinished episode restores its own position", async () => {
  const f = await fixture();
  await f.play();
  f.setPosition(345);
  f.event("progress");
  await f.controller.dispatch("next");
  f.setPosition(0);
  f.event("loaded");
  await f.controller.dispatch("play", { seriesId: 10, episodeId: 20 });
  assert.equal(f.opens().at(-1).position, 345);
  assert.equal(Object.keys(JSON.parse(f.values.libraryV1)["1"].episodes).length, 2);
});
