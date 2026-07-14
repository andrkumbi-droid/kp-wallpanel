/**
 * KP Wallpanel — Meta Business Suite Assistant (Apps Script Web App)
 * Backend for the MV3 Chrome extension in meta-assistant/extension:
 *   · translate incoming Thai messages (DE/EN + cultural notes)
 *   · generate 2–3 natural Thai reply suggestions, grounded in live app
 *     data (catalog/stock/customer history) + company style profile
 *   · collect style samples + corrections (review-gated learning)
 * Sibling of line-bot.gs — same patterns (fbGet, token-gated doPost, Claude),
 * but OWN deployment and OWN Anthropic key.
 * Deploy: New deployment → Web app → Execute as Me → Anyone. Paste the
 * /exec URL + SHARED_TOKEN into the extension options page.
 */

// ── CONFIG ─────────────────────────────────────────────────
var ANTHROPIC_API_KEY = '';        // NEW key just for this assistant (not the line-bot key)
var OPENAI_API_KEY    = '';        // optional alternative provider
var PROVIDER = 'claude';           // 'claude' | 'openai' — see PROVIDERS below
var MODELS = { claude: 'claude-sonnet-5', openai: 'gpt-4o' };
var FIREBASE_URL = 'https://kp-wallpanel-default-rtdb.asia-southeast1.firebasedatabase.app';
var FIREBASE_SECRET = '';
var SHARED_TOKEN = 'kp-meta-CHANGE-ME';   // extension must send this in every request
var TZ = 'Asia/Bangkok';

// ── Web app entry ──────────────────────────────────────────
function doGet(){ return ContentService.createTextOutput('KP Meta Assistant OK'); }
function doPost(e){
  var out;
  try{
    var b = JSON.parse(e.postData.contents);
    if(!b || b.token !== SHARED_TOKEN)          out = {error:'unauthorized'};
    else if(b.action==='translate')             out = actTranslate(b);
    else if(b.action==='suggest')               out = actSuggest(b);
    else if(b.action==='saveStyleSamples')      out = actSaveSamples(b);
    else if(b.action==='buildStyleDraft')       out = actBuildStyleDraft(b);
    else if(b.action==='buildHouseStyle')       out = actBuildHouseStyle();
    else if(b.action==='logCorrection')         out = actLogCorrection(b);
    else if(b.action==='listStaff')             out = actListStaff();
    else if(b.action==='health')                out = {ok:true, provider:PROVIDER, model:MODELS[PROVIDER]};
    else                                        out = {error:'unknown_action'};
  }catch(err){ out = {error:String(err)}; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ── Provider abstraction (swap via PROVIDER) ───────────────
var PROVIDERS = {
  claude: function(system, user, maxTokens){
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      headers:{ 'x-api-key':ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
      payload: JSON.stringify({ model:MODELS.claude, max_tokens:maxTokens, system:system,
        messages:[{role:'user', content:user}] })
    });
    var j = JSON.parse(res.getContentText());
    if(j.error) throw new Error('claude: ' + (j.error.message || JSON.stringify(j.error)));
    // Join ALL text blocks (model may emit thinking blocks before the text).
    return (j.content||[]).map(function(c){ return (c&&c.text)||''; }).join('');
  },
  openai: function(system, user, maxTokens){
    var res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      headers:{ 'Authorization':'Bearer ' + OPENAI_API_KEY },
      payload: JSON.stringify({ model:MODELS.openai, max_tokens:maxTokens,
        messages:[{role:'system',content:system},{role:'user',content:user}] })
    });
    var j = JSON.parse(res.getContentText());
    if(j.error) throw new Error('openai: ' + j.error.message);
    return (j.choices && j.choices[0] && j.choices[0].message.content) || '';
  }
};
function llm(system, user, maxTokens){ return PROVIDERS[PROVIDER](system, user, maxTokens || 1200); }
// Extract the first JSON object from an LLM answer.
function llmJson(system, user, maxTokens){
  var t = llm(system, user, maxTokens);
  var m = t.match(/\{[\s\S]*\}/); if(!m) throw new Error('no_json_in_answer');
  return JSON.parse(m[0]);
}

// ── Firebase REST helpers ──────────────────────────────────
function _fbUrl(path){ return FIREBASE_URL + '/' + path + '.json' + (FIREBASE_SECRET ? ('?auth='+FIREBASE_SECRET) : ''); }
function fbGet(path){ try{ return JSON.parse(UrlFetchApp.fetch(_fbUrl(path),{muteHttpExceptions:true}).getContentText()||'null'); }catch(e){ return null; } }
function fbSet(path, obj){ UrlFetchApp.fetch(_fbUrl(path), {method:'put', contentType:'application/json', muteHttpExceptions:true, payload:JSON.stringify(obj)}); }
function fbPush(path, obj){ UrlFetchApp.fetch(_fbUrl(path), {method:'post', contentType:'application/json', muteHttpExceptions:true, payload:JSON.stringify(obj)}); }
function asArr(v){ return v ? (Array.isArray(v) ? v.filter(Boolean) : Object.keys(v).map(function(k){return v[k];})) : []; }

// ── Context builders (grounding) ───────────────────────────
// Catalog mirror written by the app (assistant/productCatalog, see qtRebuildProducts in index.html).
function ctxCatalog(){
  var cat = fbGet('assistant/productCatalog');
  var items = asArr(cat && cat.items).filter(function(p){ return p.code && (+p.price > 0); });
  if(!items.length) return 'PRODUCT CATALOG: (not synced yet — open the app once)';
  return 'PRODUCT CATALOG (code | thai name | ฿/pc | width cm | material):\n' +
    items.map(function(p){ return p.code+' | '+(p.name||'')+' | '+p.price+' | '+(p.w||'-')+' | '+(p.mat||''); }).join('\n');
}
function ctxStock(){
  var st = asArr(fbGet('stockItems'));
  if(!st.length) return '';
  return 'LIVE STOCK (code: pcs — 0 means SOLD OUT, do not promise it):\n' +
    st.map(function(s){ return s.code+': '+(parseInt(s.qty)||0); }).join(', ');
}
function ctxKnowledge(){
  var k = fbGet('assistant/knowledgeStatic');
  if(!k) return '';
  return 'COMPANY FACTS (warranty, shipping, FAQ):\n' + Object.keys(k).map(function(key){ return '- '+key+': '+k[key]; }).join('\n');
}
// Normalize a "Gesendet von X" display name into a safe Firebase key.
// Firebase keys may not contain . $ # [ ] / — and we want stable per-staff buckets.
function staffKey(name){
  return String(name||'').trim().toLowerCase()
    .replace(/[.$#\[\]\/]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-') || 'unknown';
}
// Nickname → Facebook display name (as it appears in "Gesendet von X"). Lets you say
// "schreib wie Bobby" while data is keyed by the real FB name. Extend as staff change.
var STAFF_ALIASES = {
  'pim':   'Pimlada Rattana',
  'bobby': 'วุฒิศักดิ์ ปราบวงษา',
  'lanoy': 'Lanoy Add'
};
// Resolve a nickname OR an FB display name to the storage key.
function resolveStaffKey(nameOrNick){
  var raw = String(nameOrNick||'').trim();
  return staffKey(STAFF_ALIASES[raw.toLowerCase()] || raw);
}
// House style (aggregate) — fallback when no specific staff persona is requested.
function ctxStyle(){
  var s = fbGet('assistant/styleProfile/current');
  if(!s) return 'STYLE: polite Thai retail customer service, particle ' + '"ค่ะ"' + ', address customers as คุณ, light emoji use.';
  return 'COMPANY STYLE PROFILE (imitate the style, never copy sentences verbatim):\n' + JSON.stringify(s);
}
// Per-staff style: imitate ONE staff member's voice (b.staff = their display name).
// Falls back to house style if that staff has no profile yet.
function ctxStyleFor(name){
  if(!name) return ctxStyle();
  var s = fbGet('assistant/styleProfiles/' + resolveStaffKey(name) + '/current');
  if(!s) return ctxStyle();
  return 'STAFF STYLE PROFILE — write exactly like "'+name+'" writes (imitate their voice, never copy sentences verbatim):\n' + JSON.stringify(s);
}
// Fuzzy match Meta profile name → app orders (customerMeta is phone-keyed, so we go via orders).
function ctxCustomer(name){
  if(!name) return '';
  var n = String(name).toLowerCase().replace(/\s+/g,'');
  var hits = asArr(fbGet('orders')).filter(function(o){
    var c = String(o.customer||'').toLowerCase().replace(/\s+/g,'');
    return c && n && (c.indexOf(n)>=0 || n.indexOf(c)>=0);
  });
  if(!hits.length) return '';
  hits.sort(function(a,b){ return String(b.date||'').localeCompare(String(a.date||'')); });
  return 'CUSTOMER HISTORY for "'+name+'" ('+hits.length+' orders, newest first):\n' +
    hits.slice(0,3).map(function(o){ return '- '+(o.date||'?')+': '+(o.panels||'?')+' — '+(o.total||'?')+' ฿'; }).join('\n');
}
function ctxConversation(ctx){
  if(!ctx || !ctx.length) return '';
  return 'CONVERSATION SO FAR (oldest first):\n' +
    ctx.slice(-12).map(function(m){ return (m.dir==='in'?'CUSTOMER':'US')+': '+m.text; }).join('\n');
}

// Shared Thai-specifics block for system prompts.
var TH_RULES = 'Thai specifics: sound like an experienced Thai shop admin, NOT like machine translation. ' +
  'Use the polite particle from the style profile consistently. Address the customer as คุณ (or ช่าง/พี่ if the style profile says so). ' +
  'Natural register for Facebook page chat: friendly, brief, helpful; numbers in Arabic digits; prices in ฿.';

// ── Actions ────────────────────────────────────────────────
// {action:'translate', message, lang:'de'|'en', context?} → {translation, notes}
function actTranslate(b){
  var L = b.lang==='en' ? 'English' : 'German';
  return llmJson(
    'You translate Thai Facebook customer messages for a wall-panel shop (WPC/PVC panels) into natural '+L+'. ' +
    'Return ONLY JSON {"translation":"","notes":""}. translation = natural '+L+', keep product codes as-is. ' +
    'notes = ONE short '+L+' sentence about slang/politeness/culture ONLY if needed to understand tone, else "".',
    (b.context && b.context.length ? ctxConversation(b.context)+'\n\n' : '') + 'MESSAGE:\n' + String(b.message||''), 600);
}

// {action:'suggest', message, intent?, lang, context?, customerName?} → {suggestions:[{th,back}], customerInfo}
function actSuggest(b){
  var L = b.lang==='en' ? 'English' : 'German';
  var cust = ctxCustomer(b.customerName);
  var blocks = [ctxCatalog(), ctxStock(), ctxKnowledge(), cust, ctxConversation(b.context)].filter(Boolean).join('\n\n');
  // One aggregate company voice — no per-staff separation (ctxStyle, not ctxStyleFor).
  var sys = 'You are the Thai customer-service voice of KP Wallpanel (WPC/PVC wall panels, Thailand, Facebook page chat). ' +
    ctxStyle() + '\n' + TH_RULES + '\n' +
    'Ground every factual claim (price, stock, width, shipping) ONLY in the DATA block; if the data does not answer it, say you will check (politely) instead of inventing. ' +
    'Keep every reply SHORT, warm and polite — answer ONLY what the customer asked, nothing more. No filler, no long text for a short question, no unsolicited upsell or extra explanation. Aim for 1-2 short sentences (a one-line answer is ideal for a one-line question). ' +
    'Return ONLY JSON {"suggestions":[{"th":"","back":""}]} with 2-3 alternative replies. th = the Thai reply ready to send. back = faithful '+L+' back-translation so a non-Thai-speaker can verify before sending. The alternatives should differ in wording/phrasing, NOT in length — all stay short.';
  var user = 'DATA:\n' + blocks + '\n\nCUSTOMER MESSAGE:\n' + String(b.message||'') +
    (b.intent ? ('\n\nWHAT I WANT TO SAY (in '+L+', express this naturally in Thai, not literally):\n' + b.intent) : '');
  var out = llmJson(sys, user, 600);
  out.customerInfo = cust || null;
  return out;
}

// {action:'saveStyleSamples', staff, samples:[{in,out}]} — pairs scraped by the extension,
// labeled with the staff member who wrote the outgoing replies ("Gesendet von X").
// Stored per staff so each person's voice can be learned separately. PII masked (client + here).
function actSaveSamples(b){
  var k = staffKey(b.staff);
  var samples = (b.samples||[]).filter(function(s){ return s && s.out; }).slice(0,200);
  samples.forEach(function(s){ fbPush('assistant/styleSamples/'+k, { in:maskPII(s.in||''), out:maskPII(s.out||''), ts:Date.now() }); });
  // remember the human-readable display name for this key
  fbSet('assistant/staff/'+k, { name:String(b.staff||''), lastCollectedAt:Date.now() });
  return {ok:true, staff:k, saved:samples.length};
}

// {action:'logCorrection', staff?, suggested, edited, msgContext?} — collected per staff; review-gated learning.
function actLogCorrection(b){
  var k = staffKey(b.staff);
  fbPush('assistant/corrections/'+k, { suggested:String(b.suggested||''), edited:String(b.edited||''),
    msgContext:maskPII(String(b.msgContext||'').slice(0,300)), ts:Date.now() });
  return {ok:true};
}

// {action:'buildStyleDraft', staff?} — analyze one staff's samples+corrections (or ALL staff if omitted)
// → assistant/styleProfiles/<key>/drafts/<ts>. Review in Firebase, then promoteStyleDraft(key).
function actBuildStyleDraft(b){
  var only = b && b.staff ? resolveStaffKey(b.staff) : null;
  var allSamples = fbGet('assistant/styleSamples') || {};
  var keys = only ? [only] : Object.keys(allSamples);
  if(!keys.length) return {error:'no_samples'};
  var results = [];
  keys.forEach(function(k){
    var samples = asArr(allSamples[k]).slice(-120);
    var corr = asArr(fbGet('assistant/corrections/'+k)).slice(-40);
    if(!samples.length && !corr.length) return;
    var name = (fbGet('assistant/staff/'+k)||{}).name || k;
    var draft = llmJson(
      'You analyze how ONE Thai wall-panel shop staff member ("'+name+'") writes to customers on Facebook. ANALYZE their personal style, do not copy sentences. ' +
      'Return ONLY JSON: {"particle":"ค่ะ|ครับ","address":"","greetings":[],"closings":[],"emojiUsage":"","commonPhrases":[],"discountStyle":"","refusalStyle":"","alternativesStyle":"","tone":"","notes":""}. ' +
      'Fields describe THIS person\'s patterns (short English descriptions + a few Thai examples). Corrections (suggested→edited) reveal their preferences — weigh strongly.',
      'STAFF REPLIES (in = customer, out = "'+name+'"):\n' + JSON.stringify(samples) +
      (corr.length ? ('\n\nCORRECTIONS (suggested → edited):\n' + JSON.stringify(corr)) : ''), 1500);
    var ts = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');
    draft.staffName = name; draft.builtAt = Date.now(); draft.sampleCount = samples.length; draft.correctionCount = corr.length;
    fbSet('assistant/styleProfiles/'+k+'/drafts/'+ts, draft);
    results.push({staff:k, name:name, draftKey:ts, sampleCount:samples.length});
  });
  return {ok:true, built:results};
}

// {action:'buildHouseStyle'} — pool the last ~100 replies across the WHOLE team
// (no per-staff separation) and distil ONE short, consistent company voice, written
// straight to assistant/styleProfile/current (the profile every suggestion uses).
function actBuildHouseStyle(){
  var allSamples = fbGet('assistant/styleSamples') || {};
  var pooled = [];
  Object.keys(allSamples).forEach(function(k){ pooled = pooled.concat(asArr(allSamples[k])); });
  if(!pooled.length) return {error:'no_samples'};
  pooled.sort(function(a,b){ return (a.ts||0)-(b.ts||0); });
  var recent = pooled.slice(-100);   // the last ~100 messages, all staff combined
  var allCorr = fbGet('assistant/corrections') || {};
  var corrAll = [];
  Object.keys(allCorr).forEach(function(k){ corrAll = corrAll.concat(asArr(allCorr[k])); });
  corrAll.sort(function(a,b){ return (a.ts||0)-(b.ts||0); });
  var profile = llmJson(
    'You analyze how a Thai wall-panel shop answers customers on Facebook across the WHOLE team (no per-person separation). Distil ONE consistent company voice from how questions were actually answered. ' +
    'Return ONLY JSON: {"particle":"ค่ะ|ครับ","address":"","greetings":[],"closings":[],"emojiUsage":"","commonPhrases":[],"discountStyle":"","refusalStyle":"","tone":"","notes":""}. ' +
    'Emphasise SHORT, warm, to-the-point replies that answer only what was asked — no long text for short questions. Corrections (suggested → edited) reveal preferences — weigh strongly.',
    'TEAM REPLIES (in = customer, out = staff), last ~100:\n' + JSON.stringify(recent) +
    (corrAll.length ? ('\n\nCORRECTIONS (suggested → edited):\n' + JSON.stringify(corrAll.slice(-40))) : ''), 1200);
  profile.builtAt = Date.now(); profile.sampleCount = recent.length;
  fbSet('assistant/styleProfile/current', profile);   // aggregate = auto-live (no per-staff review needed)
  return {ok:true, sampleCount:recent.length};
}
// {action:'listStaff'} → the discovered staff + how many samples each has (for the extension's persona picker).
function actListStaff(){
  var samples = fbGet('assistant/styleSamples') || {};
  var meta = fbGet('assistant/staff') || {};
  return { staff: Object.keys(samples).map(function(k){
    return { key:k, name:(meta[k]||{}).name||k, samples:asArr(samples[k]).length,
             hasProfile: !!fbGet('assistant/styleProfiles/'+k+'/current') };
  }) };
}

// ── PII masking (defense in depth; extension masks too) ────
function maskPII(t){
  return String(t||'')
    .replace(/0[\d\s\-]{8,11}/g, '[PHONE]')                 // Thai phone numbers
    .replace(/https?:\/\/\S+/g, '[URL]');
}

// ── One-time setup helpers (run from the Apps Script editor) ─
// Seed a generic-polite starting profile until real samples are collected (Phase 3).
function seedStyleProfile(){
  fbSet('assistant/styleProfile/current', {
    particle:'ค่ะ',                       // TODO confirm: ค่ะ (female admin persona) vs ครับ
    address:'คุณ + name; ช่าง for installers',
    greetings:['สวัสดีค่ะ'], closings:['ขอบคุณค่ะ 🙏'],
    emojiUsage:'sparing — 🙏 😊 and product-related only',
    commonPhrases:[], discountStyle:'', refusalStyle:'apologize + offer alternative',
    alternativesStyle:'suggest similar color/profile from catalog when out of stock',
    version:1, seededAt:Date.now(), note:'generic seed — replace via buildStyleDraft after collecting samples'
  });
}
// Seed the PRELIMINARY per-staff profiles from the 10.07 live inbox read
// (see meta-assistant/docs/STYLE-PROFILES-PRELIMINARY.md). Starting points only —
// refine via buildStyleDraft once real samples are collected. Pim omitted on purpose
// (no reliable free-text observed yet). Run once from the editor after deploy.
function seedPreliminaryStaffProfiles(){
  fbSet('assistant/styleProfiles/' + staffKey('Lanoy Add') + '/current', {
    staffName:'Lanoy Add', nickname:'Lanoy', particle:'ครับ',
    tone:'consultative, honest — will advise against unsuitable uses instead of overselling',
    form:'answers split into several short lines; names concrete use-cases',
    emojiUsage:'sparing',
    examples:['ภายนอก 100% ยังไม่มีนะครับ','สินค้าที่ร้าน จะแนะนำในส่วนที่เป็น ฝาโรงรถ / ผนัง ที่อยู่ได้ชายคา','แต่ถ้าเอาไปทำรั้ว กันกำแพงข้างบ้าง แบบนี้ไม่แนะนำ ครับ'],
    version:1, confidence:'medium', seededAt:Date.now(), note:'preliminary from live read — refine via buildStyleDraft'
  });
  fbSet('assistant/styleProfiles/' + staffKey('วุฒิศักดิ์ ปราบวงษา') + '/current', {
    staffName:'วุฒิศักดิ์ ปราบวงษา', nickname:'Bobby', particle:'ครับ (often ครับผม)',
    tone:'brief, prompt operational confirmations (shipping, next steps)',
    form:'short one-liners; little elaboration',
    emojiUsage:'minimal',
    examples:['น่าจะส่งวันอังคารครับ','เดี๋ยวแจ้งไปครับ','ครับผม'],
    version:1, confidence:'medium-low', seededAt:Date.now(), note:'preliminary from live read — refine via buildStyleDraft'
  });
  // Pim (Pimlada Rattana): intentionally NOT seeded — collect real free-text first.
}
// Seed the nickname map into Firebase too, so the extension can show friendly names.
// (Source of truth stays STAFF_ALIASES in this file.) Run once from the editor.
function seedStaffAliases(){
  fbSet('assistant/staffAliases', STAFF_ALIASES);   // { nickname: "FB display name" }
}
// Seed static company knowledge — edit values to reality, extend freely.
function seedKnowledge(){
  fbSet('assistant/knowledgeStatic', {
    shipping:'TODO: zones/rates/lead time',
    warranty:'TODO: warranty terms',
    installation:'TODO: install service / instructions',
    payment:'TODO: transfer / COD rules',
    returns:'TODO: return policy'
  });
}
// Promote a staff member's newest draft → their current profile (after you reviewed it in Firebase).
// staffKeyOrName: the key (e.g. 'lanoy-add') or the display name. Run from the editor: promoteStyleDraft('Lanoy Add')
function promoteStyleDraft(staffKeyOrName){
  var k = resolveStaffKey(staffKeyOrName);
  var base = 'assistant/styleProfiles/' + k;
  var drafts = fbGet(base + '/drafts') || {};
  var keys = Object.keys(drafts).sort();
  if(!keys.length) throw new Error('no drafts for ' + k);
  var d = drafts[keys[keys.length-1]];
  d.version = ((fbGet(base + '/current')||{}).version||0) + 1;
  d.promotedAt = Date.now();
  fbSet(base + '/current', d);
  return d;
}
// Build drafts for everyone, then promote all newest drafts at once (convenience).
function buildAndPromoteAllStaff(){
  var res = actBuildStyleDraft({});
  (res.built||[]).forEach(function(r){ promoteStyleDraft(r.staff); });
  return res;
}
