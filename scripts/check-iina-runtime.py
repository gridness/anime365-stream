"""Exercise IINA playback, sidebar Next episode, autoplay, and ASS subtitles.

Requires macOS, IINA 1.5.0, and ffmpeg. Uses a temporary plugin identity, no
account, no Keychain, and process-local enable flags. Removes its link on exit.
"""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parent.parent
IDENTIFIER = "io.github.gridness.anime365-runtime-check"
IINA = Path("/Applications/IINA.app/Contents/MacOS/IINA")
LINK = Path.home() / "Library/Application Support/com.colliderli.iina/plugins/anime365-runtime-check.iinaplugin-dev"
DATA = Path(tempfile.gettempdir()) / ("iina-" + IDENTIFIER)

GLOBAL = r'''
const { createController } = require("./controller.js");
const stages = [];
let sidebarNext = false;
let autoplayVerified = false;
function mark(stage) {
  stages.push(stage);
  iina.file.write("@tmp/result.json", JSON.stringify({stage, stages: stages.slice(-100), time: Date.now()}));
}
const host = {
  console: iina.console, standaloneWindow: iina.standaloneWindow, menu: iina.menu,
  preferences: {get() {}, set() {}, sync() {}},
  utils: {keychainWrite() {return true;}},
  http: {get(url) {
    // Keep IINA's actual URLSession -> JS Promise callback queue using a local
    // fixture, with no options or account token. Substitute synthetic metadata.
    return iina.http.get("__HTTP_FIXTURE__").then(() => {
      let value;
      if (url.endsWith("/me")) value = {id: 1, name: "Runtime check", isLogined: true, isPremium: true};
      else if (url.endsWith("/series/10")) value = {id: 10, title: "Runtime check", episodes: [20, 21, 22].map((id, index) => ({id, episodeInt: index + 1, episodeType: "tv", isActive: 1}))};
      else if (/\/episodes\/2[012]$/.test(url)) {
        const id = Number(url.split("/").pop());
        value = {id, translations: [{id: id + 100, type: "subEn", authorsList: [], isActive: 1}]};
      }
      else if (/\/embed\/12[012]$/.test(url)) value = {stream: [{urls: ["https://smotret-anime.org/runtime-check/" + url.split("/").pop()], height: 180}], subtitlesUrl: "/subtitles/runtime-check.ass"};
      else throw new Error("Unexpected runtime check request");
      return {statusCode: 200, data: {data: value}};
    });
  }},
  global: {
    createPlayerInstance(options) {
      mark("creating-player");
      const instance = iina.global.createPlayerInstance(options);
      mark("created-player");
      return instance;
    },
    postMessage(target, name, value) {
      if (name === "command") mark("command-" + value.kind);
      if (name === "rpc-result" && !value.ok) mark("failed-" + value.error.code);
      if (name === "command" && value.kind === "play") value = {...value, url: "@tmp/sample-" + value.url.split("/").pop() + ".mp4"};
      iina.global.postMessage(target, name, value);
    },
    onMessage(name, callback) {
      iina.global.onMessage(name, (packet, sender) => {
        if (name === "rpc" && packet.action === "next") {
          sidebarNext = true;
          mark("sidebar-next-clicked");
        }
        callback(packet, sender);
        if (name === "player-event") {
          const state = controller.state();
          const episodeId = state.current && state.current.episode.id;
          mark(packet.kind + "-" + episodeId);
          if (packet.kind === "loaded" && episodeId === 21) {
            if (!sidebarNext) { mark("failed-sidebar-next"); return; }
            mark("sidebar-next-passed");
          }
          if (packet.kind === "loaded" && episodeId === 22) {
            autoplayVerified = true;
            mark("autoplay-passed");
          }
          if (packet.kind === "completed" && episodeId === 22 && autoplayVerified) {
            const history = state.history[0];
            mark(history.completed && history.next === null ? "passed" : "failed-history");
          }
        }
      });
    }
  }
};
const controller = createController(host);
iina.global.onMessage("subtitle-rendered", () => mark("subtitle-rendered"));
controller.start();
mark("started");
setTimeout(() => {
  controller.dispatch("token-login", {token: "synthetic-runtime-check", remember: false})
    .then(() => controller.dispatch("play", {seriesId: 10, episodeId: 20, translationId: 120}))
    .catch(() => mark("failed"));
}, 500);
'''

ENTRY = r'''
const config = require("./config.js");
const { createPlayer } = require("./player.js");
if (iina.global.getLabel() === config.playerLabel) {
  // Match the private path sent by the parent to the native file URL. All
  // playback, sidebar, event, timer, and global-message APIs remain native.
  let openedURL = "";
  const core = {
    get status() {return {url: openedURL, position: iina.core.status.position, duration: iina.core.status.duration};},
    open(url) {openedURL = url; iina.core.open(url);}, stop() {iina.core.stop();},
    seekTo(value) {iina.core.seekTo(value);}, resume() {iina.core.resume();},
    subtitle: {loadTrack(url) {
      if (url !== "https://smotret-anime.org/subtitles/runtime-check.ass") throw new Error("Unexpected subtitle URL");
      iina.core.subtitle.loadTrack("@tmp/sample.ass");
    }}
  };
  createPlayer({core, global: iina.global, mpv: iina.mpv, event: iina.event, sidebar: iina.sidebar}).start();
  let subtitleVerified = false;
  setInterval(() => {
    if (subtitleVerified) return;
    const track = iina.core.subtitle.currentTrack;
    if (track && track.isExternal && track.isSelected && track.codec === "ass" &&
        iina.mpv.getString("sub-text") === "Runtime subtitle") {
      subtitleVerified = true;
      iina.global.postMessage("subtitle-rendered", {});
    }
  }, 100);
}
'''

SIDEBAR = r'''
let runtimeNextClicked = false;
setInterval(() => {
  if (runtimeNextClicked) return;
  const next = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Next episode");
  const progress = document.querySelector(".playback p");
  const elapsed = progress && /(\d+):(\d+) \//.exec(progress.textContent);
  if (!next || !elapsed || Number(elapsed[1]) * 60 + Number(elapsed[2]) < 1) return;
  runtimeNextClicked = true;
  next.click();
}, 100);
'''

SUBTITLE = """[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 180

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Runtime subtitle
"""


class FixtureHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        # ASVS 4.1.1: serve only a static JSON response with its content type.
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, format, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episode-type", choices=["tv", "ona", "ova"], default="tv")
    arguments = parser.parse_args()
    if not IINA.exists() or not shutil.which("ffmpeg"):
        raise RuntimeError("Requires /Applications/IINA.app and ffmpeg")
    if LINK.exists() or LINK.is_symlink() or DATA.exists():
        raise RuntimeError("An earlier runtime check exists; inspect it before rerunning")
    process = None
    server = None
    LINK.parent.mkdir(parents=True, exist_ok=True)
    DATA.mkdir()
    try:
        # Test-only HTTP stays on loopback and serves no files or credentials.
        server = HTTPServer(("127.0.0.1", 0), FixtureHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        with tempfile.TemporaryDirectory(prefix="anime365-runtime-check-") as temporary:
            stage = Path(temporary)
            for directory in ["src", "ui"]:
                shutil.copytree(ROOT / directory, stage / directory)
            manifest = json.loads((ROOT / "Info.json").read_text())
            manifest.update(name="Anime365 runtime check", identifier=IDENTIFIER)
            # ASVS 13.2.4: allow the fixture host only in the staged test plugin.
            manifest["allowedDomains"].append("127.0.0.1")
            (stage / "Info.json").write_text(json.dumps(manifest))
            global_script = GLOBAL.replace('episodeType: "tv"', 'episodeType: "' + arguments.episode_type + '"')
            global_script = global_script.replace("__HTTP_FIXTURE__", "http://127.0.0.1:" + str(server.server_port))
            (stage / "src/global.js").write_text(global_script)
            (stage / "src/index.js").write_text(ENTRY)
            sidebar = stage / "ui/sidebar/index.js"
            sidebar.write_text(sidebar.read_text() + SIDEBAR)
            (DATA / "sample.ass").write_text(SUBTITLE)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=320x180:d=6", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest", "-c:v", "libx264", "-c:a", "aac", str(DATA / "sample.mp4")], check=True)
            for translation in [120, 121, 122]:
                shutil.copyfile(DATA / "sample.mp4", DATA / ("sample-" + str(translation) + ".mp4"))
            LINK.symlink_to(stage)
            process = subprocess.Popen([str(IINA), "-PluginEnabled." + IDENTIFIER, "YES", "-PluginEnabled.io.github.gridness.anime365-stream", "NO"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    result = DATA / "result.json"
                    stages = json.loads(result.read_text()).get("stages", []) if result.exists() else []
                    child = DATA / "child.json"
                    child_stage = json.loads(child.read_text()).get("stage") if child.exists() else "none"
                    raise RuntimeError("IINA exited " + str(process.returncode) + "; stages: " + ", ".join(stages) + "; child: " + child_stage)
                result = DATA / "result.json"
                if result.exists():
                    value = json.loads(result.read_text())
                    if any(stage.startswith("failed") for stage in value["stages"]):
                        raise RuntimeError("Native controller playback failed: " + ", ".join(value["stages"]))
                    if value["stage"] == "passed":
                        if "subtitle-rendered" not in value["stages"]:
                            raise RuntimeError("Native ASS subtitle was not selected and rendered")
                        if "sidebar-next-passed" not in value["stages"] or "autoplay-passed" not in value["stages"]:
                            raise RuntimeError("Native episode advancement was not verified")
                        print("Native IINA " + arguments.episode_type.upper() + " sidebar Next episode, autoplay, series end, background HTTP, player reuse, and ASS subtitles passed.")
                        return
                time.sleep(0.2)
            result = DATA / "result.json"
            stages = json.loads(result.read_text()).get("stages", []) if result.exists() else []
            raise RuntimeError("Native playback timed out: " + ", ".join(stages))
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if LINK.is_symlink():
            LINK.unlink()
        shutil.rmtree(DATA)
        if server is not None:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
