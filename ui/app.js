(() => {
  const { createBridge } = window.Anime365Bridge;

  function el(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, attributes);
    for (const child of children.flat()) {
      if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function button(label, action, primary = false) {
    return el("button", { type: "button", className: primary ? "primary" : "", onclick: action }, label);
  }

  function time(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }

  function translationLabel(value) {
    return (value.authorsSummary || value.authors.join(", ") || "Uncredited") + " · " +
      (value.type || [value.language, value.kind].filter(Boolean).join(" ")) +
      (value.source ? " · " + value.source.toUpperCase() : "");
  }

  function mount(mode) {
    const root = document.getElementById("app");
    const ui = { query: "", searchedQuery: "", results: [], nextPage: null, series: null, episode: null,
      tab: "history", login: false, token: false, email: "", busy: 0, error: null,
      handledTranslation: "", confirmClear: false };
    let state = { user: null, history: [], autoplay: true, quality: "highest", current: null };
    const call = createBridge(receive);

    async function run(action, parameters = {}) {
      ui.busy += 1;
      ui.error = null;
      render();
      try { return await call(action, parameters); }
      catch (error) { ui.error = error; handleTranslation(error); throw error; }
      finally { ui.busy -= 1; render(); }
    }

    function perform(action, parameters = {}) {
      return run(action, parameters).catch(() => null);
    }

    function receive(value) {
      const oldUser = state.user && state.user.id;
      state = value;
      if ((state.user && state.user.id) !== oldUser) {
        ui.login = false;
        ui.email = "";
        ui.episode = null;
        ui.error = null;
      }
      if (state.error) { ui.error = state.error; handleTranslation(state.error); }
      if (mode === "sidebar" && state.current && (!ui.series || ui.series.id !== state.current.series.id)) {
        selectSeries(state.current.series.id);
      }
      render();
    }

    function handleTranslation(error) {
      if (error.code !== "translation" || !error.details) return;
      const key = JSON.stringify(error.details);
      if (ui.handledTranslation === key) return;
      ui.handledTranslation = key;
      selectSeries(error.details.seriesId).then(() => selectEpisode(error.details.episodeId));
    }

    async function selectSeries(seriesId) {
      try {
        ui.series = await run("series", { seriesId });
        ui.episode = null;
        render();
      } catch (error) { /* run presents the safe host error. */ }
    }

    async function selectEpisode(episodeId) {
      try {
        ui.episode = await run("episode", { episodeId });
        render();
      } catch (error) { /* run presents the safe host error. */ }
    }

    function play(episodeId, translationId) {
      if (!state.user) { ui.login = true; render(); return; }
      ui.handledTranslation = "";
      const playing = state.current && state.current.episode.id === episodeId;
      perform("play", { seriesId: ui.series.id, episodeId, translationId,
        preservePosition: Boolean(playing) });
    }

    function header() {
      return el("header", { className: "toolbar" },
        el("div", { className: "brand" }, el("span", { className: "brand-mark", ariaHidden: "true" }, "A"),
          el("div", {}, el("strong", {}, "Anime365"), el("small", {}, mode === "sidebar" ? "Playback" : "Your anime, in IINA"))),
        state.user ? el("div", { className: "account" }, el("span", {}, state.user.name),
          button("Sign out", () => perform("sign-out")))
          : button("Sign in", () => { ui.login = !ui.login; render(); }));
    }

    function signIn() {
      if (!ui.login) return null;
      const email = el("input", { id: "email", type: "email", autocomplete: "username", value: ui.email, required: true,
        placeholder: "Email", oninput: (event) => { ui.email = event.target.value; } });
      const password = el("input", { id: "password", type: "password", autocomplete: "current-password", required: true, placeholder: "Password" });
      const token = el("textarea", { id: "token", rows: 3, spellcheck: false, required: true, placeholder: "Paste your access token" });
      const remember = el("input", { type: "checkbox", checked: true });
      const submit = el("button", { className: "primary", type: "submit", disabled: ui.busy > 0 }, "Sign in");
      const form = el("form", { className: "sign-in", onsubmit: (event) => {
        event.preventDefault();
        const parameters = ui.token ? { token: token.value.trim(), remember: remember.checked }
          : { email: email.value, password: password.value, remember: remember.checked };
        password.value = "";
        token.value = "";
        perform(ui.token ? "token-login" : "login", parameters);
      } }, el("h2", {}, "Sign in to Anime365"),
      el("p", { className: "muted" }, "Playback requires an active Anime365 subscription."),
      ...(ui.token ? [token] : [email, password]),
      el("label", { className: "check" }, remember, "Remember me with macOS Keychain"), submit,
      el("p", { className: "fine" }, "Only your access token is saved. Your password is never stored."));
      if (ui.token) form.append(el("div", { className: "actions" },
        button("1. Open website login", () => perform("browser-login")),
        button("2. Get token", () => perform("browser-token"))));
      form.append(button(ui.token ? "Use email and password" : "Use a browser token instead", () => { ui.token = !ui.token; render(); }));
      return form;
    }

    function errorPanel() {
      const error = ui.error;
      if (!error && !state.notice) return null;
      const panel = el("section", { className: "notice", role: "status" },
        el("p", {}, error ? error.message : state.notice));
      if (error && ["login", "access"].includes(error.code)) panel.append(button("Sign in", () => { ui.login = true; render(); }));
      if (error && error.code === "subscription") panel.append(button("Open Anime365", () => perform("subscription")));
      if (error && ["playback", "network"].includes(error.code) && state.current) panel.append(button("Retry", () => perform("retry")));
      if (error && error.details && ["compatibility", "media-host"].includes(error.code)) {
        const report = el("textarea", { readOnly: true, rows: 9, value: JSON.stringify(error.details, null, 2), ariaLabel: "Safe compatibility report" });
        panel.append(el("p", { className: "fine" }, "Field names, types and hostnames only. No tokens or signed URLs."), report,
          button("Select report", () => { report.focus(); report.select(); }));
      }
      return panel;
    }

    async function search(more = false) {
      if (ui.busy || (more && !ui.nextPage)) return;
      const query = more ? ui.searchedQuery : ui.query;
      try {
        const result = await run("search", { query, page: more ? ui.nextPage : 1 });
        ui.results = more ? ui.results.concat(result.items) : result.items;
        ui.nextPage = result.nextPage;
        ui.searchedQuery = query;
        ui.tab = "search";
        ui.series = null;
        ui.episode = null;
        render();
      } catch (error) { /* run presents the safe host error. */ }
    }

    function searchForm() {
      return el("form", { className: "search", onsubmit: (event) => { event.preventDefault(); search(); } },
        el("input", { id: "search", type: "search", value: ui.query, placeholder: "Search anime titles", ariaLabel: "Search anime titles",
          oninput: (event) => { ui.query = event.target.value; }, minlength: 2, maxlength: 200, required: true }),
        el("button", { type: "submit", className: "primary", disabled: ui.busy > 0 }, "Search"));
    }

    function history() {
      const values = state.history.filter((value) => !value.completed || value.next);
      const list = el("section", { className: "list" });
      if (!state.user) list.append(empty("Your next episode starts here", "Sign in to keep viewing history on this Mac."));
      else if (!values.length) list.append(empty("Nothing to resume yet", "Search for a series and start an episode. Your place will appear here."));
      for (const value of values) {
        const episode = value.completed ? value.next : value.episode;
        list.append(el("div", { className: "row" }, el("div", { className: "row-copy" },
          button(value.series.title, () => selectSeries(value.series.id)),
          el("small", {}, episode.label + (value.completed ? " · Up next" : " · " + time(value.position) + (value.duration ? " / " + time(value.duration) : "")))),
        button(value.completed ? "Play next" : "Resume", () => perform("resume", { seriesId: value.series.id }), true)));
      }
      if (state.user && state.history.length) {
        list.append(ui.confirmClear ? el("div", { className: "actions" },
          el("span", {}, "Clear this account's history on this Mac?"),
          button("Clear history", () => { ui.confirmClear = false; perform("clear-history"); }),
          button("Cancel", () => { ui.confirmClear = false; render(); }))
          : button("Clear history", () => { ui.confirmClear = true; render(); }));
      }
      return list;
    }

    function empty(title, description) {
      return el("div", { className: "empty" }, el("h2", {}, title), el("p", {}, description));
    }

    function searchResults() {
      const list = el("section", { className: "list" });
      if (!ui.results.length) list.append(empty("No titles found", "Try a different title or spelling."));
      for (const value of ui.results) list.append(el("div", { className: "row" },
        el("div", { className: "row-copy" }, button(value.title, () => selectSeries(value.id)),
          el("small", {}, value.alternateTitle || [value.year, value.type].filter(Boolean).join(" · "))),
        button("Episodes", () => selectSeries(value.id))));
      if (ui.nextPage) {
        const more = button("Load more", () => search(true));
        more.disabled = ui.busy > 0;
        list.append(more);
      }
      return list;
    }

    function seriesView() {
      const value = ui.series;
      const section = el("section", {}, el("div", { className: "section-title" },
        button("Back", () => { ui.series = null; ui.episode = null; render(); }), el("h2", {}, value.title)));
      const episodes = el("div", { className: "episodes" });
      const ordered = value.episodes.slice().sort((a, b) => a.number - b.number || a.id - b.id);
      for (const episode of ordered) {
        const item = button(episode.label + (episode.type !== "tv" ? " · " + episode.type : ""), () => play(episode.id));
        item.disabled = !episode.active || ui.busy > 0;
        item.classList.toggle("selected", Boolean(state.current && state.current.episode.id === episode.id));
        episodes.append(item);
      }
      if (!ordered.length) episodes.append(empty("No episodes available", "Try this series again later."));
      section.append(episodes);
      if (ui.episode) section.append(translations());
      return section;
    }

    function translations() {
      const episode = ui.episode;
      const section = el("section", { className: "translations" }, el("h3", {}, episode.label + " · Choose translation"));
      const values = episode.translations.filter((value) => value.active);
      for (const value of values) section.append(el("div", { className: "row" },
        el("div", { className: "row-copy" }, el("strong", {}, translationLabel(value)),
          el("small", {}, value.height ? value.height + "p source" : "Resolution available when playing")),
        button("Play", () => play(episode.id, value.id), true)));
      if (!values.length) section.append(empty("No translations available", "This episode cannot be played yet."));
      return section;
    }

    function playbackControls() {
      const current = state.current;
      if (!current) return null;
      const quality = el("select", { ariaLabel: "Playback quality", value: state.quality,
        onchange: (event) => perform("quality", { value: event.target.value }) },
      el("option", { value: "highest" }, "Highest available"));
      const heights = [...new Set(current.qualities.filter((value) => value > 0))].sort((a, b) => b - a);
      if (state.quality !== "highest" && !heights.includes(Number(state.quality))) heights.push(Number(state.quality));
      heights.forEach((height) => quality.append(el("option", { value: String(height) }, height + "p")));
      quality.value = state.quality;
      return el("section", { className: "playback" }, el("small", { className: "eyebrow" }, "NOW PLAYING"),
        el("h2", {}, current.series.title), el("p", {}, current.episode.label + " · " + time(current.position) + " / " + time(current.duration)),
        el("p", { className: "muted" }, translationLabel(current.translation)),
        el("div", { className: "actions" }, button("Next episode", () => perform("next"), true),
          button("Translations", () => selectSeries(current.series.id).then(() => selectEpisode(current.episode.id))),
          button("Start over", () => perform("restart")),
          ...(["error", "stopped"].includes(current.status) ? [button("Retry", () => perform("retry"))] : [])),
        el("div", { className: "settings" }, el("label", { className: "check" },
          el("input", { type: "checkbox", checked: state.autoplay, onchange: (event) => perform("autoplay", { value: event.target.checked }) }), "Autoplay"), quality));
    }

    function render() {
      const active = document.activeElement;
      const focusId = active && active.id;
      const selection = active && active.selectionStart;
      const nodes = [header(), signIn(), errorPanel()];
      if (mode === "window") {
        nodes.push(searchForm(), el("nav", { className: "tabs" },
          button("Continue watching", () => { ui.tab = "history"; ui.series = null; render(); }),
          button("Search results", () => { ui.tab = "search"; ui.series = null; render(); })));
      } else nodes.push(button("Browse Anime365", () => perform("browse")));
      nodes.push(playbackControls());
      nodes.push(ui.series ? seriesView() : ui.tab === "search" ? searchResults() : history());
      if (ui.busy) nodes.push(el("div", { className: "working", role: "status" }, "Working…"));
      root.replaceChildren(...nodes.filter(Boolean));
      if (focusId && !["password", "token"].includes(focusId)) {
        const replacement = document.getElementById(focusId);
        if (replacement) { replacement.focus(); try { replacement.setSelectionRange(selection, selection); } catch (error) { /* Non-text input. */ } }
      }
    }

    render();
    perform("ready");
  }

  window.Anime365App = { mount };
})();
