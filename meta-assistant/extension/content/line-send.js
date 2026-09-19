// ── ALLE VERFÜGBAREN PRODUKTFOTOS MIT EINEM KLICK — LINE-FASSUNG ────────────
// Gegenstück zu catalog-send.js (Meta). Heißt absichtlich ebenfalls KPCAT und
// hat dieselben vier Berührungspunkte (BATCH, catalog, photo, sendAll), damit
// overlay.js für beide Seiten unverändert bleibt. Geladen wird immer nur eine
// der beiden Dateien — das Manifest entscheidet nach Hostname.
//
// Katalog und Fotos sind identisch zu Meta: pub/chatCatalog aus der KP-App
// (nur Lagersatz vorhanden und nicht ausverkauft) und img/products/<CODE>.jpg
// von GitHub Pages. Es gibt keinen Bilderordner zu pflegen.
//
// Der Ablauf ist ein ANDERER als bei Meta und deshalb eine eigene Datei:
//   Datei-Feld füllen → LINE öffnet einen Bestätigungsdialog mit Vorschau →
//   Anzahl im Dialog prüfen → Senden → warten, bis die Bilder im Verlauf stehen.
// Bei Meta gibt es keinen Dialog; dort wird angehängt, auf Uploads gewartet und
// blind gesendet. Die beiden Abläufe in eine Datei zu zwängen hätte die
// funktionierende Meta-Seite gefährdet, und die war teuer erkauft.

const KPCAT = {
  CATALOG_URL: 'https://kp-wallpanel-default-rtdb.asia-southeast1.firebasedatabase.app/pub/chatCatalog.json',
  BATCH: 10,          // LINEs hartes Limit: bei 11 kommt gar kein Dialog mehr,
                      // sondern „Sorry, you can only send up to 10 files at once."
  GAP_MS: 1200,       // Pause zwischen den Schüben. LINE ist schnell (10 Bilder in
                      // ~0,5 s), im Sekundentakt zu feuern wäre trotzdem unklug.
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
  // Geladen wird über den Service Worker: chat.line.biz blockiert zwar nichts
  // (anders als facebook.com), aber so liegt der Cache an einer Stelle und
  // Kunde 2 bis 50 bekommen dieselben Dateien ohne neuen Download.
  _files: new Map(),
  async photo(item) {
    if (this._files.has(item.img)) return this._files.get(item.img);
    const r = await this.bg({ type: 'fetchImage', url: item.img });
    if (!r || !r.ok || !r.dataUrl) { this._files.set(item.img, null); return null; }
    const blob = kpLineDataUrlToBlob(r.dataUrl);
    if (!blob || blob.size < 500) { this._files.set(item.img, null); return null; }  // Platzhalter/Fehlerseite
    const file = new File([blob], item.code + '.jpg', { type: blob.type || 'image/jpeg' });
    this._files.set(item.img, file);
    return file;
  },

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  async waitFor(fn, ms, step) {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 15000)) {
      const v = fn();
      if (v) return v;
      await this.sleep(step || 150);
    }
    return null;
  },

  // ── Ein Schub: anhängen, prüfen, senden, nachzählen ───────────────────────
  // Gibt {ok:true, n} zurück oder {ok:false, reason, …}. Die Regel aus dem
  // Meta-Debakel gilt hier genauso: bei Teilerfolg NIE nachlegen, sonst hängt
  // dasselbe Foto zweimal im Chat.
  async sendBatch(files) {
    const input = kpLineFileInput();
    if (!input) return { ok: false, reason: 'no_input' };

    const before = kpLineSentMedia();
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    try {
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { return { ok: false, reason: 'attach_failed' }; }

    // LINE antwortet entweder mit dem Bestätigungsdialog oder mit einer
    // Fehlermeldung. Auf beides warten, sonst hängt man 15 s ins Leere.
    const got = await this.waitFor(() => kpLineSendDialog() || kpLineErrorModal(), 20000);
    if (!got) { input.value = ''; return { ok: false, reason: 'no_dialog' }; }

    if (!kpLineSendDialog()) {                       // Fehlermeldung
      const txt = kpLineModalText(got);
      const ok = kpLineDialogButton(got, 'ok');
      if (ok) ok.click();
      input.value = '';
      return { ok: false, reason: 'refused', text: txt };
    }

    const dlg = kpLineSendDialog();
    const n = kpLineDialogCount(dlg);
    // Weniger Bilder als geschickt heißt: LINE hat welche verworfen. Lieber
    // abbrechen und es dem Büro sagen, als eine halbe Auswahl rauszuschicken.
    if (n !== files.length) {
      const cancel = kpLineDialogButton(dlg, 'cancel');
      if (cancel) cancel.click();
      input.value = '';
      return { ok: false, reason: 'count_mismatch', n, want: files.length };
    }

    const send = kpLineDialogButton(dlg, 'ok');
    if (!send) { const c = kpLineDialogButton(dlg, 'cancel'); if (c) c.click(); input.value = ''; return { ok: false, reason: 'no_send_button' }; }
    send.click();

    // Ab hier ist die Nachricht unterwegs. Was jetzt noch schiefgeht, darf NICHT
    // zu einem zweiten Versuch führen.
    await this.waitFor(() => !kpLineSendDialog(), 30000);
    input.value = '';

    // Warten, bis eine NEUE ausgehende Bildnachricht mit der erwarteten Bildzahl
    // im Verlauf steht — das ist der harte Beweis.
    const arrived = await this.waitFor(() => {
      const now = kpLineSentMedia();
      for (const [id, c] of now) if (!before.has(id) && c >= n) return id;
      return null;
    }, 45000, 250);
    if (!arrived) {
      // Der Verlauf hinkt manchmal hinterher oder das Fenster ist weggescrollt.
      // Gesendet wurde trotzdem — also melden, NICHT wiederholen: ein zweiter
      // Anlauf hängt dieselben Fotos ein zweites Mal in den Chat.
      return { ok: true, n, unverified: true };
    }
    return { ok: true, n };
  },

  // Ist die Absage eine Drosselung (abwarten hilft) oder ein Sachfehler
  // (abwarten hilft nicht)? Die einzige bekannte Sachabsage ist das Datei-Limit,
  // und die nennt Dateien — danach wird unterschieden, nicht nach der Sprache.
  throttled(r) {
    if (!r || r.reason !== 'refused') return false;
    return !/file|ไฟล์/i.test(r.text || '');
  },

  // ── Der eigentliche Lauf ──────────────────────────────────────────────────
  async sendAll(opts) {
    const dry = !!(opts && opts.dryRun);
    const say = (opts && opts.onStatus) || function () {};
    if (this.busy) { say('⏳ กำลังส่งอยู่ / läuft schon…'); return { ok: false, reason: 'busy' }; }
    if (!kpLineChatOpen()) { say('⚠ เปิดแชทก่อน / erst einen Chat öffnen'); return { ok: false, reason: 'no_chat' }; }

    let data;
    try { data = await this.catalog(); }
    catch (e) { say('⚠ โหลดรายการสินค้าไม่ได้ / Katalog nicht erreichbar (' + e.message + ')'); return { ok: false, reason: e.message }; }

    const pick = (opts && opts.codes && opts.codes.length) ? new Set(opts.codes) : null;
    const items = pick ? data.items.filter(i => pick.has(i.code)) : data.items;
    if (!items.length) { say('⚠ ยังไม่ได้เลือกสินค้า / nichts ausgewählt'); return { ok: false, reason: 'nothing_selected' }; }

    const batches = Math.ceil(items.length / this.BATCH);
    const who = kpLineChatName() || 'diesen Chat';
    if (!dry && !confirm(
      'ส่งรูปสินค้า ' + items.length + ' รูป ให้ ' + who + ' ไหม?\n'
      + batches + ' ข้อความ (ข้อความละไม่เกิน ' + this.BATCH + ' รูป)\n\n'
      + 'ระหว่างส่ง อย่าเปลี่ยนแชท / während des Versands den Chat nicht wechseln.'))
      return { ok: false, reason: 'cancelled' };

    this.busy = true;
    const missing = [];
    let sent = 0, msgs = 0, unverified = 0;
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
        if (dry) {
          // Probelauf: anhängen, Dialog zählen, wieder abbrechen. Nichts geht raus.
          const input = kpLineFileInput();
          const dt = new DataTransfer(); files.forEach(f => dt.items.add(f));
          input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
          const dlg = await this.waitFor(() => kpLineSendDialog(), 15000);
          const n = kpLineDialogCount(dlg);
          const c = kpLineDialogButton(dlg, 'cancel'); if (c) c.click();
          input.value = '';
          say('🧪 ทดสอบ: ' + n + '/' + files.length + ' รูปเข้าไดอะล็อก — ยกเลิกแล้ว / nichts gesendet');
          return { ok: true, dry: true, attached: n, missing };
        }

        let r = await this.sendBatch(files);

        // LINE drosselt: „You've reached your short-term messaging limit."
        // Bei 50 Kunden am Tag zu je drei Nachrichten trifft das das Büro
        // regelmäßig. Ein Wiederholen ist hier GEFAHRLOS, weil eine Absage
        // heißt, dass der Bestätigungsdialog nie kam — es ging also nichts
        // raus, es kann auch nichts doppelt ankommen. (Nach einem Klick auf
        // Senden wird dagegen NIE wiederholt, siehe sendBatch.)
        for (let a = 1; a <= 2 && !r.ok && this.throttled(r); a++) {
          const wait = a * 20;
          say('⏸ LINE จำกัดการส่งชั่วคราว รอ ' + wait + ' วิ… / LINE bremst, warte ' + wait + ' s');
          await this.sleep(wait * 1000);
          r = await this.sendBatch(files);
        }

        if (!r.ok) {
          const why = r.reason === 'refused' ? r.text
                    : r.reason === 'count_mismatch' ? ('LINE nahm nur ' + r.n + '/' + r.want)
                    : r.reason;
          say('⚠ ชุดที่ ' + (b + 1) + ' ส่งไม่ออก / Schub ' + (b + 1) + ' fehlgeschlagen: ' + why);
          return { ok: false, reason: r.reason, sent, missing };
        }
        if (r.unverified) unverified++;
        sent += r.n; msgs++;
        say('✅ ส่งแล้ว ' + sent + '/' + items.length + ' (' + msgs + ' ข้อความ)');
        if (b < batches - 1) await this.sleep(this.GAP_MS);
      }
    } finally { this.busy = false; }

    say('✅ เสร็จ / fertig: ' + sent + ' รูป · ' + msgs + ' ข้อความ'
      + (unverified ? ' · ⚠ ' + unverified + ' ชุดยังไม่เห็นในแชท / im Verlauf nicht bestätigt' : '')
      + (missing.length ? ' · ⚠ ยังไม่มีรูป / ohne Foto: ' + missing.join(', ') : ''));
    return { ok: true, sent, msgs, missing, unverified };
  }
};

// Base64 → Blob. Der Service Worker schickt die Fotos als data:-URL, weil
// chrome.runtime.sendMessage keine Blobs überträgt.
function kpLineDataUrlToBlob(dataUrl) {
  try {
    const [head, b64] = String(dataUrl).split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  } catch (e) { return null; }
}
