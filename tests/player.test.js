const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPlayer } = require("../src/player.js");

function fixture(deferred = false) {
  const listeners = new Map();
  const messages = [];
  const timers = new Set();
  const callbacks = [];
  const subtitles = [];
  const status = { position: 0, duration: 1200, url: "" };
  let eof = false;
  let shown = false;
  const host = {
    global: { onMessage() {}, postMessage(name, value) { messages.push(value); } },
    event: { on(name, callback) { listeners.set(name, callback); } },
    mpv: { set() {}, getFlag() { return eof; }, addHook(name, priority, callback) { listeners.set(name, callback); } },
    core: { status, open(url) { status.url = url; }, stop() {}, seekTo(value) { status.position = value; }, resume() {}, subtitle: { loadTrack(url) { subtitles.push(url); } } },
    sidebar: { loadFile() {}, onMessage() {}, postMessage() {}, show() { shown = true; } },
  };
  const clock = { now: () => 5000, setTimeout(callback, milliseconds) {
    if (milliseconds === 0) {
      if (deferred) callbacks.push(callback);
      else callback();
      return null;
    }
    timers.add(callback); return callback;
  }, clearTimeout(callback) { timers.delete(callback); }, setInterval() {} };
  const player = createPlayer(host, clock);
  player.start();
  player.command({ kind: "configure", handshake: "test", requestId: "setup" });
  function open(position = 0) {
    player.command({ kind: "play", handshake: "test", jobId: 1, url: "https://cdn.smotret-anime.org/episode.mp4", position });
    listeners.get("mpv.file-loaded")();
  }
  return { player, open, status, listeners, messages, timers, subtitles,
    flush() { callbacks.splice(0).forEach((callback) => callback()); },
    eof(value) { eof = value; }, shown: () => shown };
}

test("player replies leave the native command callback before entering the parent context", () => {
  const f = fixture(true);
  assert.equal(f.messages.length, 0);
  f.flush();
  assert.equal(f.messages[0].kind, "ack");
  f.open();
  assert.equal(f.messages.length, 1);
  f.flush();
  assert.equal(f.messages.at(-1).kind, "loaded");
});

test("external subtitles load once after their video opens and do not carry into another episode", () => {
  const f = fixture();
  const url = "https://cdn.smotret-anime.org/episode.mp4";
  const subtitle = "https://smotret-anime.org/subtitles/120.ass?signature=PRIVATE";
  f.player.command({ kind: "play", handshake: "test", jobId: 1, url, subtitle, position: 123 });
  assert.deepEqual(f.subtitles, []);
  f.status.url = "https://cdn.smotret-anime.org/previous.mp4";
  f.listeners.get("mpv.file-loaded")();
  assert.deepEqual(f.subtitles, []);
  f.status.url = url;
  f.listeners.get("mpv.file-loaded")();
  f.listeners.get("mpv.file-loaded")();
  assert.deepEqual(f.subtitles, [subtitle]);
  assert.equal(f.status.position, 123);
  assert.equal(f.messages.at(-1).kind, "loaded");
  f.open();
  assert.deepEqual(f.subtitles, [subtitle]);
});

test("manual Stop saves progress without completion or automatic retry", () => {
  const f = fixture();
  f.open(123);
  assert.equal(f.status.position, 123);
  f.listeners.get("mpv.end-file")();
  f.player.poll();
  assert.equal(f.messages.at(-1).kind, "stopped");
  assert.ok(!f.messages.some((value) => ["completed", "failed"].includes(value.kind)));
});

test("real EOF completes exactly once and early EOF reports a playback failure", () => {
  const f = fixture();
  f.open();
  f.status.position = 1200;
  f.eof(true);
  f.player.poll();
  f.player.poll();
  assert.equal(f.messages.filter((value) => value.kind === "completed").length, 1);
  const early = fixture();
  early.open(300);
  early.eof(true);
  early.player.poll();
  assert.equal(early.messages.at(-1).kind, "failed");
});

test("EOF delivered through end-file completes before the next poll", () => {
  const f = fixture();
  f.open();
  f.status.position = 1200;
  f.eof(true);
  f.listeners.get("mpv.end-file")();
  f.player.poll();
  assert.equal(f.messages.filter((value) => value.kind === "completed").length, 1);
  assert.ok(!f.messages.some((value) => value.kind === "stopped"));
});

test("truncated EOF delivered through end-file reports failure instead of manual Stop", () => {
  const f = fixture();
  f.open(300);
  f.eof(true);
  f.listeners.get("mpv.end-file")();
  assert.equal(f.messages.at(-1).kind, "failed");
  assert.ok(!f.messages.some((value) => ["stopped", "completed"].includes(value.kind)));
});

test("opening failure is reported once and playback sidebar opens after window load", () => {
  const f = fixture();
  f.listeners.get("iina.window-loaded")();
  assert.equal(f.shown(), true);
  f.player.command({ kind: "play", handshake: "test", jobId: 2, url: "https://cdn.smotret-anime.org/episode.mp4", position: 0 });
  f.listeners.get("on_load_fail")();
  f.listeners.get("on_load_fail")();
  assert.equal(f.messages.filter((value) => value.kind === "failed").length, 1);
  assert.equal(f.timers.size, 0);
});
