const { test } = require("node:test");
const assert = require("node:assert/strict");
const domain = require("../src/domain.js");
const media = require("../src/media.js");
const wire = require("../src/wire.js");
const { createStore } = require("../src/store.js");

const translation = (id, source = "tv") => ({ id, type: "subRu", kind: "sub", language: "ru", authors: ["Group"], source, active: true });

test("translation preference follows new episode IDs but refuses source changes and ambiguity", () => {
  const choice = domain.preference(translation(1));
  assert.equal(domain.matchTranslation([translation(2)], choice).id, 2);
  assert.equal(domain.matchTranslation([translation(2, "bd")], choice), null);
  assert.equal(domain.matchTranslation([translation(2), translation(3)], choice), null);
});

test("autoplay stays in regular episodes and does not skip an unavailable next episode", () => {
  const episodes = [
    { id: 1, number: 1, type: "tv", active: true },
    { id: 2, number: 1.5, type: "special", active: true },
    { id: 3, number: 2, type: "tv", active: false },
    { id: 4, number: 3, type: "tv", active: true },
  ];
  assert.equal(domain.nextEpisode(episodes, episodes[0]).id, 3);
  assert.equal(domain.nextEpisode(episodes, episodes[1]), null);
  assert.equal(domain.nextEpisode(episodes, episodes[3]), null);
});

test("quality prefers highest available without exceeding a remembered limit", () => {
  const sources = [{ height: 2160 }, { height: 720 }, { height: 1080 }];
  assert.equal(domain.chooseQuality(sources, "highest").height, 2160);
  assert.equal(domain.chooseQuality(sources, "1080").height, 1080);
  assert.equal(domain.chooseQuality(sources, "480").height, 720);
});

test("media boundary rejects lookalike hosts, credentials, protocols and local resources", () => {
  for (const url of ["file:///tmp/a.mp4", "http://smotret-anime.org/a.mp4", "https://smotret-anime.org.evil.test/a.mp4", "https://user@smotret-anime.org/a.mp4", "https://smotret-anime.org:444/a.mp4", "https://127.0.0.1/a.mp4"]) {
    assert.throws(() => domain.httpsURL(url, ["smotret-anime.org"]));
  }
  assert.equal(domain.httpsURL("https://cdn.smotret-anime.org/a.mp4?signature=private", ["smotret-anime.org"]).host, "cdn.smotret-anime.org");
});

test("compatibility report exposes structure and hosts, never token or signed URL values", () => {
  const report = JSON.stringify(media.compatibilityReport({ access_token: "SECRET", streams: [{ src: "https://cdn.smotret-anime.org/a.mp4?signature=PRIVATE" }] }));
  assert.ok(report.includes("cdn.smotret-anime.org"));
  assert.ok(!report.includes("SECRET"));
  assert.ok(!report.includes("PRIVATE"));
  assert.ok(!report.includes("a.mp4"));
});

test("authenticated stream URL lists preserve resolution and exclude downloads and embed pages", () => {
  const value = media.parsePlayback({
    embedUrl: "https://smotret-anime.co/translations/embed/1",
    download: [{ url: "https://smotret-anime.co/download/1", height: 1080 }],
    stream: [
      { urls: ["https://ru-534543.quantum-phantom-moon.ru/opaque?signature=PRIVATE"], height: 1080 },
      { urls: ["https://ru-684836.quantum-phantom-moon.ru/opaque?signature=PRIVATE"], height: 720 },
    ], subtitlesUrl: null,
  }, ["smotret-anime.co", "quantum-phantom-moon.ru"]);
  assert.equal(value.sources.length, 2);
  assert.deepEqual(value.sources.map((source) => source.height), [1080, 720]);
  assert.ok(value.sources.every((source) => source.url.includes("quantum-phantom-moon.ru")));
  assert.equal(value.subtitle, null);
  assert.throws(() => media.parsePlayback({ iframe: "<script>alert(1)</script>" }, ["smotret-anime.org"]), { code: "compatibility" });
});

test("host-to-view encoding neutralizes template interpolation and preserves Unicode", () => {
  const input = { title: "` ${globalThis.pwned = true} </script> 日本語" };
  const result = wire.encode(input);
  assert.match(result.wire, /^[a-f0-9]+$/);
  const json = result.wire.match(/.{4}/g).map((part) => String.fromCharCode(parseInt(part, 16))).join("");
  assert.deepEqual(JSON.parse(json), input);
});

test("history and settings remain separate per account and clearing does not affect another account", () => {
  const values = {};
  const preferences = { get: (key) => values[key], set: (key, value) => { values[key] = value; }, sync() {} };
  const store = createStore(preferences);
  const record = { series: { id: 10, title: "Example" }, episode: { id: 20 }, position: 12, updatedAt: 1 };
  store.save(1, record);
  assert.equal(store.history(1).length, 1);
  assert.equal(store.history(2).length, 0);
  assert.equal(store.account(2).autoplay, true);
  store.clear(2);
  assert.equal(createStore(preferences).history(1)[0].position, 12);
});
