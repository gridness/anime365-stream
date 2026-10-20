const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePlayback, compatibilityReport } = require("../src/media.js");
const config = require("../src/config.js");

const stream = [{ height: 1080, urls: ["https://ru-534543.quantum-phantom-moon.ru/video?signature=VIDEO_SECRET"] }];
const subtitlePath = "/subtitles/120.ass?signature=SUBTITLE_SECRET";

test("subtitles resolve site-relative and protocol-relative links to allowed HTTPS URLs", () => {
  for (const [input, expected] of [
    [subtitlePath, config.site + subtitlePath],
    ["//smotret-anime.co" + subtitlePath, "https://smotret-anime.co" + subtitlePath],
    ["http://smotret-anime.org" + subtitlePath, "https://smotret-anime.org" + subtitlePath],
    ["https://smotret-anime.co" + subtitlePath, "https://smotret-anime.co" + subtitlePath],
  ]) {
    const value = parsePlayback({ stream, subtitlesUrl: input }, config.mediaDomains);
    assert.equal(value.subtitle, expected);
    assert.equal(value.sources[0].url, stream[0].urls[0]);
  }
});

test("absent subtitles leave playback without an external subtitle track", () => {
  for (const subtitlesUrl of [undefined, null, ""]) {
    assert.equal(parsePlayback({ stream, subtitlesUrl }, config.mediaDomains).subtitle, null);
  }
});

test("subtitle normalization still rejects unsafe URLs and invalid field types", () => {
  for (const subtitlesUrl of [
    "//evil.test/subtitles.ass", "http://evil.test/subtitles.ass",
    "//smotret-anime.org.evil.test/subtitles.ass", "//user@smotret-anime.org/subtitles.ass",
    "//smotret-anime.org:444/subtitles.ass", "//127.0.0.1/subtitles.ass",
    "///evil.test/subtitles.ass", "/\\evil.test/subtitles.ass",
    "file:///tmp/subtitles.ass", "data:text/plain,subtitles", "javascript:alert(1)",
    "/subtitles/bad name.ass", "/subtitles/\n120.ass", false, 123, {}, [],
  ]) {
    assert.throws(() => parsePlayback({ stream, subtitlesUrl }, config.mediaDomains), (error) => {
      assert.ok(["media", "media-host"].includes(error.code));
      assert.ok(error.details);
      assert.ok(!JSON.stringify(error).includes("VIDEO_SECRET"));
      return true;
    });
  }
});

test("subtitle normalization does not relax the HTTPS requirement for videos", () => {
  for (const url of ["//smotret-anime.org/video", "/video", "http://smotret-anime.org/video"]) {
    assert.throws(() => parsePlayback({ stream: [{ height: 1080, urls: [url] }] }, config.mediaDomains), { code: "media" });
  }
});

test("subtitle compatibility reports never reveal signed paths or query strings", () => {
  for (const subtitlesUrl of [subtitlePath, "//smotret-anime.org" + subtitlePath, "https://smotret-anime.org" + subtitlePath]) {
    const report = JSON.stringify(compatibilityReport({ stream, subtitlesUrl }));
    assert.ok(!report.includes("SECRET"));
    assert.ok(!report.includes("120.ass"));
  }
});
