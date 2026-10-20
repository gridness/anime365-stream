const { AppError, id } = require("./domain.js");

function changed() {
  return new AppError("search", "Anime365 search returned an unfamiliar page. Please try again later.");
}

function entities(value) {
  const named = { amp: "&", quot: "\"", apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (original, name) => {
    if (name[0] !== "#") return named[name.toLowerCase()];
    const number = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number) : "\ufffd";
  });
}

// IINA's JavaScriptCore has no DOMParser. This bounded reader extracts inert
// text and numeric IDs only. Remote HTML is never rendered or executed.
function readHTML(html) {
  if (typeof html !== "string" || html.length > 2000000) throw changed();
  const source = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const root = { tag: "root", attrs: {}, children: [] };
  const stack = [root];
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  let count = 0;
  for (const match of source.matchAll(/<\/?[a-z][^<>"']*(?:(?:"[^"]*"|'[^']*')[^<>"']*)*>|[^<]+/gi)) {
    if (++count > 50000 || stack.length > 128) throw changed();
    const token = match[0];
    if (token[0] !== "<") { stack[stack.length - 1].children.push(token); continue; }
    const tag = /^<\/?([a-z0-9-]+)/i.exec(token)[1].toLowerCase();
    if (token[1] === "/") {
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === tag) { stack.length = index; break; }
      }
      continue;
    }
    const attrs = {};
    const attributes = token.slice(tag.length + 1, -1);
    for (const value of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[value[1].toLowerCase()] = entities(value[2] ?? value[3] ?? value[4] ?? "");
    }
    const node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!voidTags.has(tag) && !token.endsWith("/>")) stack.push(node);
  }
  return root;
}

const hasClass = (node, name) => (node.attrs.class || "").split(/\s+/).includes(name);

function findAll(node, predicate) {
  const values = [];
  function visit(item) {
    if (typeof item === "string") return;
    if (predicate(item)) values.push(item);
    item.children.forEach(visit);
  }
  visit(node);
  return values;
}

function content(node) {
  if (!node) return "";
  function read(item) {
    if (typeof item === "string") return entities(item);
    if (hasClass(item, "online-h")) return "";
    return item.children.map(read).join("");
  }
  return read(node).replace(/\s+/g, " ").trim().slice(0, 500);
}

function card(node) {
  const headings = findAll(node, (item) => item.tag === "h2" || item.tag === "h3");
  const primary = headings.find((item) => hasClass(item, "line-1"));
  const secondary = headings.find((item) => hasClass(item, "line-2"));
  const heading = secondary || primary;
  if (!heading) throw changed();
  const anchor = findAll(heading, (item) => item.tag === "a")[0];
  const match = anchor && /^\/catalog\/[a-z0-9-]+-(\d+)\/?$/i.exec(anchor.attrs.href || "");
  if (!match || !content(heading)) throw changed();
  const title = content(heading);
  return { id: id(match[1]), title, alternateTitle: content(primary) === title ? "" : content(primary), year: null, type: "" };
}

function parseSearch(html, page = 1) {
  const root = readHTML(html);
  const canonical = findAll(root, (node) => node.tag === "link" && node.attrs.rel === "canonical")[0];
  const redirected = canonical && /^https:\/\/smotret-anime\.(?:org|co|net)\/catalog\/[a-z0-9-]+-(\d+)\/?$/i.exec(canonical.attrs.href || "");
  if (redirected) return { seriesId: id(redirected[1]), page, nextPage: null };
  const list = findAll(root, (node) => node.attrs.id === "yw0")[0];
  if (!list) {
    const form = findAll(root, (node) => node.tag === "form" && node.attrs.action === "/catalog/search")[0];
    const heading = findAll(root, (node) => hasClass(node, "m-page-title") && content(node) === "Результаты поиска:")[0];
    const empty = findAll(root, (node) => hasClass(node, "card-content") && content(node).includes("По вашему запросу ничего не найдено."))[0];
    if (form && heading && empty) return { items: [], page, nextPage: null };
  }
  const keys = list && findAll(list, (node) => hasClass(node, "keys"))[0];
  if (!keys || !/^\/catalog\/search(?:\?|$)/.test(keys.attrs.title || "")) throw changed();
  const ids = findAll(keys, (node) => node.tag === "span").map((node) => id(content(node)));
  const items = findAll(list, (node) => hasClass(node, "m-catalog-item")).map(card);
  if (items.length > 100 || JSON.stringify(ids) !== JSON.stringify(items.map((item) => item.id))) throw changed();
  const pages = Number(list.attrs["data-total"]);
  if (!Number.isSafeInteger(pages) || pages < 0 || pages > 10000) throw changed();
  if (!items.length && !findAll(list, (node) => hasClass(node, "empty")).length) throw changed();
  return { items, page, nextPage: items.length && page < pages ? page + 1 : null };
}

module.exports = { parseSearch };
