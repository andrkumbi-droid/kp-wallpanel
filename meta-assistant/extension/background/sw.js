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
