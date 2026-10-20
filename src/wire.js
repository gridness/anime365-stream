// IINA 1.5.0 embeds outgoing JSON inside a JavaScript template literal.
// Hex keeps backticks and interpolation syntax out of the native bridge.
// ASVS 1.2.1, 3.5.5: encode before crossing this interpreter boundary.
function encode(value) {
  const json = JSON.stringify(value);
  if (json.length > 1000000) throw new Error("Message exceeds the view limit");
  let wire = "";
  for (let index = 0; index < json.length; index += 1) {
    wire += json.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return { wire };
}

function send(view, value) {
  view.postMessage("anime365", encode(value));
}

module.exports = { encode, send };
