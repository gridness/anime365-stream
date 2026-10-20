const { AppError } = require("./domain.js");

function createAuth(host, api, changed, log) {
  let token = null;
  let user = null;
  let epoch = 0;
  let notice = "";
  const service = "Anime365 session";
  const name = "access-token";

  function remember(value) {
    host.preferences.set("rememberSession", value);
    host.preferences.sync();
  }

  function saveToken(value, enabled) {
    remember(false);
    const saved = host.utils.keychainWrite(service, name, enabled ? value : "");
    if (enabled && saved === true && host.utils.keychainRead(service, name) === value) {
      remember(true);
    } else if (enabled) {
      notice = "Signed in for this session. Keychain could not save your sign-in.";
      log("keychain.save_failed");
    }
  }

  async function signIn(value, enabled) {
    if (typeof value !== "string" || !value.trim() || value.length > 8192) {
      throw new AppError("input", "Enter a valid Anime365 access token.");
    }
    const attempt = ++epoch;
    remember(false);
    const verified = await api.me(value.trim());
    if (attempt !== epoch) throw new AppError("cancelled", "Sign-in was cancelled.");
    token = value.trim();
    user = verified;
    notice = "";
    saveToken(token, enabled);
    log("session.signed_in");
    changed();
  }

  async function login(email, password, enabled) {
    const attempt = epoch;
    const value = await api.login(email, password);
    if (attempt !== epoch) throw new AppError("cancelled", "Sign-in was cancelled.");
    return signIn(value, enabled);
  }

  async function restore() {
    if (host.preferences.get("rememberSession") !== true) return;
    const saved = host.utils.keychainRead(service, name);
    if (typeof saved !== "string" || !saved) {
      notice = "Saved sign-in could not be read. Please sign in again.";
      changed();
      return;
    }
    await signIn(saved, true);
  }

  function signOut() {
    epoch += 1;
    token = null;
    user = null;
    notice = "";
    remember(false);
    // ASVS 7.4.1, 14.3.1: disable restore even if Keychain clearing fails.
    if (host.utils.keychainWrite(service, name, "") !== true) {
      notice = "Signed out. Saved sign-in is disabled, but Keychain could not be cleared.";
      log("keychain.clear_failed");
    }
    log("session.signed_out");
    changed();
  }

  async function requirePlayback() {
    if (!token || !user) throw new AppError("login", "Sign in to play an episode.");
    const attempt = epoch;
    const verified = await api.me(token);
    if (attempt !== epoch) throw new AppError("cancelled", "Playback was cancelled.");
    user = verified;
    if (!user.premium) throw new AppError("subscription", "An active Anime365 subscription is required. Renew it on the website, then retry.");
    return { token, user, epoch };
  }

  return {
    login, signIn, restore, signOut, requirePlayback,
    get user() { return user; },
    get epoch() { return epoch; },
    get notice() { return notice; },
  };
}

module.exports = { createAuth };
