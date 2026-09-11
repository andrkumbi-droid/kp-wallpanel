// Panel in der Business Suite — seit 11.09. nur noch EINE Aufgabe: das ganze
// lieferbare Sortiment als Fotos in den offenen Chat schicken.
//
// Übersetzung, Antwortvorschläge und das Stil-Lernen sind draussen (Wunsch des
// Büros). Der Code dafür liegt weiter im Repo (overlay-assistant.js.off,
// inbox-live.js, composer.js, inbox-observer.js) und lässt sich über die
// content_scripts im Manifest wieder einschalten; das Backend läuft unberührt
// weiter. Dadurch braucht dieses Panel auch KEINE Einrichtung mehr: keine
// Backend-Adresse, kein Token — es liest nur die öffentliche Produktliste.

const KPUI = {
  root: null,

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
          <button id="kp-sendall" class="kp-btn kp-primary"
            title="ส่งรูปสินค้าที่มีของทั้งหมด ครั้งละ 10 รูป / alle verfügbaren Produktfotos in 10er-Schüben"
            >📦 ส่งรูปสินค้าทั้งหมด / Alle senden</button>
          <label class="kp-dry"><input type="checkbox" id="kp-dry">
            <span>ทดสอบ: ใส่รูปแต่ยังไม่ส่ง / nur einfügen</span></label>
          <div class="kp-hint" id="kp-cat-count"></div>
          <div class="kp-hint" id="kp-cat-info"></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.root = el;

    el.querySelector('.kp-min').onclick = () => el.classList.toggle('kp-closed');
    el.querySelector('#kp-sendall').onclick = () => this.sendAllPhotos();

    // Der Haken merkt sich seinen Stand. Voreinstellung: AUS — im Alltag drückt
    // das Büro nur den Knopf. Zum Einrichten eines neuen Rechners setzt man ihn
    // einmal, sieht dass die zehn Bilder im Feld landen, und nimmt ihn wieder raus.
    const dry = el.querySelector('#kp-dry');
    try {
      chrome.storage?.local?.get(['dryRun'], v => { dry.checked = !!(v && v.dryRun); });
      dry.onchange = () => { try { chrome.storage?.local?.set({ dryRun: dry.checked }); } catch (e) { /* egal */ } };
    } catch (e) { /* ohne Speicher bleibt der Haken einfach aus */ }

    this.catalogInfo();
  },

  // Bestand anzeigen: wie viele Produkte gerade lieferbar sind und wie viele
  // Nachrichten das gibt. Eigene Zeile, damit Statusmeldungen sie nicht überschreiben.
  async catalogInfo() {
    const el = this.root && this.root.querySelector('#kp-cat-count');
    if (!el) return;
    try {
      const d = await KPCAT.catalog();
      const when = d.updatedAt ? new Date(d.updatedAt).toLocaleString() : '';
      el.textContent = 'มีของ ' + d.items.length + ' รายการ · '
        + Math.ceil(d.items.length / KPCAT.BATCH) + ' ข้อความ' + (when ? ' · อัปเดต ' + when : '');
    } catch (e) {
      el.textContent = '⚠ โหลดรายการสินค้าไม่ได้ / Katalog nicht erreichbar (' + e.message + ')';
    }
  },

  async sendAllPhotos() {
    const btn = this.root.querySelector('#kp-sendall');
    const info = this.root.querySelector('#kp-cat-info');
    const dry = this.root.querySelector('#kp-dry').checked;
    btn.disabled = true;
    try {
      await KPCAT.sendAll({ dryRun: dry, onStatus: t => { info.textContent = t; } });
      this.catalogInfo();   // der Bestand kann sich inzwischen geändert haben
    } finally { btn.disabled = false; }
  }
};

// Die Business Suite ist eine Ein-Seiten-Anwendung: einmal aufbauen reicht, das
// Panel bleibt beim Wechsel zwischen Chats stehen.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => KPUI.init());
} else {
  KPUI.init();
}
