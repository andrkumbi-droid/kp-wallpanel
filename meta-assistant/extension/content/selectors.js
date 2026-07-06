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
