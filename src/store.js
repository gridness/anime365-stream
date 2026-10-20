const { object, id } = require("./domain.js");

function createStore(preferences) {
  let accounts = {};
  try {
    const saved = JSON.parse(preferences.get("libraryV1") || "{}");
    if (object(saved)) accounts = saved;
  } catch (error) {
    accounts = {};
  }

  function persist() {
    preferences.set("libraryV1", JSON.stringify(accounts));
    preferences.sync();
  }

  function account(userId) {
    const key = String(id(userId));
    if (!object(accounts[key])) accounts[key] = {};
    const value = accounts[key];
    if (!object(value.history)) value.history = {};
    if (!object(value.episodes)) {
      value.episodes = {};
      Object.values(value.history).forEach((record) => {
        if (object(record) && object(record.episode)) value.episodes[String(id(record.episode.id))] = record;
      });
    }
    if (!object(value.translations)) value.translations = {};
    if (typeof value.autoplay !== "boolean") value.autoplay = true;
    if (value.quality !== "highest" && !/^[1-9]\d{1,4}$/.test(String(value.quality))) {
      value.quality = "highest";
    }
    return value;
  }

  function history(userId) {
    return Object.values(account(userId).history)
      .filter((record) => object(record) && object(record.series) && object(record.episode))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function save(userId, record) {
    const value = account(userId);
    value.history[String(id(record.series.id))] = record;
    value.episodes[String(id(record.episode.id))] = record;
    persist();
  }

  function clear(userId) {
    account(userId).history = {};
    account(userId).episodes = {};
    persist();
  }

  return { account, history, save, clear, persist };
}

module.exports = { createStore };
