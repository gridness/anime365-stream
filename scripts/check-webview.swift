import AppKit
import WebKit

final class Probe: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
  var view: WKWebView!
  var failed = false
  var search = false
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    print("WebKit: \(message.body)")
    failed = true
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
      webView.evaluateJavaScript("JSON.stringify({text: document.body.innerText, inputs: document.querySelectorAll('input').length, search: window.searchProbeDone === true})") { result, error in
        if let error { print(error.localizedDescription); exit(1) }
        let value = result as? String ?? ""
        print(value)
        let ready = value.contains("Search") || value.contains("Browse Anime365")
        let searched = !self.search || value.contains("\"search\":true")
        exit(!self.failed && value.contains("Anime365") && ready && searched ? 0 : 1)
      }
    }
  }
}

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let file = root.appendingPathComponent(CommandLine.arguments.dropFirst().first(where: { !$0.hasPrefix("--") }) ?? "ui/window/index.html")
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let probe = Probe()
probe.search = CommandLine.arguments.contains("--search")
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
config.userContentController.add(probe, name: "probe")
let bridge = """
window.iina = {listeners: {}, onMessage(name, callback) { this.listeners[name] = callback; }, postMessage() {}};
addEventListener('error', e => webkit.messageHandlers.probe.postMessage(e.message || ('Resource failed: ' + (e.target.src || e.target.href))), true);
addEventListener('unhandledrejection', e => webkit.messageHandlers.probe.postMessage(String(e.reason)));
addEventListener('securitypolicyviolation', e => webkit.messageHandlers.probe.postMessage('CSP: ' + e.violatedDirective + ' ' + e.blockedURI));
"""
config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
if probe.search {
  let searchBridge = """
  iina.postMessage = (name, request) => {
    const send = (message) => {
      const json = JSON.stringify(message);
      let wire = '';
      for (let i = 0; i < json.length; i++) wire += json.charCodeAt(i).toString(16).padStart(4, '0');
      iina.listeners.anime365({wire});
    };
    if (request.action === 'ready') {
      send({type: 'state', value: {user: null, history: [], autoplay: true, quality: 'highest', current: null}});
      send({type: 'result', id: request.id, ok: true});
    }
    if (request.action === 'search') {
      if (request.parameters.query !== 'Naruto') throw new Error('Load more changed query');
      const second = request.parameters.page === 2;
      send({type: 'result', id: request.id, ok: true, value: {
        items: [{id: second ? 4530 : 2440, title: second ? 'Naruto: Shippuuden' : 'Naruto: Shounen Hen'}], nextPage: second ? null : 2
      }});
    }
  };
  addEventListener('DOMContentLoaded', () => setTimeout(() => {
    const field = document.getElementById('search');
    field.value = 'Naruto';
    field.dispatchEvent(new Event('input'));
    document.querySelector('form.search').dispatchEvent(new Event('submit', {cancelable: true}));
    setTimeout(() => {
      if (document.querySelector('.row-copy button').textContent !== 'Naruto: Shounen Hen') throw new Error('Missing ranked search result');
      const edited = document.getElementById('search');
      edited.value = 'Changed query';
      edited.dispatchEvent(new Event('input'));
      Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Load more').click();
      setTimeout(() => {
        const results = Array.from(document.querySelectorAll('.row-copy button')).map(button => button.textContent);
        if (results.join('|') !== 'Naruto: Shounen Hen|Naruto: Shippuuden') throw new Error('Pagination lost result order');
        window.searchProbeDone = true;
      }, 50);
    }, 50);
  }, 50));
  """
  config.userContentController.addUserScript(WKUserScript(source: searchBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
}
probe.view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600), configuration: config)
probe.view.navigationDelegate = probe
if file.path.contains("/sidebar/") {
  probe.view.load(URLRequest(url: file))
} else {
  probe.view.loadFileURL(file, allowingReadAccessTo: root)
}
DispatchQueue.main.asyncAfter(deadline: .now() + 15) { print("WebKit timed out"); exit(1) }
app.run()
