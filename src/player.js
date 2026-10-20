const wire = require("./wire.js");

function createPlayer(host, clock = { setTimeout, clearTimeout, setInterval, now: () => Date.now() }) {
  let handshake = "";
  let current = null;
  let sidebarLoaded = false;
  let latestState = null;
  let lastCheckpoint = 0;
  let openingTimer = null;

  function postGlobal(name, value) {
    // IINA invokes the parent JSContext immediately. Defer to avoid entering
    // it recursively while it is still dispatching a command to this context.
    clock.setTimeout(() => host.global.postMessage(name, value), 0);
  }

  function event(kind, extra = {}) {
    postGlobal("player-event", {
      kind, handshake, jobId: current && current.jobId,
      position: position(), duration: duration(), ...extra,
    });
  }

  function position() {
    const value = host.core.status.position;
    return Number.isFinite(value) && value >= 0 ? value : (current ? current.position : 0);
  }

  function duration() {
    const value = host.core.status.duration;
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function checkpoint(force = false) {
    if (!current || current.phase !== "playing") return;
    if (!force && clock.now() - lastCheckpoint < 2000) return;
    lastCheckpoint = clock.now();
    current.position = position();
    event("progress");
  }

  function failed() {
    if (!current || !["opening", "playing"].includes(current.phase)) return;
    clock.clearTimeout(openingTimer);
    current.phase = "failed";
    event("failed");
  }

  function loaded() {
    if (!current || current.phase !== "opening") return;
    const url = host.core.status.url;
    if (typeof url !== "string") return;
    if (url !== current.url) {
      try { if (decodeURI(url) !== decodeURI(current.url)) return; }
      catch (error) { return; }
    }
    clock.clearTimeout(openingTimer);
    current.phase = "playing";
    if (current.subtitle) host.core.subtitle.loadTrack(current.subtitle);
    if (current.position > 0) host.core.seekTo(current.position);
    host.core.resume();
    event("loaded");
  }

  function poll() {
    if (!current || current.phase !== "playing") return;
    // end-file has no reason; the automatic eof-reached observer uses DOUBLE.
    // keep-open preserves EOF so getFlag can distinguish completion from Stop.
    if (host.mpv.getFlag("eof-reached")) {
      const length = duration();
      if (length > 0 && position() < length - 3) { failed(); return; }
      current.phase = "ended";
      event("completed");
      return;
    }
    checkpoint();
  }

  function play(value) {
    checkpoint(true);
    clock.clearTimeout(openingTimer);
    current = { ...value, phase: "opening" };
    host.mpv.set("keep-open", "yes");
    host.mpv.set("network-timeout", 20);
    openingTimer = clock.setTimeout(failed, 30000);
    host.core.open(value.url);
  }

  function command(value) {
    if (!value || typeof value.kind !== "string") return;
    if (value.kind === "configure") handshake = value.handshake;
    if (value.handshake !== handshake) return;
    if (value.kind === "play") play(value);
    if (value.kind === "capture") checkpoint(true);
    if (value.kind === "stop") {
      clock.clearTimeout(openingTimer);
      current = null;
      host.core.stop();
    }
    if (value.requestId) event("ack", { requestId: value.requestId });
  }

  function loadSidebar() {
    host.sidebar.loadFile("ui/sidebar/index.html");
    host.sidebar.onMessage("rpc", (request) => postGlobal("rpc", request));
    sidebarLoaded = true;
    host.sidebar.show();
    if (latestState) wire.send(host.sidebar, { type: "state", value: latestState });
  }

  function start() {
    host.global.onMessage("command", command);
    host.global.onMessage("rpc-result", (value) => { if (sidebarLoaded) wire.send(host.sidebar, value); });
    host.global.onMessage("state", (value) => {
      latestState = value;
      if (sidebarLoaded) wire.send(host.sidebar, { type: "state", value });
    });
    host.event.on("iina.window-loaded", loadSidebar);
    host.event.on("mpv.file-loaded", loaded);
    host.event.on("mpv.pause.changed", () => { checkpoint(true); poll(); });
    host.event.on("mpv.end-file", () => {
      // EOF can arrive before the poll timer or pause notification. Classify
      // it before end-file changes the phase and prevents further EOF checks.
      poll();
      if (current && current.phase === "playing") {
        checkpoint(true);
        current.phase = "stopped";
        event("stopped");
      }
    });
    host.mpv.addHook("on_load_fail", 0, failed);
    clock.setInterval(poll, 500);
  }

  return { start, command, poll };
}

module.exports = { createPlayer };
