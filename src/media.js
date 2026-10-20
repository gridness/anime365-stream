const { AppError, isAppError, object, httpsURL } = require("./domain.js");
const config = require("./config.js");

function subtitleURL(value, domains) {
  if (value === undefined || value === null || value === "") return null;
  // ASVS 1.2.2, 2.2.1: resolve service-relative subtitle links before validation.
  // Always use HTTPS and apply the same host allowlist as video URLs.
  if (typeof value === "string") {
    if (value.startsWith("//")) value = "https:" + value;
    else if (value.startsWith("/")) value = config.site + value;
    else if (/^http:\/\//i.test(value)) value = "https:" + value.slice(5);
  }
  return httpsURL(value, domains).url;
}

function compatibilityReport(payload) {
  const fields = [];
  function visit(value, path, depth) {
    if (depth > 6 || fields.length >= 120) return;
    if (Array.isArray(value)) {
      fields.push({ path, type: "array", count: value.length });
      value.slice(0, 2).forEach((item, index) => visit(item, path + "[" + index + "]", depth + 1));
    } else if (object(value)) {
      Object.keys(value).slice(0, 40).forEach((key) => visit(value[key], path + "." + key, depth + 1));
    } else {
      const field = { path, type: value === null ? "null" : typeof value };
      if (typeof value === "string" && /^https:\/\//i.test(value)) {
        try { field.host = httpsURL(value).host; } catch (error) { field.type = "invalid-url"; }
      }
      fields.push(field);
    }
  }
  visit(payload, "$", 0);
  return { format: 1, fields };
}

// Verified against the user's authenticated response structure. A stream URL
// need not have a file extension. Download links and embed pages are separate.
function parsePlayback(payload, domains) {
  function unsupported() {
    return new AppError("compatibility", "This playback response needs compatibility verification. Share the safe report below with the maintainer.", compatibilityReport(payload));
  }
  try {
    if (!object(payload) || !Array.isArray(payload.stream) || !payload.stream.length || payload.stream.length > 50) throw unsupported();
    const sources = payload.stream.map((source) => {
      // Multiple URLs may represent separate parts. Never silently play only
      // part of an episode until that format's sequencing is established.
      if (!object(source) || !Array.isArray(source.urls) || source.urls.length !== 1 ||
          !Number.isSafeInteger(source.height) || source.height <= 0 || source.height > 16384) throw unsupported();
      return { url: httpsURL(source.urls[0], domains).url, height: source.height };
    });
    const subtitle = subtitleURL(payload.subtitlesUrl, domains);
    return { sources, subtitle };
  } catch (error) {
    if (isAppError(error)) error.details = compatibilityReport(payload);
    throw error;
  }
}

module.exports = { parsePlayback, compatibilityReport };
