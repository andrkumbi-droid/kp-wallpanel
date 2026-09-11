// Background service worker — the ONLY place that talks to the backend.
// Holds no secrets: the Apps Script URL + shared token come from the
// options page (chrome.storage.sync). API keys live only in Apps Script.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'api') return;
  (async () => {
    const { backendUrl, token } = await chrome.storage.sync.get(['backendUrl', 'token']);
    if (!backendUrl) return sendResponse({ error: 'Backend-URL fehlt — Extension-Optionen öffnen' });
    const res = await fetch(backendUrl, {
      method: 'POST',
      // text/plain avoids the CORS preflight that Apps Script web apps can't answer
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...msg.payload, token })
    });
    sendResponse(await res.json());
  })().catch(e => sendResponse({ error: String(e) }));
  return true; // async sendResponse
});

// ── Laden für den Massen-Foto-Versand ────────────────────────────────────────
// Content-Scripts erben die Herkunft von facebook.com, ein fetch() auf die
// Firebase-Datenbank oder auf GitHub Pages liefe dort in CORS. Der Service
// Worker hat host_permissions und darf beides holen.
// Bilder gehen als data:-URL zurück, weil chrome.runtime.sendMessage nur
// JSON-fähige Werte überträgt (kein Blob, kein ArrayBuffer).
const KP_ALLOWED = [
  'https://kp-wallpanel-default-rtdb.asia-southeast1.firebasedatabase.app/',
  'https://andrkumbi-droid.github.io/kp-wallpanel/'
];
function kpAllowed(url) { return KP_ALLOWED.some(p => String(url || '').startsWith(p)); }

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'fetchJson' && msg.type !== 'fetchImage') return;
  if (!kpAllowed(msg.url)) { sendResponse({ error: 'url_not_allowed' }); return; }
  (async () => {
    // Der Katalog muss frisch sein (ausverkauft!), die Fotos aendern sich fast nie
    // und duerfen aus dem Browser-Cache kommen — bei 50 Kunden am Tag spart das
    // ein Vielfaches der Bandbreite.
    const res = await fetch(msg.url, { cache: msg.type === 'fetchJson' ? 'no-cache' : 'default' });
    if (msg.type === 'fetchJson') {
      if (!res.ok) return sendResponse({ error: 'http_' + res.status });
      return sendResponse({ data: await res.json() });
    }
    if (!res.ok) return sendResponse({ ok: false, status: res.status });
    const blob = await res.blob();
    const dataUrl = await new Promise((ok, bad) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = () => bad(fr.error);
      fr.readAsDataURL(blob);
    });
    sendResponse({ ok: true, dataUrl, size: blob.size });
  })().catch(e => sendResponse({ error: String(e) }));
  return true; // async sendResponse
});
