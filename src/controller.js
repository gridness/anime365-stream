const config = require("./config.js");
const domain = require("./domain.js");
const { createAPI } = require("./api.js");
const { createStore } = require("./store.js");
const { createAuth } = require("./auth.js");
const { parsePlayback } = require("./media.js");
const wire = require("./wire.js");

function createController(host, scheduleMain = (callback) => setTimeout(callback, 0)) {
  const api = createAPI(host.http, config);
  const store = createStore(host.preferences);
  const catalog = new Map();
  const waiters = new Map();
  let playerId = null;
  let playerSender = null;
  let handshake = "";
  let current = null;
  let sequence = 0;
  let operation = 0;
  let lastError = null;
  const auth = createAuth(host, api, publish, log);

  function log(event) {
    host.console.log(JSON.stringify({ event, time: new Date().toISOString() }));
  }

  function state() {
    const account = auth.user ? store.account(auth.user.id) : null;
    return {
      user: auth.user, notice: auth.notice, error: lastError,
      history: auth.user ? store.history(auth.user.id) : [],
      autoplay: account ? account.autoplay : true,
      quality: account ? account.quality : "highest",
      current: current ? {
        series: { id: current.series.id, title: current.series.title },
        episode: current.episode, translation: current.translation,
        status: current.status, position: current.position, duration: current.duration,
        qualities: current.media.sources.map((value) => value.height),
      } : null,
    };
  }

  function publish() {
    const snapshot = state();
    wire.send(host.standaloneWindow, { type: "state", value: snapshot });
    if (playerId !== null) postPlayer("state", snapshot);
  }

  function postPlayer(name, value) {
    const target = playerId;
    // Native global messaging calls the other JSContext synchronously. Keep
    // replies on separate run-loop turns to prevent recursive VM entry.
    scheduleMain(() => host.global.postMessage(target, name, value));
  }

  function fail(error) {
    if (error.code === "cancelled") return;
    lastError = domain.safeError(error);
    log("operation.failed." + lastError.code);
    publish();
  }

  async function getSeries(seriesId) {
    const key = domain.id(seriesId);
    if (!catalog.has(key)) {
      const value = await api.getSeries(key);
      if (catalog.size >= 30) catalog.delete(catalog.keys().next().value);
      catalog.set(key, value);
    }
    return catalog.get(key);
  }

  function guard(attempt, epoch) {
    if (attempt !== operation || epoch !== auth.epoch) {
      throw new domain.AppError("cancelled", "Playback was cancelled.");
    }
  }

  function requestPlayer(kind, extra = {}) {
    const requestId = "host-" + String(++sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(requestId);
        reject(new domain.AppError("player", "The playback window is not responding."));
      }, 2500);
      waiters.set(requestId, { resolve, timer });
      postPlayer("command", { kind, requestId, handshake, ...extra });
    });
  }

  function onMain(callback) {
    return new Promise((resolve, reject) => {
      scheduleMain(() => {
        try { resolve(callback()); } catch (error) { reject(error); }
      });
    });
  }

  async function ensurePlayer() {
    if (playerId !== null) {
      try { await onMain(() => requestPlayer("ping")); return; } catch (error) { playerId = null; }
    }
    // IINA resolves HTTP promises on a URLSession background queue, while its
    // player factory creates AppKit controllers inline. Its timer callback runs
    // on main. Creating here avoids a reproduced JavaScriptCore crash on open.
    await onMain(() => {
      playerId = host.global.createPlayerInstance({ label: config.playerLabel });
      if (!Number.isInteger(playerId)) {
        playerId = null;
        throw new domain.AppError("player", "IINA could not create the Anime365 player.");
      }
      playerSender = null;
      handshake = "instance-" + String(++sequence) + "-" + String(Date.now());
      return requestPlayer("configure");
    });
  }

  async function capture() {
    if (!current || playerId === null) return;
    try { await requestPlayer("capture"); } catch (error) { log("player.capture_unavailable"); }
  }

  function record(completed = false) {
    if (!current || !auth.user || current.epoch !== auth.epoch) return;
    store.save(auth.user.id, {
      series: { id: current.series.id, title: current.series.title },
      episode: current.episode, translation: current.translation,
      position: current.position, duration: current.duration,
      completed, next: domain.nextEpisode(current.series.episodes, current.episode),
      updatedAt: Date.now(),
    });
  }

  async function prepare(parameters, attempt, session) {
    const series = await getSeries(parameters.seriesId);
    const episodeId = domain.id(parameters.episodeId);
    const member = series.episodes.find((value) => value.id === episodeId);
    if (!member || !member.active) throw new domain.AppError("unavailable", "This episode is unavailable.");
    const episode = await api.getEpisode(episodeId);
    guard(attempt, session.epoch);
    const account = store.account(session.user.id);
    const selected = parameters.translationId
      ? episode.translations.find((value) => value.id === domain.id(parameters.translationId) && value.active)
      : domain.matchTranslation(episode.translations, account.translations[String(series.id)]);
    if (!selected) {
      throw new domain.AppError("translation", "Choose a translation for " + episode.label + ".", { seriesId: series.id, episodeId });
    }
    const media = parsePlayback(await api.embed(selected.id, session.token), config.mediaDomains);
    guard(attempt, session.epoch);
    return { series, episode: member, translation: selected, media };
  }

  async function play(parameters, retryCount = 0) {
    const attempt = ++operation;
    const epoch = auth.epoch;
    await capture();
    guard(attempt, epoch);
    const session = await auth.requirePlayback();
    const prepared = await prepare(parameters, attempt, session);
    guard(attempt, epoch);
    await ensurePlayer();
    guard(attempt, epoch);
    const account = store.account(session.user.id);
    account.translations[String(prepared.series.id)] = domain.preference(prepared.translation);
    const mediaSource = domain.chooseQuality(prepared.media.sources, account.quality);
    const recorded = account.episodes[String(prepared.episode.id)];
    let position = parameters.position === undefined
      ? (recorded && !recorded.completed ? recorded.position : 0) : parameters.position;
    if (parameters.preservePosition && current && current.episode.id === prepared.episode.id) position = current.position;
    if (!Number.isFinite(position) || position < 0) position = 0;
    current = { ...prepared, epoch, jobId: ++sequence, position, duration: 0, status: "opening", retries: retryCount };
    lastError = null;
    record();
    postPlayer("command", {
      kind: "play", handshake, jobId: current.jobId, url: mediaSource.url,
      subtitle: current.media.subtitle, position: current.position,
    });
    publish();
    log("playback.opening");
  }

  function resumeParameters(recorded) {
    const episode = recorded.completed ? recorded.next : recorded.episode;
    if (!episode) throw new domain.AppError("finished", "You have finished this series.");
    return {
      seriesId: recorded.series.id, episodeId: episode.id,
      translationId: recorded.completed ? null : recorded.translation.id,
      position: recorded.completed ? 0 : recorded.position,
      preservePosition: !recorded.completed,
    };
  }

  async function resume(seriesId) {
    requireUser();
    const value = store.account(auth.user.id).history[String(domain.id(seriesId))];
    if (!value) throw new domain.AppError("history", "No saved episode was found.");
    await play(resumeParameters(value));
  }

  async function next() {
    if (!current) throw new domain.AppError("player", "Play an episode first.");
    const episode = domain.nextEpisode(current.series.episodes, current.episode);
    if (!episode) throw new domain.AppError("finished", "There are no more regular episodes in this series.");
    await play({ seriesId: current.series.id, episodeId: episode.id, position: 0 });
  }

  async function retry(automatic = false) {
    if (!current) throw new domain.AppError("player", "Choose an episode to retry.");
    await play({ seriesId: current.series.id, episodeId: current.episode.id,
      translationId: current.translation.id, preservePosition: true }, automatic ? current.retries + 1 : 0);
  }

  async function completed() {
    if (!current || current.status === "ended") return;
    current.status = "ended";
    record(true);
    publish();
    log("playback.completed");
    if (store.account(auth.user.id).autoplay && domain.nextEpisode(current.series.episodes, current.episode)) {
      try { await next(); } catch (error) { fail(error); }
    }
  }

  async function playbackFailed() {
    if (!current || current.status === "error" || current.status === "ended") return;
    current.status = "error";
    record();
    if (current.retries < 1) {
      try { await retry(true); return; } catch (error) { fail(error); return; }
    }
    fail(new domain.AppError("playback", "Playback failed after one retry. Check your connection and select Retry."));
  }

  function playerEvent(packet, sender) {
    if (!domain.object(packet) || packet.handshake !== handshake) return;
    if (packet.kind === "ack") {
      if (playerSender !== null && playerSender !== sender) return;
      playerSender = sender;
      const pending = waiters.get(packet.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        waiters.delete(packet.requestId);
        pending.resolve();
      }
      return;
    }
    if (sender !== playerSender || !current || packet.jobId !== current.jobId || current.epoch !== auth.epoch) return;
    if (Number.isFinite(packet.position) && packet.position >= 0) current.position = packet.position;
    if (Number.isFinite(packet.duration) && packet.duration >= 0) current.duration = packet.duration;
    if (packet.kind === "loaded") current.status = "playing";
    if (packet.kind === "stopped") current.status = "stopped";
    if (packet.kind === "completed") { completed().catch(fail); return; }
    if (packet.kind === "failed") { playbackFailed().catch(fail); return; }
    record(current.status === "ended");
    publish();
  }

  function requireUser() {
    if (!auth.user) throw new domain.AppError("login", "Sign in to use viewing history and playback settings.");
  }

  async function signOut() {
    operation += 1;
    await capture();
    if (playerId !== null) postPlayer("command", { kind: "stop", handshake });
    current = null;
    lastError = null;
    auth.signOut();
  }

  async function setQuality(value) {
    requireUser();
    if (value !== "highest" && !/^[1-9]\d{1,4}$/.test(String(value))) {
      throw new domain.AppError("input", "Choose a valid playback resolution.");
    }
    store.account(auth.user.id).quality = String(value);
    store.persist();
    if (current && current.status === "playing") await retry();
    publish();
  }

  async function dispatch(action, parameters = {}) {
    if (action !== "ready") lastError = null;
    switch (action) {
      case "ready": publish(); return state();
      case "search": return api.search(parameters.query, parameters.page === undefined ? 1 : parameters.page);
      case "series": return getSeries(parameters.seriesId);
      case "episode": return api.getEpisode(parameters.episodeId);
      case "login": await auth.login(parameters.email, parameters.password, parameters.remember === true); return state();
      case "token-login": await auth.signIn(parameters.token, parameters.remember === true); return state();
      case "restore": await auth.restore(); return state();
      case "sign-out": await signOut(); return state();
      case "play": await play(parameters); return state();
      case "resume": await resume(parameters.seriesId); return state();
      case "next": await next(); return state();
      case "retry": await retry(); return state();
      case "restart": if (current) await play({ seriesId: current.series.id, episodeId: current.episode.id, translationId: current.translation.id, position: 0 }); return state();
      case "quality": await setQuality(parameters.value); return state();
      case "autoplay": requireUser(); store.account(auth.user.id).autoplay = parameters.value === true; store.persist(); publish(); return state();
      case "clear-history": requireUser(); store.clear(auth.user.id); publish(); return state();
      case "browse": host.standaloneWindow.open(); return null;
      case "browser-login": host.utils.open(config.site + "/users/login"); return null;
      case "browser-token": host.utils.open(config.api + "/accessToken?app=" + encodeURIComponent(config.app)); return null;
      case "subscription": host.utils.open(config.site); return null;
      default: throw new domain.AppError("input", "Unknown plugin action.");
    }
  }

  async function rpc(request, reply) {
    if (!domain.object(request) || !/^[a-z0-9-]{1,80}$/i.test(String(request.id)) || typeof request.action !== "string") return;
    try {
      const result = await dispatch(request.action, domain.object(request.parameters) ? request.parameters : {});
      reply({ type: "result", id: request.id, ok: true, value: result });
    } catch (error) {
      const safe = domain.safeError(error);
      reply({ type: "result", id: request.id, ok: false, error: safe });
      if (safe.code !== "cancelled") fail(error);
    }
  }

  function start() {
    loadBrowser();
    host.global.onMessage("player-event", playerEvent);
    host.global.onMessage("rpc", (request, sender) => {
      if (sender === playerSender) rpc(request, (value) => postPlayer("rpc-result", value));
    });
    host.menu.addItem(host.menu.item("Browse Anime365", () => {
      loadBrowser();
      host.standaloneWindow.open();
    }));
    log("plugin.started");
    auth.restore().catch(fail);
  }

  function loadBrowser() {
    host.standaloneWindow.loadFile("ui/window/index.html");
    host.standaloneWindow.onMessage("rpc", (request) => rpc(request, (value) => wire.send(host.standaloneWindow, value)));
  }

  return { start, dispatch, state, playerEvent };
}

module.exports = { createController };
