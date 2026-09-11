// ALL DOM knowledge about Meta Business Suite lives in THIS file.
// When Meta changes their markup, this is the only file to fix.
//
// Each entry is a list of selectors tried in order:
//   [0] data-kp-* — used by fixtures/inbox-snapshot.html for offline dev
//   [1+] real Business Suite selectors — TO BE FILLED IN from the live
//        inbox (see docs/CONCEPT.md "Selector discovery").
// kpFind/kpFindAll return the first selector list entry that matches.

const KPSEL = {
  // The scrollable thread containing all message bubbles of the open conversation
  thread: ['[data-kp="thread"]', '[role="main"]'],
  // One message row (incoming or outgoing)
  messageRow: ['[data-kp="msg"]', null],
  // Given a message row: is it FROM the customer? (fixture: data-dir="in")
  isIncoming: function (row) {
    if (row.dataset && row.dataset.dir) return row.dataset.dir === 'in';
    // TODO real inbox: incoming rows are usually left-aligned / lack the "sent by page" marker.
    return false;
  },
  // Given a message row: the plain message text
  messageText: function (row) {
    const el = row.querySelector('[data-kp="text"]') || row;
    return (el.innerText || '').trim();
  },
  // The reply composer (contenteditable). Business Suite uses a rich-text box.
  composer: ['[data-kp="composer"]', 'div[role="textbox"][contenteditable="true"]'],
  // Customer display name of the open conversation (for app-customer matching)
  customerName: ['[data-kp="customer-name"]', null]
};

function kpQuery(list, root) {
  for (const sel of Array.isArray(list) ? list : [list]) {
    if (!sel) continue;
    const el = (root || document).querySelector(sel);
    if (el) return el;
  }
  return null;
}
function kpQueryAll(list, root) {
  for (const sel of Array.isArray(list) ? list : [list]) {
    if (!sel) continue;
    const els = (root || document).querySelectorAll(sel);
    if (els.length) return Array.from(els);
  }
  return [];
}
const KP_THAI_RE = /[฀-๿]/;

// ── Bild-Versand: Datei-Feld, Anhang-Vorschauen, Senden-Knopf ───────────────
// Alles, was der Massen-Foto-Versand (catalog-send.js) vom Markup wissen muss.
// Ändert Meta etwas, wird NUR hier nachgezogen.
KPSEL.fileInput = ['[data-kp="file-input"]', 'input[type="file"][accept*="image"]', 'input[type="file"]'];

// Der Kasten um das Antwortfeld — Vorschauen und Senden-Knopf stehen darin,
// und nur darin darf gesucht werden (sonst zählt man Bilder aus dem Verlauf mit).
function kpComposerArea() {
  const box = kpQuery(KPSEL.composer);
  if (!box) return null;
  let el = box;
  for (let i = 0; i < 6 && el.parentElement; i++) {
    el = el.parentElement;
    if (el.tagName === 'FORM') break;
  }
  return el || box.parentElement;
}

// Wie viele Anhänge liegen gerade im Feld? Vorschauen sind blob:-Bilder bzw.
// Kacheln mit einem Entfernen-Knopf.
function kpAttachmentCount() {
  const area = kpComposerArea();
  if (!area) return 0;
  const fx = area.querySelectorAll('[data-kp="attachment"]');
  if (fx.length) return fx.length;
  const blobs = area.querySelectorAll('img[src^="blob:"], img[src^="data:image"]');
  if (blobs.length) return blobs.length;
  return area.querySelectorAll('[aria-label*="Remove" i], [aria-label*="Entfernen" i], [aria-label*="ลบ"]').length;
}

// Senden-Knopf, sprachunabhängig: Business Suite läuft je nach Konto auf
// Englisch, Deutsch oder Thai.
const KP_SEND_RE = /^(send|senden|ส่ง|ส่งข้อความ)$/i;
function kpFindSendButton() {
  const area = kpComposerArea() || document;
  const cands = area.querySelectorAll('[data-kp="send"], [role="button"], button');
  for (const c of cands) {
    const lbl = (c.getAttribute('aria-label') || c.getAttribute('title') || c.innerText || '').trim();
    if (KP_SEND_RE.test(lbl) && c.offsetParent !== null && c.getAttribute('aria-disabled') !== 'true') return c;
  }
  return null;
}

// Name des offenen Chats — nur für die Rückfrage vor dem Versand.
function kpCustomerName() {
  const el = kpQuery(KPSEL.customerName);
  return el ? (el.innerText || '').trim() : '';
}
