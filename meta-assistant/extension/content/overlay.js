// Assistant side panel: translation of the latest customer message,
// intent box (DE/EN), 2–3 Thai suggestions with back-translation,
// insert-into-composer, correction logging, style-collect mode.
// Talks to the backend ONLY via chrome.runtime.sendMessage → background/sw.js
// (fixture mode: dev-shim.js provides a chrome mock).

const KPUI = {
  root: null, lang: 'de',
  lastMessage: '', lastSuggestion: '', conversation: [],

  init() {
    if (this.root) return;
    (chrome.storage?.sync?.get(['lang']) || Promise.resolve({})).then?.(v => { if (v && v.lang) this.setLang(v.lang); });
    const el = document.createElement('div');
    el.id = 'kp-assist';
    el.innerHTML = `
      <div class="kp-head">
        <b>KP Assistant</b>
        <span class="kp-langs"><button data-l="de" class="on">DE</button><button data-l="en">EN</button></span>
        <button class="kp-min" title="minimieren">–</button>
      </div>
      <div class="kp-body">
        <div class="kp-sec">
          <div class="kp-cap" data-de="Kundennachricht" data-en="Customer message">Kundennachricht</div>
          <div class="kp-multi" id="kp-multi"></div>
          <div class="kp-orig" id="kp-orig">—</div>
          <div class="kp-trans" id="kp-trans"></div>
          <div class="kp-notes" id="kp-notes"></div>
        </div>
        <div class="kp-sec">
          <div class="kp-cap" data-de="Was willst du sagen? (DE/EN, optional)" data-en="What do you want to say? (optional)">Was willst du sagen? (DE/EN, optional)</div>
          <textarea id="kp-intent" rows="2" placeholder="z.B.: KP054 ist ausverkauft, biete KP055 an, Lieferung Do."></textarea>
          <div class="kp-hint" data-de="Leer lassen = Antwort automatisch vorschlagen" data-en="Leave empty = auto-suggest a reply">Leer lassen = Antwort automatisch vorschlagen</div>
          <button id="kp-go" class="kp-btn kp-primary" data-de="Übersetzen & vorschlagen" data-en="Translate & suggest">Übersetzen & vorschlagen</button>
        </div>
        <div class="kp-sec" id="kp-sugs"></div>
        <div class="kp-foot">
          <button id="kp-collect" class="kp-btn" title="Sichtbare Chat-Paare als Stil-Beispiele speichern (PII maskiert)"
            data-de="📚 Stil sammeln" data-en="📚 Collect style">📚 Stil sammeln</button>
          <span id="kp-status"></span>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.root = el;

    el.querySelector('.kp-min').onclick = () => el.classList.toggle('kp-closed');
    el.querySelectorAll('.kp-langs button').forEach(b => b.onclick = () => this.setLang(b.dataset.l));
    el.querySelector('#kp-go').onclick = () => this.suggest();
    el.querySelector('#kp-collect').onclick = () => this.collectStyle();
  },

  setLang(l) {
    this.lang = l;
    chrome.storage?.sync?.set?.({ lang: l });
    this.root.querySelectorAll('.kp-langs button').forEach(b => b.classList.toggle('on', b.dataset.l === l));
    this.root.querySelectorAll('[data-de]').forEach(n => {
      const t = n.dataset[l]; if (!t) return;
      if (n.tagName === 'TEXTAREA') n.placeholder = t; else n.textContent = t;
    });
    this.renderMultiBadge();
    if (this.lastMessage) this.translateCurrent();
  },

  // Badge when several unanswered customer messages are being handled together
  renderMultiBadge() {
    const n = this.msgCount || 1;
    const el = this.root.querySelector('#kp-multi');
    el.textContent = n > 1
      ? (this.lang === 'de' ? `⚠ ${n} unbeantwortete Nachrichten — zusammen übersetzt` : `⚠ ${n} unanswered messages — translated together`)
      : '';
  },

  api(payload) {
    return new Promise(resolve =>
      chrome.runtime.sendMessage({ type: 'api', payload }, resp => resolve(resp || { error: 'no_response' })));
  },
  status(t) { this.root.querySelector('#kp-status').textContent = t || ''; },

  // Called by inbox-observer with the trailing run of unanswered customer
  // messages (burst). text = all of them joined; burst = the array.
  async onIncoming(text, conversation, burst) {
    this.init();
    this.lastMessage = text;
    this.conversation = conversation || [];
    this.msgCount = (burst && burst.length) || 1;
    this.renderMultiBadge();
    this.root.querySelector('#kp-orig').textContent = text;
    await this.translateCurrent();
  },

  // (Re)translate the currently shown message — also used when the language toggles
  async translateCurrent() {
    if (!this.lastMessage) return;
    this.root.querySelector('#kp-trans').textContent = '…';
    this.root.querySelector('#kp-notes').textContent = '';
    const r = await this.api({ action: 'translate', message: this.lastMessage, lang: this.lang, context: this.conversation });
    this.root.querySelector('#kp-trans').textContent = r.translation || ('⚠ ' + (r.error || '?'));
    this.root.querySelector('#kp-notes').textContent = r.notes || '';
  },

  async suggest() {
    this.init();
    const box = this.root.querySelector('#kp-sugs');
    box.innerHTML = '<div class="kp-cap">⏳ …</div>';
    const r = await this.api({
      action: 'suggest', message: this.lastMessage,
      intent: this.root.querySelector('#kp-intent').value.trim() || undefined,
      lang: this.lang, context: this.conversation,
      customerName: (kpQuery(KPSEL.customerName) || {}).innerText || ''
    });
    if (!r.suggestions) { box.innerHTML = '<div class="kp-err">⚠ ' + (r.error || 'keine Antwort') + '</div>'; return; }
    box.innerHTML = (r.customerInfo ? '<div class="kp-cust">👤 ' + r.customerInfo.split('\n')[0] + '</div>' : '');
    r.suggestions.forEach(s => {
      const d = document.createElement('div');
      d.className = 'kp-sug';
      d.innerHTML = '<div class="kp-th"></div><div class="kp-back"></div><button class="kp-btn kp-primary">↩ Einfügen</button>';
      d.querySelector('.kp-th').textContent = s.th;
      d.querySelector('.kp-back').textContent = s.back;
      d.querySelector('button').onclick = async () => {
        this.lastSuggestion = s.th;
        const res = await kpInsertReply(s.th);
        this.status(res.ok ? '✓ eingefügt — prüfen & selbst senden' : (res.hint || '⚠ ' + res.reason));
        if (res.ok) this.watchCorrection(s.th);
      };
      box.appendChild(d);
    });
  },

  // If the user edits the inserted text before sending, log suggested→edited (learning happens later, review-gated)
  watchCorrection(suggested) {
    const box = kpFindComposer();
    if (!box) return;
    const check = () => {
      const now = (box.innerText || '').trim();
      if (now && now !== suggested.trim()) {
        this.api({ action: 'logCorrection', suggested, edited: now, msgContext: this.lastMessage });
      }
      box.removeEventListener('blur', check);
    };
    box.addEventListener('blur', check);
  },

  // Scrape visible in/out pairs of the open conversation as style samples (PII masked before sending)
  async collectStyle() {
    const rows = kpQueryAll(KPSEL.messageRow, kpQuery(KPSEL.thread) || document);
    const samples = []; let lastIn = '';
    rows.forEach(row => {
      const text = KPSEL.messageText(row);
      if (!text) return;
      if (KPSEL.isIncoming(row)) lastIn = text;
      else if (KP_THAI_RE.test(text)) { samples.push({ in: kpMask(lastIn), out: kpMask(text) }); lastIn = ''; }
    });
    if (!samples.length) { this.status('keine Paare gefunden'); return; }
    this.status('⏳ speichere ' + samples.length + ' Paare…');
    const r = await this.api({ action: 'saveStyleSamples', samples });
    this.status(r.ok ? ('✓ ' + r.saved + ' Stil-Beispiele gespeichert') : ('⚠ ' + r.error));
  }
};

// Client-side PII masking (backend masks again — defense in depth)
function kpMask(t) {
  return String(t || '')
    .replace(/0[\d\s\-]{8,11}/g, '[PHONE]')
    .replace(/https?:\/\/\S+/g, '[URL]');
}
