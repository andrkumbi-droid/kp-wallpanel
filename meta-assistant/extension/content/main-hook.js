// ── ANHÄNGEN IN DER SEITEN-WELT ──────────────────────────────────────────────
// Diese Datei läuft als EINZIGE der Erweiterung in der Welt der Seite selbst
// ("world": "MAIN" im Manifest). Nötig, weil zwei Dinge nur von hier aus gehen:
//
// 1. Die Business Suite hat KEIN Datei-Feld im Dokument — geprüft am echten
//    Posteingang: document.querySelectorAll('input[type=file]') ist leer. Meta
//    legt das Feld erst an, wenn man „Datei anhängen" drückt, und ruft sofort
//    .click() darauf — das öffnet den Windows-Dateidialog. Wir hängen uns kurz
//    in HTMLInputElement.prototype.click, fangen genau diesen Aufruf ab (kein
//    Dialog!) und behalten das Feld. Prototypen sind pro JS-Welt, aus einem
//    normalen Content-Script heraus greift dieser Haken also nicht.
// 2. Ein Einfügen-Ereignis aus der Seiten-Welt hat bessere Chancen, von Metas
//    eigenen Handlern angenommen zu werden.
//
// Gesprochen wird über Ereignisse am window: 'kp-attach' herein (mit den
// Dateien), 'kp-attach-result' zurück (welcher Weg gegriffen hat).

(() => {
  const ATTACH_RE = /datei anh|anhängen|attach|แนบ|เพิ่มไฟล์/i;

  function findAttachBtn() {
    for (const n of document.querySelectorAll('[aria-label]')) {
      if (ATTACH_RE.test(n.getAttribute('aria-label') || '')) return n;
    }
    return null;
  }
  function composer() {
    const b = document.querySelectorAll('div[role="textbox"][contenteditable="true"]');
    return b[b.length - 1] || null;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Metas Datei-Feld einsammeln, ohne dass der Dateidialog aufgeht.
  async function grabInput() {
    const btn = findAttachBtn();
    if (!btn) return null;
    const orig = HTMLInputElement.prototype.click;
    let caught = null;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') { caught = this; return; }   // Dialog abgefangen
      return orig.apply(this, arguments);
    };
    try { btn.click(); } catch (e) { /* egal, wir stellen gleich zurück */ }
    // Manche Oberflächen legen das Feld erst im nächsten Tick an
    for (let i = 0; i < 12 && !caught; i++) await sleep(50);
    HTMLInputElement.prototype.click = orig;
    return caught;
  }

  // Jeweils EIN Weg pro Aufruf. Ob er wirklich etwas bewirkt hat, prüft die
  // andere Seite an den Vorschaubildern — deshalb wird hier nur gemeldet, ob
  // der Weg überhaupt ausgeführt werden konnte.
  window.addEventListener('kp-attach', async ev => {
    const files = (ev.detail && ev.detail.files) || [];
    const way = (ev.detail && ev.detail.way) || 'input';
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    let how = null;

    try {
      if (way === 'input') {
        const input = await grabInput();
        if (input) {
          input.files = dt.files;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          how = 'input';
        }
      } else if (way === 'paste') {
        const box = composer();
        if (box) {
          box.focus();
          box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
          how = 'paste';
        }
      } else if (way === 'drop') {
        const box = composer();
        if (box) {
          ['dragenter', 'dragover', 'drop'].forEach(t =>
            box.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true })));
          how = 'drop';
        }
      }
    } catch (e) { how = null; }

    window.dispatchEvent(new CustomEvent('kp-attach-result', { detail: { how, way } }));
  });
})();
