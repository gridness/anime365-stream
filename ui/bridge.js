(() => {
  function createBridge(receive) {
    const pending = new Map();
    let sequence = 0;

    function decode(envelope) {
      const value = envelope && envelope.wire;
      if (typeof value !== "string" || value.length % 4 || value.length > 4000000 || !/^[a-f0-9]*$/.test(value)) {
        throw new Error("Invalid host message");
      }
      let json = "";
      for (let index = 0; index < value.length; index += 4) {
        json += String.fromCharCode(parseInt(value.slice(index, index + 4), 16));
      }
      return JSON.parse(json);
    }

    iina.onMessage("anime365", (envelope) => {
      const message = decode(envelope);
      if (message.type === "state") receive(message.value);
      if (message.type === "result") {
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.ok) request.resolve(message.value);
        else request.reject(message.error);
      }
    });

    return function call(action, parameters = {}) {
      const id = "view-" + String(++sequence);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject({ code: "timeout", message: "IINA did not respond. Reopen the Anime365 window and retry." });
        }, 65000);
        pending.set(id, { resolve, reject, timer });
        iina.postMessage("rpc", { id, action, parameters });
      });
    };
  }

  window.Anime365Bridge = { createBridge };
})();
