class AppError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "Anime365Error";
    this.code = code;
    this.details = details;
  }
}

function text(value, limit = 500) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function id(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new AppError("input", "Choose a valid series, episode, or translation.");
  }
  return number;
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function title(value) {
  const titles = Array.isArray(value.titles) ? value.titles : [];
  for (const language of ["en", "romaji", "ru", "ja"]) {
    const item = titles.find((entry) => entry.language === language && entry.title);
    if (item) return text(item.title);
  }
  return text(value.title) || text(titles[0] && titles[0].title) || "Untitled series";
}

function series(value) {
  if (!object(value)) throw new AppError("response", "Invalid series response.");
  return {
    id: id(value.id),
    title: title(value),
    year: Number(value.year) || null,
    type: text(value.type, 40),
    episodes: Array.isArray(value.episodes)
      ? value.episodes.slice(0, 5000).map(episode) : [],
  };
}

function episode(value) {
  if (!object(value)) throw new AppError("response", "Invalid episode response.");
  return {
    id: id(value.id),
    number: Number.isFinite(Number(value.episodeInt)) ? Number(value.episodeInt) : 0,
    type: text(value.episodeType, 40),
    label: text(value.episodeFull, 100) || "Episode " + String(value.episodeInt || "?"),
    active: value.isActive !== false && value.isActive !== 0,
  };
}

function translation(value) {
  if (!object(value)) throw new AppError("response", "Invalid translation response.");
  const authors = Array.isArray(value.authorsList) ? value.authorsList : [];
  return {
    id: id(value.id),
    type: text(value.type, 80),
    kind: text(value.typeKind, 40),
    language: text(value.typeLang, 40),
    authors: authors.map((author) => text(author, 160)).filter(Boolean).sort(),
    authorsSummary: text(value.authorsSummary, 300),
    source: text(value.qualityType, 40),
    width: Number(value.width) || 0,
    height: Number(value.height) || 0,
    active: value.isActive !== false && value.isActive !== 0,
  };
}

function preference(value) {
  return {
    type: value.type,
    kind: value.kind,
    language: value.language,
    authors: value.authors.slice().sort(),
    source: value.source,
  };
}

function matchTranslation(values, choice) {
  if (!choice) return null;
  const matches = values.filter((value) => value.active &&
    JSON.stringify(preference(value)) === JSON.stringify(choice));
  return matches.length === 1 ? matches[0] : null;
}

function orderedEpisodes(values) {
  return values.slice().sort((a, b) => a.number - b.number || a.id - b.id);
}

function nextEpisode(values, current) {
  if (current.type !== "tv") return null;
  return orderedEpisodes(values).find((value) =>
    value.type === "tv" && value.number > current.number) || null;
}

function chooseQuality(values, preferred) {
  const sorted = values.slice().sort((a, b) => b.height - a.height);
  if (preferred === "highest") return sorted[0] || null;
  const maximum = Number(preferred);
  return sorted.find((value) => value.height <= maximum) || sorted[sorted.length - 1] || null;
}

// ASVS 2.2.1: the host has no browser URL parser. Reject alternate schemes,
// credentials, ports, controls, and encoded authority tricks at this boundary.
function httpsURL(value, domains) {
  if (typeof value !== "string" || value.length > 16384 || /[\s\\\x00-\x1f]/.test(value)) {
    throw new AppError("media", "The service returned an invalid media URL.");
  }
  const match = /^https:\/\/([a-z0-9.-]+)(?::443)?([/?#].*)?$/i.exec(value);
  if (!match || !match[1].includes(".") || match[1].includes("..")) {
    throw new AppError("media", "Playback requires a valid HTTPS URL.");
  }
  const host = match[1].toLowerCase();
  if (domains && !domains.some((domain) => host === domain || host.endsWith("." + domain))) {
    throw new AppError("media-host", "Playback host needs compatibility verification: " + host);
  }
  return { url: value, host };
}

function safeError(error) {
  return isAppError(error)
    ? { code: error.code, message: error.message, details: error.details }
    : { code: "unexpected", message: "The operation failed. Please try again." };
}

function isAppError(error) {
  // IINA can evaluate a required module repeatedly. Its Error subclasses then
  // have different identities, even within one host context.
  return error instanceof Error && error.name === "Anime365Error" &&
    typeof error.code === "string" && /^[a-z-]+$/.test(error.code);
}

module.exports = {
  AppError, text, id, object, title, series, episode, translation, preference,
  matchTranslation, orderedEpisodes, nextEpisode, chooseQuality, httpsURL, safeError, isAppError,
};
