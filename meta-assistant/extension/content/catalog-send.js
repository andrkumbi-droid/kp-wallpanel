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
    const blob = await (await fetch(r.dataUrl)).blob();
    if (!blob || blob.size < 500) { this._files.set(item.img, null); return null; }   // Platzhalter- oder Fehlerseite
    const file = new File([blob], item.code + '.jpg', { type: blob.type || 'image/jpeg' });
    this._files.set(item.img, file);
    return file;
  },

  // ── Dateien in den Composer bekommen ──────────────────────────────────────
  // Drei Wege, weil Meta ihr Markup ohne Vorwarnung ändert. Der erste, der
  // greift, gewinnt; welcher es war, steht in der Statuszeile (für die Fehlersuche).
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

  // Warten, bis die Vorschaubildchen im Composer stehen — vorher zu senden
  // schickt eine leere Nachricht.
  async waitAttached(want, ms) {
    const limit = ms || 20000, t0 = Date.now();
    while (Date.now() - t0 < limit) {
      if (kpAttachmentCount() > 0) {
        // noch kurz nachladen lassen, bis die Zahl steht
        let n = kpAttachmentCount(), stable = 0;
        while (Date.now() - t0 < limit && stable < 3) {
          await this.sleep(400);
          const m = kpAttachmentCount();
          if (m === n) stable++; else { n = m; stable = 0; }
        }
        return n;
      }
      await this.sleep(300);
    }
    return 0;
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

  // Gesendet = die Vorschauen sind wieder weg.
  async waitSent(ms) {
    const limit = ms || 25000, t0 = Date.now();
    while (Date.now() - t0 < limit) {
      if (kpAttachmentCount() === 0) return true;
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
        const how = this.attach(files);
        if (!how) { say('⚠ ไม่พบช่องพิมพ์ — เปิดแชทไว้หรือยัง? / kein Chat offen?'); return { ok: false, reason: 'composer_not_found', sent, missing }; }
        const n = await this.waitAttached(files.length);
        if (!n) { say('⚠ ใส่รูปไม่สำเร็จ / Bilder nicht übernommen (' + how + ')'); return { ok: false, reason: 'attach_failed', how, sent, missing }; }

        if (dry) { say('🧪 ทดสอบ: ' + n + ' รูปอยู่ในช่องแล้ว (' + how + ') — ยังไม่ได้ส่ง / nichts gesendet'); return { ok: true, dry: true, attached: n, how, missing }; }

        this.send();
        if (!await this.waitSent()) { say('⚠ ชุดที่ ' + (b + 1) + ' ส่งไม่ออก — กดส่งเองแล้วเริ่มใหม่ / von Hand senden'); return { ok: false, reason: 'send_failed', sent, missing }; }
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
