// Panel in der Business Suite — seit 11.09. nur noch EINE Aufgabe: lieferbare
// Produkte als Fotos in den offenen Chat schicken.
//
// Angezeigt wird, WAS rausgeht: jedes Produkt als Bildchen zum Ab- und Anwählen.
// Voreinstellung ist alles; fragt ein Kunde nur nach hellen Hölzern, tickt das
// Büro die anderen aus und schickt drei statt neunundzwanzig.
//
// Übersetzung, Antwortvorschläge und Stil-Lernen sind draussen (Wunsch des
// Büros). Der Code liegt weiter im Repo (overlay-assistant.js.off & Co.) und
// lässt sich über die content_scripts im Manifest wieder einschalten.

const KPUI = {
  root: null,
  items: [],
  sel: null,     // Set der angetickten Codes

  init() {
    if (this.root || !document.body) return;
    const el = document.createElement('div');
    el.id = 'kp-assist';
    el.innerHTML = `
      <div class="kp-head">
        <b>KP Sortiment</b>
        <button class="kp-min" title="minimieren">–</button>
      </div>
      <div class="kp-body">
        <div class="kp-sec kp-cat">
          <button id="kp-sendall" class="kp-btn kp-primary">📦 ส่งรูปสินค้า / senden</button>
          <div class="kp-pickbar">
            <button id="kp-all" class="kp-link">ทั้งหมด / alle</button>
            <button id="kp-none" class="kp-link">ไม่เลือก / keine</button>
            <span id="kp-cat-count"></span>
          </div>
          <div class="kp-grid" id="kp-grid"></div>
          <div class="kp-hint" id="kp-cat-info"></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.root = el;

    el.querySelector('.kp-min').onclick = () => el.classList.toggle('kp-closed');
    el.querySelector('#kp-sendall').onclick = () => this.sendAllPhotos();
    el.querySelector('#kp-all').onclick = () => this.setAll(true);
    el.querySelector('#kp-none').onclick = () => this.setAll(false);

    this.load();
  },

  async load() {
    const info = this.root.querySelector('#kp-cat-info');
    let d;
    try { d = await KPCAT.catalog(); }
    catch (e) { info.textContent = '⚠ โหลดรายการสินค้าไม่ได้ / Katalog nicht erreichbar (' + e.message + ')'; return; }
    this.items = d.items;
    this.sel = new Set(this.items.map(i => i.code));
    this.renderGrid();
    this.renderCount();
    this.loadThumbs();
  },

  renderGrid() {
    const grid = this.root.querySelector('#kp-grid');
    grid.innerHTML = this.items.map(i => {
      const code = i.code.replace(/[^A-Za-z0-9_.\-]/g, '');
      return '<button type="button" class="kp-tile on" data-code="' + code + '" title="' + code + '">'
        + '<span class="kp-thumb" id="kp-th-' + code + '"></span>'
        + '<span class="kp-code">' + code + '</span>'
        + '<span class="kp-tick">✓</span>'
        + '</button>';
    }).join('');
    grid.querySelectorAll('.kp-tile').forEach(t => {
      t.onclick = () => {
        const c = t.dataset.code;
        if (this.sel.has(c)) { this.sel.delete(c); t.classList.remove('on'); }
        else { this.sel.add(c); t.classList.add('on'); }
        this.renderCount();
      };
    });
  },

  // Die Bildchen kommen über den Service Worker (CSP: ein direktes <img> auf
  // github.io wäre auf facebook.com heikel) und als blob:-Adresse derselben
  // Herkunft. Es sind dieselben Dateien, die auch gesendet werden — der Cache
  // von KPCAT trägt also doppelt.
  async loadThumbs() {
    for (const it of this.items) {
      const box = this.root.querySelector('#kp-th-' + it.code.replace(/[^A-Za-z0-9_.\-]/g, ''));
      if (!box) continue;
      const f = await KPCAT.photo(it);
      if (!f) { box.textContent = '—'; continue; }
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      img.alt = it.code;
      box.appendChild(img);
    }
  },

  setAll(on) {
    this.sel = new Set(on ? this.items.map(i => i.code) : []);
    this.root.querySelectorAll('.kp-tile').forEach(t => t.classList.toggle('on', on));
    this.renderCount();
  },

  renderCount() {
    const n = this.sel ? this.sel.size : 0;
    const total = this.items.length;
    this.root.querySelector('#kp-cat-count').textContent = n + '/' + total + ' · ' + Math.ceil(n / KPCAT.BATCH) + ' ข้อความ';
    const btn = this.root.querySelector('#kp-sendall');
    btn.textContent = '📦 ส่งรูปสินค้า ' + n + ' รูป / senden';
    btn.disabled = !n;
  },

  async sendAllPhotos() {
    const btn = this.root.querySelector('#kp-sendall');
    const info = this.root.querySelector('#kp-cat-info');
    btn.disabled = true;
    try {
      const r = await KPCAT.sendAll({
        codes: Array.from(this.sel),
        onStatus: t => { info.textContent = t; }
      });
      // Nach einem gelaufenen Versand wieder alles anticken: der nächste Kunde
      // soll nicht aus Versehen die Auswahl des vorigen bekommen.
      if (r && r.ok) await this.load();
    } finally { btn.disabled = false; this.renderCount(); }
  }
};

// Die Business Suite ist eine Ein-Seiten-Anwendung: einmal aufbauen reicht, das
// Panel bleibt beim Wechsel zwischen Chats stehen.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => KPUI.init());
} else {
  KPUI.init();
}
