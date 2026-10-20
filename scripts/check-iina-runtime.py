"""Exercise the real controller/player in IINA with public HTTP, video, and ASS.

Requires macOS, IINA 1.5.0, and ffmpeg. Uses a temporary plugin identity, no
account, no Keychain, and process-local enable flags. Removes its link on exit.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
IDENTIFIER = "io.github.gridness.anime365-runtime-check"
IINA = Path("/Applications/IINA.app/Contents/MacOS/IINA")
LINK = Path.home() / "Library/Application Support/com.colliderli.iina/plugins/anime365-runtime-check.iinaplugin-dev"
DATA = Path(tempfile.gettempdir()) / ("iina-" + IDENTIFIER)

GLOBAL = r'''
const { createController } = require("./controller.js");
const stages = [];
function mark(stage) {
  stages.push(stage);
  iina.file.write("@tmp/result.json", JSON.stringify({stage, stages: stages.slice(-30), time: Date.now()}));
}
const host = {
  console: iina.console, standaloneWindow: iina.standaloneWindow, menu: iina.menu,
  preferences: {get() {}, set() {}, sync() {}},
  utils: {keychainWrite() {return true;}},
  http: {get(url) {
    // Keep IINA's actual URLSession -> JS Promise callback queue. Only public
    // /me is requested, with no options or account token. Substitute test data.
    return iina.http.get("https://smotret-anime.org/api/me").then(() => {
      let value;
      if (url.endsWith("/me")) value = {id: 1, name: "Runtime check", isLogined: true, isPremium: true};
      else if (url.endsWith("/series/10")) value = {id: 10, title: "Runtime check", episodes: [{id: 20, episodeInt: 1, episodeType: "tv", isActive: 1}]};
      else if (url.endsWith("/episodes/20")) value = {id: 20, translations: [{id: 120, type: "subEn", authorsList: [], isActive: 1}]};
      else if (url.endsWith("/embed/120")) value = {stream: [{urls: ["https://smotret-anime.org/runtime-check"], height: 180}], subtitlesUrl: "/subtitles/runtime-check.ass"};
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
      if (name === "command" && value.kind === "play") value = {...value, url: "@tmp/sample.mp4"};
      iina.global.postMessage(target, name, value);
    },
    onMessage(name, callback) {
      iina.global.onMessage(name, (packet, sender) => {
        callback(packet, sender);
        if (name === "player-event") mark(packet.kind);
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
    .then(() => controller.dispatch("autoplay", {value: false}))
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
  const core = {
    get status() {return {url: "@tmp/sample.mp4", position: iina.core.status.position, duration: iina.core.status.duration};},
    open(url) {iina.core.open(url);}, stop() {iina.core.stop();},
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

def main():
    if not IINA.exists() or not shutil.which("ffmpeg"):
        raise RuntimeError("Requires /Applications/IINA.app and ffmpeg")
    if LINK.exists() or LINK.is_symlink() or DATA.exists():
        raise RuntimeError("An earlier runtime check exists; inspect it before rerunning")
    process = None
    LINK.parent.mkdir(parents=True, exist_ok=True)
    DATA.mkdir()
    try:
        with tempfile.TemporaryDirectory(prefix="anime365-runtime-check-") as temporary:
            stage = Path(temporary)
            for directory in ["src", "ui"]:
                shutil.copytree(ROOT / directory, stage / directory)
            manifest = json.loads((ROOT / "Info.json").read_text())
            manifest.update(name="Anime365 runtime check", identifier=IDENTIFIER)
            (stage / "Info.json").write_text(json.dumps(manifest))
            (stage / "src/global.js").write_text(GLOBAL)
            (stage / "src/index.js").write_text(ENTRY)
            (DATA / "sample.ass").write_text(SUBTITLE)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=320x180:d=6", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest", "-c:v", "libx264", "-c:a", "aac", str(DATA / "sample.mp4")], check=True)
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
                    if value["stage"] == "failed":
                        raise RuntimeError("Native controller playback failed")
                    if value["stage"] == "completed":
                        if "subtitle-rendered" not in value["stages"]:
                            raise RuntimeError("Native ASS subtitle was not selected and rendered")
                        print("Native IINA controller, background HTTP, player, ASS subtitles, sidebar, and EOF passed.")
                        return
                time.sleep(0.2)
            raise RuntimeError("Native playback timed out")
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


if __name__ == "__main__":
    main()
