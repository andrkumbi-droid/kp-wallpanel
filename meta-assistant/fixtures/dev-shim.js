// Dev shim for offline fixture testing WITHOUT installing the extension:
// mocks the chrome.* APIs the content scripts use. If localStorage has a
// backendUrl it calls the real Apps Script backend; otherwise it returns
// canned responses so the whole UI flow works with zero infrastructure.
//
// Configure a real backend from the browser console:
//   localStorage.kpBackendUrl = 'https://script.google.com/macros/s/…/exec'
//   localStorage.kpToken = 'kp-meta-…'

// Canned DE/EN translations for the fixed fixture messages, so the mock shows
// REAL translations (not the Thai echoed back). Unknown lines fall back to a label.
const MOCK_TL = {
  'สวัสดีครับ สนใจแผ่นผนัง WPC ครับ': { de: 'Hallo, ich interessiere mich für WPC-Wandpaneele.', en: 'Hi, I\'m interested in WPC wall panels.' },
  'KP054 มีของไหมครับ แล้วส่งชลบุรีค่าส่งเท่าไหร่ครับ': { de: 'Habt ihr KP054 auf Lager? Und was kostet der Versand nach Chonburi?', en: 'Do you have KP054 in stock? And how much is shipping to Chonburi?' },
  'เอาสีเดิมเหมือนครั้งที่แล้วครับ 10 แผ่น': { de: 'Ich nehme dieselbe Farbe wie letztes Mal, 10 Paneele.', en: 'Same color as last time, 10 panels please.' },
  'มีสีขาวไหมครับ ห้องนอน 3x4 เมตร ใช้กี่แผ่นครับ': { de: 'Habt ihr Weiß? Schlafzimmer 3×4 m — wie viele Paneele brauche ich?', en: 'Do you have white? Bedroom 3×4 m — how many panels do I need?' },
  'ลดได้ไหมครับ สั่ง 50 แผ่น 🙏': { de: 'Geht ein Rabatt? Ich bestelle 50 Paneele 🙏', en: 'Any discount? I\'m ordering 50 panels 🙏' },
  'ของถึงเมื่อไหร่ครับ สั่งไปเมื่อวาน เบอร์ 081-234-5678': { de: 'Wann kommt die Lieferung? Gestern bestellt, Nummer 081-234-5678', en: 'When does the delivery arrive? Ordered yesterday, number 081-234-5678' }
};
function mockTranslate(message, lang) {
  const l = lang === 'en' ? 'en' : 'de';
  return String(message || '').split('\n').map(s => s.trim()).filter(Boolean)
    .map(line => (MOCK_TL[line] && MOCK_TL[line][l]) || ('[MOCK] ' + line))
    .join('\n');
}

window.chrome = {
  storage: {
    sync: {
      get: async () => ({
        backendUrl: localStorage.kpBackendUrl || '',
        token: localStorage.kpToken || '',
        lang: localStorage.kpLang || 'de'
      }),
      set: async v => { if (v.lang) localStorage.kpLang = v.lang; }
    }
  },
  runtime: {
    sendMessage: (msg, cb) => {
      const url = localStorage.kpBackendUrl;
      if (url) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ ...msg.payload, token: localStorage.kpToken || '' })
        }).then(r => r.json()).then(cb).catch(e => cb({ error: String(e) }));
        return;
      }
      // canned mock responses
      const p = msg.payload || {};
      setTimeout(() => {
        if (p.action === 'translate') cb({
          translation: mockTranslate(p.message, p.lang),
          notes: p.lang === 'en' ? 'Customer writes informally but politely (ครับ).' : 'Kunde schreibt informell aber höflich (ครับ).'
        });
        else if (p.action === 'suggest') cb({
          suggestions: [
            { th: 'สวัสดีค่ะ KP054 มีของพร้อมส่งเลยค่ะ 😊 ค่าส่งชลบุรีคิดตามจำนวนแผ่นนะคะ สนใจกี่แผ่นคะ', back: '[MOCK] Hallo! KP054 ist auf Lager und versandbereit 😊 Versand nach Chonburi richtet sich nach der Stückzahl — wie viele Paneele brauchen Sie?' },
            { th: 'มีค่ะ KP054 สีโกลเด้นท์บราว 199 บาท/แผ่นค่ะ ส่งชลบุรีได้ค่ะ รบกวนแจ้งจำนวนแผ่นเพื่อคำนวณค่าส่งนะคะ 🙏', back: '[MOCK] Ja, KP054 (Golden Brown) für 199 ฿/Paneel. Lieferung nach Chonburi möglich — bitte Stückzahl nennen für die Versandkosten 🙏' }
          ],
          customerInfo: p.customerName ? 'CUSTOMER HISTORY for "' + p.customerName + '" (2 orders)' : null
        });
        else cb({ ok: true, saved: (p.samples || []).length });
      }, 500);
    }
  }
};
