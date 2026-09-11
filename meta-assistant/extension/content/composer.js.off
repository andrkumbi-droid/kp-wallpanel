// Find the Business Suite reply box and insert text into it.
// Meta's composer is a rich-text editor (Lexical/Draft-style): setting
// .value / .innerText does NOT register with its internal state, so we
// simulate real text input. Fallback: clipboard + hint to paste.

function kpFindComposer() {
  return kpQuery(KPSEL.composer);
}

async function kpInsertReply(text) {
  const box = kpFindComposer();
  if (!box) return { ok: false, reason: 'composer_not_found' };

  box.focus();
  // Select-all so repeated inserts replace instead of append
  document.execCommand('selectAll', false, null);

  // Path 1: execCommand insertText — still the most reliable way to feed
  // React/Lexical editors from a content script.
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }

  // Path 2: synthetic beforeinput/input events
  if (!ok || (box.innerText || '').trim() === '') {
    try {
      box.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
      box.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
      ok = (box.innerText || '').indexOf(text.slice(0, 10)) >= 0;
    } catch (e) { ok = false; }
  }

  // Path 3: clipboard fallback — user pastes manually with Ctrl+V
  if (!ok) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: false, reason: 'clipboard', hint: 'Text kopiert — mit Ctrl+V ins Antwortfeld einfügen' };
    } catch (e) {
      return { ok: false, reason: 'insert_failed' };
    }
  }
  return { ok: true };
}
