// ── ALLE VERFÜGBAREN PRODUKTFOTOS MIT EINEM KLICK ────────────────────────────
// Der Chat der Business Suite nimmt nur 10 Bilder pro Nachricht. Von Hand hieß
// das: Ordner öffnen, 10 Fotos kopieren, einfügen, senden, zurück zum Ordner,
// wieder von vorn — fünf Runden pro Kunde, bei fünfzig Kunden am Tag. Hier
// macht das die Maschine: Liste holen, Fotos laden, in 10er-Schüben einfügen
// und senden.
//
// Die Liste kommt aus pub/chatCatalog (die KP-App schreibt sie selbst: nur was
// einen Lagersatz hat und nicht ausverkauft ist). Ausverkauft in der App = fällt
// hier sofort raus. Es gibt KEINEN Bilderordner mehr zu pflegen.
//
// Geladen wird über den Service Worker, nicht per fetch() von hier: ein
// Content-Script erbt die Herkunft von facebook.com und liefe in CORS.

const KPCAT = {
  CATALOG_URL: 'https://kp-wallpanel-default-rtdb.asia-southeast1.firebasedatabase.app/pub/chatCatalog.json',
  BATCH: 10,          // Metas Limit pro Nachricht
  GAP_MS: 1800,       // Pause zwischen den Schüben — im Sekundentakt sieht es für
                      // Metas Automatikerkennung nach Spam aus
  busy: false,

  bg(msg) {
    return new Promise(res => chrome.runtime.sendMessage(msg, r => res(r || { error: 'no_response' })));
  },

  async catalog() {
    const r = await this.bg({ type: 'fetchJson', url: this.CATALOG_URL });
    if (!r || r.error) throw new Error(r && r.error ? r.error : 'catalog_failed');
    const data = r.data;
    if (!data || !Array.isArray(data.items) || !data.items.length) throw new Error('catalog_empty');
    return data;
  },

  // Ein Foto → File. Fehlt es im Repo (404), kommt null zurück und der Code
  // landet in der Fehlliste, statt still zu verschwinden.
  _files: new Map(),   // Kunde 2 bis 50 bekommen dieselben Fotos — einmal laden reicht
  async photo(item) {
    if (this._files.has(item.img)) return this._files.get(item.img);
    const r = await this.bg({ type: 'fetchImage', url: item.img });
    if (!r || !r.ok || !r.dataUrl) { this._files.set(item.img, null); return null; }
    const blob = kpDataUrlToBlob(r.dataUrl);
    if (!blob || blob.size < 500) { this._files.set(item.img, null); return null; }   // Platzhalter- oder Fehlerseite
    const file = new File([blob], item.code + '.jpg', { type: blob.type || 'image/jpeg' });
    this._files.set(item.img, file);
    return file;
  },

  // ── Dateien in den Composer bekommen ──────────────────────────────────────
  // Drei Wege, weil Meta ihr Markup ohne Vorwarnung ändert. Der erste, der
  // greift, gewinnt; welcher es war, steht in der Statuszeile (für die Fehlersuche).
  // Erst die Seiten-Welt fragen (main-hook.js): nur von dort kommt man an Metas
  // Datei-Feld, das es erst nach dem Klick auf 'Datei anhängen' gibt.
  attachViaPage(files, way) {
    return new Promise(res => {
      let done = false;
      const onResult = ev => {
        if (done) return; done = true;
        window.removeEventListener('kp-attach-result', onResult);
        res((ev.detail && ev.detail.how) || null);
      };
      window.addEventListener('kp-attach-result', onResult);
      window.dispatchEvent(new CustomEvent('kp-attach', { detail: { files, way } }));
      setTimeout(() => { if (!done) { done = true; window.removeEventListener('kp-attach-result', onResult); res(null); } }, 8000);
    });
  },

  // Die Wege der Reihe nach durchprobieren und jedes Mal NACHSEHEN, ob wirklich
  // Vorschaubilder erschienen sind. Ein Weg, der sich ausführen ließ, ist noch
  // kein Weg, der funktioniert hat — genau daran ist der erste Versuch am
  // echten Posteingang gescheitert (gemeldet wurde 'paste', angekommen war nichts).
  _way: null,   // der Weg, der beim ersten Schub geklappt hat — danach direkt der
  async attachAny(files) {
    const names = files.map(f => f.name);
    const all = ['input', 'paste', 'drop', 'iso'];
    const order = this._way ? [this._way].concat(all.filter(w => w !== this._way)) : all;
    for (const way of order) {
      const started = (way === 'iso') ? this.attach(files) : await this.attachViaPage(files, way);
      if (!started) continue;
      const n = await this.waitAttached(names, 8000);
      if (n >= names.length) { this._way = way; return { how: way, n, names }; }
      // Teilweise angekommen: NICHT den nächsten Weg probieren, sonst hängen
      // dieselben Fotos doppelt im Feld (genau das ist am 11.09. passiert).
      if (n > 0) return { how: way, n, names, partial: true };
    }
    return null;
  },

  attach(files) {
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));

    // Weg 1: das versteckte Datei-Feld direkt füttern — am stabilsten
    const input = kpQuery(KPSEL.fileInput);
    if (input) {
      try {
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 'input';
      } catch (e) { /* weiter mit Weg 2 */ }
    }

    const box = kpFindComposer();
    if (!box) return null;
    box.focus();

    // Weg 2: synthetisches Einfügen (so, wie Strg+V aussieht)
    try {
      box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return 'paste';
    } catch (e) { /* weiter mit Weg 3 */ }

    // Weg 3: Drag & Drop auf das Antwortfeld
    try {
      ['dragenter', 'dragover', 'drop'].forEach(t =>
        box.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true })));
      return 'drop';
    } catch (e) { return null; }
  },

  // Warten, bis die angehängten Dateien im Feld stehen — vorher zu senden
  // schickt eine leere Nachricht. Gezählt wird über die Dateinamen.
  async waitAttached(names, ms) {
    const want = names.length, limit = ms || 20000, t0 = Date.now();
    let n = 0;
    while (Date.now() - t0 < limit) {
      n = kpAttachmentCount(names);
      if (n >= want) return n;
      await this.sleep(300);
    }
    return n;   // 0 = gar nichts, dazwischen = nur ein Teil
  },

  // Senden: erst der Knopf (sprachunabhängig über aria-label), sonst Enter.
  send() {
    const btn = kpFindSendButton();
    if (btn) { btn.click(); return 'button'; }
    const box = kpFindComposer();
    if (!box) return null;
    box.focus();
    ['keydown', 'keypress', 'keyup'].forEach(t => box.dispatchEvent(new KeyboardEvent(t, {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
    })));
    return 'enter';
  },

  // Gesendet = die Dateizeilen sind wieder weg.
  async waitSent(names, ms) {
    const limit = ms || 25000, t0 = Date.now();
    while (Date.now() - t0 < limit) {
      if (kpAttachmentCount(names) === 0) return true;
      await this.sleep(400);
    }
    return false;
  },

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  // ── Der eigentliche Lauf ──────────────────────────────────────────────────
  async sendAll(opts) {
    const dry = !!(opts && opts.dryRun);
    const say = (opts && opts.onStatus) || function () {};
    if (this.busy) { say('⏳ กำลังส่งอยู่ / läuft schon…'); return { ok: false, reason: 'busy' }; }

    let data;
    try { data = await this.catalog(); }
    catch (e) { say('⚠ โหลดรายการสินค้าไม่ได้ / Katalog nicht erreichbar (' + e.message + ')'); return { ok: false, reason: e.message }; }

    const items = data.items;
    const batches = Math.ceil(items.length / this.BATCH);
    const who = kpCustomerName() || 'diesen Chat';
    if (!dry && !confirm(
      'ส่งรูปสินค้า ' + items.length + ' รูป ให้ ' + who + ' ไหม?\n'
      + batches + ' ข้อความ (ข้อความละไม่เกิน ' + this.BATCH + ' รูป) ใช้เวลาราว '
      + Math.ceil(batches * (this.GAP_MS + 5000) / 1000) + ' วินาที\n\n'
      + 'ระหว่างส่ง อย่าเปลี่ยนแชท / während des Versands den Chat nicht wechseln.'))
      return { ok: false, reason: 'cancelled' };

    this.busy = true;
    const missing = [];
    let sent = 0, msgs = 0;
    try {
      for (let b = 0; b < batches; b++) {
        const slice = items.slice(b * this.BATCH, (b + 1) * this.BATCH);
        say('📥 ชุดที่ ' + (b + 1) + '/' + batches + ' — โหลดรูป…');
        const files = [];
        for (const it of slice) {
          const f = await this.photo(it);
          if (f) files.push(f); else missing.push(it.code);
        }
        if (!files.length) continue;

        say('📎 ชุดที่ ' + (b + 1) + '/' + batches + ' — ใส่ ' + files.length + ' รูป…');
        const got = await this.attachAny(files);
        if (!got) { say('⚠ ใส่รูปไม่สำเร็จ / Bilder nicht übernommen (input·paste·drop)'); return { ok: false, reason: 'attach_failed', sent, missing }; }
        const how = got.how, n = got.n;
        if (got.partial) {
          say('⚠ ใส่รูปได้แค่ ' + n + '/' + files.length + ' (' + how + ') — ลบรูปในช่องแล้วเริ่มใหม่ / Feld leeren und neu starten');
          return { ok: false, reason: 'attach_partial', how, n, sent, missing };
        }

        if (dry) { say('🧪 ทดสอบ: ' + n + ' รูปอยู่ในช่องแล้ว (' + how + ') — ยังไม่ได้ส่ง / nichts gesendet'); return { ok: true, dry: true, attached: n, how, missing }; }

        this.send();
        if (!await this.waitSent(got.names)) { say('⚠ ชุดที่ ' + (b + 1) + ' ส่งไม่ออก — กดส่งเองแล้วเริ่มใหม่ / von Hand senden'); return { ok: false, reason: 'send_failed', sent, missing }; }
        sent += n; msgs++;
        say('✅ ส่งแล้ว ' + sent + '/' + items.length + ' (' + msgs + ' ข้อความ)');
        if (b < batches - 1) await this.sleep(this.GAP_MS);
      }
    } finally { this.busy = false; }

    say('✅ เสร็จ / fertig: ' + sent + ' รูป · ' + msgs + ' ข้อความ'
      + (missing.length ? ' · ⚠ ยังไม่มีรูป / ohne Foto: ' + missing.join(', ') : ''));
    return { ok: true, sent, msgs, missing };
  }
};

// Base64 → Blob von Hand. fetch('data:…') wäre kürzer, ist auf facebook.com
// aber durch deren Content-Security-Policy gesperrt (ERR_INVALID_URL) — am
// echten Posteingang gemessen, nicht vermutet.
function kpDataUrlToBlob(dataUrl) {
  try {
    const [head, b64] = String(dataUrl).split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  } catch (e) { return null; }
}
