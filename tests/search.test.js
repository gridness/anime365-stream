const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createAPI } = require("../src/api.js");
const { parseSearch } = require("../src/search.js");
const config = require("../src/config.js");
const fixture = (file) => fs.readFileSync(path.join(__dirname, "fixtures", file), "utf8");

test("search uses Anime365's website endpoint and exact result order", async () => {
  const requests = [];
  const api = createAPI({ get: async (url, options) => {
    requests.push({ url, options });
    return { statusCode: 200, text: fixture("search-naruto-page1.html") };
  } }, config);
  const result = await api.search(" Naruto ");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, config.site + "/catalog/search");
  assert.deepEqual(requests[0].options.params, { q: "Naruto", page: "1" });
  assert.deepEqual(result.items.slice(0, 5).map((item) => item.id), [2440, 254, 4530, 5549, 848]);
  assert.equal(result.items[0].title, "Naruto: Shounen Hen");
  assert.equal(result.items[0].alternateTitle, "Наруто");
  assert.ok(!result.items.some((item) => item.title.includes("смотреть онлайн")));
  assert.equal(result.nextPage, null);
});

test("search follows the site's page count instead of guessing from result count", () => {
  const first = parseSearch(fixture("search-frieren-page1.html"));
  assert.deepEqual(first.items.slice(0, 4).map((item) => item.id), [30414, 42431, 37673, 35064]);
  assert.equal(first.items.length, 30);
  assert.equal(first.nextPage, 2);
  const second = parseSearch(fixture("search-frieren-page2.html"), 2);
  assert.deepEqual(second.items.map((item) => item.id), [44725, 25498, 12276]);
  assert.equal(second.nextPage, null);
});

test("a genuine website no-results page is empty, while unrelated pages fail explicitly", () => {
  assert.deepEqual(parseSearch(fixture("search-empty.html")), { items: [], page: 1, nextPage: null });
  assert.throws(() => parseSearch('<html><h1>Service unavailable</h1></html>'), { code: "search" });
  const comments = '<div id="yw0" data-total="0"><span class="empty"></span><div class="keys" title="/catalog/anime-1"></div></div>';
  assert.throws(() => parseSearch(comments), { code: "search" });
});

test("single-result website redirects resolve the canonical series through the API", async () => {
  const requests = [];
  const api = createAPI({ get: async (url) => {
    requests.push(url);
    if (url.endsWith("/catalog/search")) return { text: '<link rel="canonical" href="https://smotret-anime.co/catalog/example-123" />' };
    return { data: { data: { id: 123, titles: [{ language: "en", title: "Example" }], episodes: [] } } };
  } }, config);
  const result = await api.search("Example");
  assert.equal(result.items[0].id, 123);
  assert.equal(result.items[0].title, "Example");
  assert.deepEqual(requests, [config.site + "/catalog/search", config.api + "/series/123"]);
});

test("remote markup stays inert text and inconsistent result IDs fail closed", () => {
  const original = fixture("search-naruto-page1.html");
  const html = original.replace("Naruto: Shounen Hen <span", 'A &amp; B &#x1f600; &lt;script&gt; <span');
  assert.equal(parseSearch(html).items[0].title, "A & B 😀 <script>");
  assert.throws(() => parseSearch(original.replace("<span>2440</span>", "<span>9999</span>")), { code: "search" });
  assert.throws(() => parseSearch("x".repeat(2000001)), { code: "search" });
});
