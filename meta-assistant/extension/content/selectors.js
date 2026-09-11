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
  // So weit hoch, bis der Senden-Knopf mit drin liegt: dann ist der ganze
  // Antwortkasten erfasst — samt der Anhang-Vorschauen, die je nach Oberfläche
  // über oder unter dem Textfeld sitzen. Ohne diesen Anker zählt man je nach
  // Verschachtelung gar nichts oder Bilder aus dem Gesprächsverlauf mit.
  let el = box;
  for (let i = 0; i < 10 && el.parentElement; i++) {
    el = el.parentElement;
    if (el.tagName === 'FORM') break;
    if (Array.from(el.querySelectorAll('[aria-label],[role="button"],button'))
      .some(n => KP_SEND_RE.test((n.getAttribute('aria-label') || n.innerText || '').trim()))) break;
  }
  return el || box.parentElement;
}

// Wie viele der gerade angehängten Dateien liegen im Feld?
//
// Am echten Posteingang gemessen (11.09.): die Business Suite zeigt Anhänge als
// ZEILEN MIT DATEINAMEN ("KP049.jpg" + ✕), nicht als Bildvorschauen. Die erste
// Fassung suchte nach blob:-Bildern, fand nie etwas, meldete „nicht angekommen"
// und probierte den nächsten Weg — am Ende hingen dieselben zehn Fotos dreimal
// im Feld. Deshalb wird jetzt nach den NAMEN gesucht, die wir selbst vergeben
// haben (KP049.jpg …): sprachunabhängig, unabhängig vom Markup und eindeutig.
function kpAttachmentCount(names) {
  if (names && names.length) {
    const area = kpComposerArea();
    let txt = '';
    try { txt = (area && area.innerText) || ''; } catch (e) { /* egal */ }
    let hit = names.filter(n => txt.indexOf(n) >= 0).length;
    if (!hit) {                       // Zeilen sitzen ausserhalb des Antwortkastens
      try { txt = document.body.innerText || ''; } catch (e) { txt = ''; }
      hit = names.filter(n => txt.indexOf(n) >= 0).length;
    }
    return hit;
  }
  // Ohne Namen (Fixture, Sonderfälle): die alten Merkmale
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
// Erst im Antwortkasten suchen, dann im ganzen Dokument, und zuletzt nach einem
// blossen Textknoten „Senden" (Meta rendert den Knopf schon mal als Span in
// einem klickbaren Eltern-Element, ohne aria-label).
function kpFindSendButton() {
  const area = kpComposerArea();
  const scopes = area && area !== document ? [area, document] : [document];
  for (const scope of scopes) {
    for (const c of scope.querySelectorAll('[data-kp="send"], [role="button"], button')) {
      const lbl = (c.getAttribute('aria-label') || c.getAttribute('title') || c.innerText || '').trim();
      if (KP_SEND_RE.test(lbl) && c.offsetParent !== null && c.getAttribute('aria-disabled') !== 'true') return c;
    }
  }
  for (const scope of scopes) {
    for (const n of scope.querySelectorAll('span, div')) {
      if (!KP_SEND_RE.test((n.textContent || '').trim())) continue;
      if (n.children.length || n.offsetParent === null) continue;      // nur der reine Textknoten
      const hit = n.closest('[role="button"], button, [tabindex]') || n.parentElement;
      if (hit) return hit;
    }
  }
  return null;
}

// Ein .click() reicht manchen Oberflächen nicht — sie hängen an den Maus-
// Ereignissen davor. Deshalb die ganze Kette, so wie ein echter Klick sie macht.
function kpClickHard(el) {
  if (!el) return false;
  const o = { bubbles: true, cancelable: true, view: window, button: 0 };
  try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* egal */ }
  try { el.dispatchEvent(new PointerEvent('pointerdown', o)); } catch (e) { /* alt: kein PointerEvent */ }
  try { el.dispatchEvent(new MouseEvent('mousedown', o)); } catch (e) { /* egal */ }
  try { el.dispatchEvent(new PointerEvent('pointerup', o)); } catch (e) { /* egal */ }
  try { el.dispatchEvent(new MouseEvent('mouseup', o)); } catch (e) { /* egal */ }
  try { el.click(); } catch (e) { try { el.dispatchEvent(new MouseEvent('click', o)); } catch (e2) { return false; } }
  return true;
}

// Name des offenen Chats — nur für die Rückfrage vor dem Versand.
function kpCustomerName() {
  const el = kpQuery(KPSEL.customerName);
  return el ? (el.innerText || '').trim() : '';
}
