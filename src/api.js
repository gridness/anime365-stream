const { AppError, isAppError, object, id, series, episode, translation } = require("./domain.js");
const { parseSearch } = require("./search.js");

function createAPI(http, config) {
  function deadline(promise) {
    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new AppError("network", "The service took too long to respond.")), config.timeout);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function apiError(body, path) {
    const code = Number(body && body.error && body.error.code);
    if (path === "/login") return new AppError("login", "Could not sign in. Check your email and password, or use a browser token.");
    if (code === 401 || code === 403) return new AppError("access", "Sign in with an active Anime365 subscription to play.");
    if (code === 404) return new AppError("unavailable", "This episode or translation is no longer available.");
    return new AppError("service", "Anime365 could not complete this request. Please try again.");
  }

  async function request(path, parameters = {}, token) {
    const params = {};
    Object.keys(parameters).forEach((key) => { params[key] = String(parameters[key]); });
    if (token) params.access_token = token;
    let response;
    try {
      // The third-party API requires query credentials, an ASVS 14.2.1 exception.
      // Pass them as host parameters; never log URLs, request options or errors.
      response = await deadline(http.get(config.api + path, {
        params,
        headers: { "User-Agent": "Anime365-IINA/1.0 (gridness/anime365-stream)", "Cache-Control": "no-store" },
      }));
    } catch (error) {
      if (isAppError(error)) throw error;
      if (error && object(error.data) && error.data.error) throw apiError(error.data, path);
      throw new AppError("network", "Could not reach Anime365. Check your connection and retry.");
    }
    const body = response && response.data;
    if (!object(body)) throw new AppError("response", "Anime365 returned an unexpected response.");
    if (body.error) throw apiError(body, path);
    return Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
  }

  async function login(email, password) {
    if (typeof email !== "string" || !email.trim() || email.length > 320 ||
        typeof password !== "string" || !password || password.length > 4096) {
      throw new AppError("input", "Enter your email and password.");
    }
    const value = await request("/login", { app: config.app, email: email.trim(), password });
    if (!object(value) || typeof value.access_token !== "string") {
      throw new AppError("response", "Anime365 did not return a sign-in token.");
    }
    return value.access_token;
  }

  async function me(token) {
    const value = await request("/me", {}, token);
    if (!object(value) || !value.isLogined || !Number(value.id)) {
      throw new AppError("login", "Your sign-in has ended. Please sign in again.");
    }
    return { id: id(value.id), name: String(value.name || "Anime365 viewer").slice(0, 160), premium: Boolean(value.isPremium) };
  }

  async function search(query, page = 1) {
    if (typeof query !== "string" || query.trim().length < 2 || query.length > 200) {
      throw new AppError("input", "Enter at least two characters to search.");
    }
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new AppError("input", "Choose a valid search page.");
    let response;
    try {
      response = await deadline(http.get(config.site + "/catalog/search", {
        params: { q: query.trim(), page: String(page) },
        headers: { "User-Agent": "Anime365-IINA/1.0 (gridness/anime365-stream)", Accept: "text/html" },
      }));
    } catch (error) {
      if (isAppError(error)) throw error;
      throw new AppError("network", "Could not reach Anime365 search. Check your connection and retry.");
    }
    const result = parseSearch(response && response.text, page);
    if (result.seriesId) {
      const value = await getSeries(result.seriesId);
      return { items: [{ id: value.id, title: value.title, year: value.year, type: value.type }], page, nextPage: null };
    }
    return result;
  }

  async function getSeries(seriesId) {
    return series(await request("/series/" + id(seriesId)));
  }

  async function getEpisode(episodeId) {
    const value = await request("/episodes/" + id(episodeId));
    if (!object(value) || !Array.isArray(value.translations)) {
      throw new AppError("response", "Invalid episode response.");
    }
    return { ...episode(value), translations: value.translations.slice(0, 1000).map(translation) };
  }

  function embed(translationId, token) {
    return request("/translations/embed/" + id(translationId), {}, token);
  }

  return { login, me, search, getSeries, getEpisode, embed };
}

module.exports = { createAPI };
