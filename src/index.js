const config = require("./config.js");
const { createPlayer } = require("./player.js");

// Ordinary IINA windows also load this entry. Only the managed player owns
// Anime365 playback or communicates with this plugin's global controller.
if (iina.global.getLabel() === config.playerLabel) {
  createPlayer(iina).start();
}
