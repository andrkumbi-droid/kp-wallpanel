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
          <button id="kp-collect" class="kp-btn" title="Nur die letzte Antwort dieses Chats als Stil-Beispiel speichern (PII maskiert)"
            data-de="📚 Stil sammeln" data-en="📚 Collect style">📚 Stil sammeln</button>
          <button id="kp-collect-hist" class="kp-btn" title="Ganzen sichtbaren Verlauf dieses Chats lernen — nach oben scrollen lädt mehr (PII maskiert)"
            data-de="🕘 Verlauf lernen" data-en="🕘 Learn history">🕘 Verlauf lernen</button>
          <span id="kp-status" title="🧠 = lernt automatisch aus neuen Antworten"></span>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.root = el;

    el.querySelector('.kp-min').onclick = () => el.classList.toggle('kp-closed');
    el.querySelectorAll('.kp-langs button').forEach(b => b.onclick = () => this.setLang(b.dataset.l));
    el.querySelector('#kp-go').onclick = () => this.suggest();
    el.querySelector('#kp-collect').onclick = () => this.collectStyle();
    el.querySelector('#kp-collect-hist').onclick = () => this.collectHistory();
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

  // Scrape visible in/out pairs of the open conversation as style samples, LABELED
  // with the staff member who wrote them ("Gesendet von X"). PII masked before sending.
  async collectStyle() {
    let bubbles, staff;
    const fixtureRows = kpQueryAll(KPSEL.messageRow, kpQuery(KPSEL.thread) || document);
    if (fixtureRows.length) {
      // offline fixture mode
      bubbles = fixtureRows.map(row => ({ dir: KPSEL.isIncoming(row) ? 'in' : 'out', text: KPSEL.messageText(row) }));
      staff = 'Fixture-Demo';
    } else if (typeof kpLiveTrailingSamples === 'function') {
      // live Business Suite mode — SAFE: only the trailing, correctly-attributed run
      staff = kpLiveStaff();
      if (!staff) { this.status('⚠ Kein Absender erkennbar — Chat übersprungen'); return; }
      const raw = kpLiveTrailingSamples();
      const samples = raw.map(s => ({ in: kpMask(s.in), out: kpMask(s.out) }));
      if (!samples.length) { this.status('keine Paare gefunden'); return; }
      this.status('⏳ speichere ' + samples.length + ' Paare von ' + staff + '…');
      const r = await this.api({ action: 'saveStyleSamples', staff, samples });
      this.status(r.ok ? ('✓ ' + r.saved + ' Beispiele von ' + staff + ' gespeichert') : ('⚠ ' + r.error));
      return;
    } else { this.status('kein Posteingang erkannt'); return; }

    // fixture path: pair each customer message with the staff reply that follows it
    const samples = []; let lastIn = '';
    bubbles.forEach(b => {
      if (!b.text) return;
      if (b.dir === 'in') lastIn = b.text;
      else if (KP_THAI_RE.test(b.text)) { samples.push({ in: kpMask(lastIn), out: kpMask(b.text) }); lastIn = ''; }
    });
    if (!samples.length) { this.status('keine Paare gefunden'); return; }
    this.status('⏳ speichere ' + samples.length + ' Paare von ' + staff + '…');
    const r = await this.api({ action: 'saveStyleSamples', staff, samples });
    this.status(r.ok ? ('✓ ' + r.saved + ' Beispiele von ' + staff + ' gespeichert') : ('⚠ ' + r.error));
  },

  // Learn from the WHOLE visible history of the open conversation (all customer→reply
  // pairs). Staff attribution no longer matters — one aggregate house style — so we
  // collect every pair regardless of who wrote it. Scroll up first to load more history.
  async collectHistory() {
    if (typeof kpLiveBubbles !== 'function') { this.status('kein Posteingang erkannt'); return; }
    const bubbles = kpLiveBubbles();
    const pairs = kpPairConversation(bubbles);
    if (!pairs.length) {
      // Diagnostic: show what the scraper actually saw so we can tune detection.
      const ins = bubbles.filter(x => x.dir === 'in').length;
      const outs = bubbles.filter(x => x.dir === 'out').length;
      const thai = bubbles.filter(x => x.dir === 'out' && KP_THAI_RE.test(x.text)).length;
      this.status(`keine Paare — gesehen: ${bubbles.length} Blasen (${ins} Kunde, ${outs} Antwort, ${thai} Thai-Antwort)`);
      console.log('[KP] kpLiveBubbles:', bubbles);
      return;
    }
    const staff = (typeof kpLiveStaff === 'function' && kpLiveStaff()) || 'team';
    this.status('⏳ lerne ' + pairs.length + ' Paare aus dem Verlauf…');
    const r = await this.api({ action: 'saveStyleSamples', staff, samples: pairs.map(p => ({ in: kpMask(p.in), out: kpMask(p.out) })) });
    this.status(r.ok ? ('🧠 ' + r.saved + ' aus Verlauf gelernt' + (r.rebuilt ? ' · Stil aktualisiert' : '')) : ('⚠ ' + (r.error || '?')));
  },

  // Auto-learn: called by the observer on DOM changes. Saves the newest sent reply as a
  // style sample (once), so every new answer is learned without a click. Deduped by
  // recent reply text so revisiting a chat doesn't re-save the same reply.
  _autoSigs: null,
  autoCollect() {
    if (typeof kpLiveBubbles !== 'function') return;
    const pairs = kpPairConversation(kpLiveBubbles());
    if (!pairs.length) return;
    const latest = pairs[pairs.length - 1];
    const sig = kpMask(latest.out || '');
    if (!sig) return;
    if (!this._autoSigs) this._autoSigs = new Set();
    if (this._autoSigs.has(sig)) return;
    this._autoSigs.add(sig);
    if (this._autoSigs.size > 60) this._autoSigs = new Set([sig]); // bound memory
    const staff = (typeof kpLiveStaff === 'function' && kpLiveStaff()) || 'team';
    this.api({ action: 'saveStyleSamples', staff, samples: [{ in: kpMask(latest.in), out: sig }] })
      .then(r => { if (r && r.ok) this.status('🧠 gelernt' + (r.rebuilt ? ' · Stil aktualisiert' : '')); })
      .catch(() => {});
  }
};

// Client-side PII masking (backend masks again — defense in depth)
function kpMask(t) {
  return String(t || '')
    .replace(/0[\d\s\-]{8,11}/g, '[PHONE]')
    .replace(/https?:\/\/\S+/g, '[URL]');
}

// Pair a conversation's bubbles into {in, out} learning samples: each outgoing run
// (the shop's reply, joined) paired with the preceding customer message. No per-staff
// attribution needed — the backend aggregates everything into one house style.
function kpPairConversation(bubbles) {
  const pairs = [];
  let lastIn = '';
  for (let i = 0; i < bubbles.length; ) {
    const b = bubbles[i];
    if (!b || !b.text) { i++; continue; }
    if (b.dir === 'in') { lastIn = b.text; i++; continue; }
    // outgoing run → join the Thai lines into one reply
    const parts = [];
    while (i < bubbles.length && bubbles[i].dir === 'out') {
      if (KP_THAI_RE.test(bubbles[i].text)) parts.push(bubbles[i].text);
      i++;
    }
    const out = parts.join('\n').trim();
    if (out) { pairs.push({ in: lastIn, out }); lastIn = ''; }
  }
  return pairs;
}
