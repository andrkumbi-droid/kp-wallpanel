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
    else if(b.action==='logCorrection')         out = actLogCorrection(b);
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
    if(j.error) throw new Error('claude: ' + j.error.message);
    return (j.content && j.content[0] && j.content[0].text) || '';
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
function ctxStyle(){
  var s = fbGet('assistant/styleProfile/current');
  if(!s) return 'STYLE: polite Thai retail customer service, particle ' + '"ค่ะ"' + ', address customers as คุณ, light emoji use.';
  return 'COMPANY STYLE PROFILE (imitate the style, never copy sentences verbatim):\n' + JSON.stringify(s);
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
  var sys = 'You are the Thai customer-service voice of KP Wallpanel (WPC/PVC wall panels, Thailand, Facebook page chat). ' +
    ctxStyle() + '\n' + TH_RULES + '\n' +
    'Ground every factual claim (price, stock, width, shipping) ONLY in the DATA block; if the data does not answer it, say you will check (politely) instead of inventing. ' +
    'Return ONLY JSON {"suggestions":[{"th":"","back":""}]} with 2-3 alternative replies. th = the Thai reply ready to send. back = faithful '+L+' back-translation so a non-Thai-speaker can verify before sending. Vary the alternatives meaningfully (e.g. short vs. detailed, with vs. without upsell).';
  var user = 'DATA:\n' + blocks + '\n\nCUSTOMER MESSAGE:\n' + String(b.message||'') +
    (b.intent ? ('\n\nWHAT I WANT TO SAY (in '+L+', express this naturally in Thai, not literally):\n' + b.intent) : '');
  var out = llmJson(sys, user, 1500);
  out.customerInfo = cust || null;
  return out;
}

// {action:'saveStyleSamples', samples:[{in,out}]} — pairs scraped by the extension (PII already masked client-side).
function actSaveSamples(b){
  var samples = (b.samples||[]).filter(function(s){ return s && s.out; }).slice(0,100);
  samples.forEach(function(s){ fbPush('assistant/styleSamples', { in:maskPII(s.in||''), out:maskPII(s.out||''), ts:Date.now() }); });
  return {ok:true, saved:samples.length};
}

// {action:'logCorrection', suggested, edited, msgContext?} — collected only; learning happens via buildStyleDraft + your review.
function actLogCorrection(b){
  fbPush('assistant/corrections', { suggested:String(b.suggested||''), edited:String(b.edited||''),
    msgContext:maskPII(String(b.msgContext||'').slice(0,300)), ts:Date.now() });
  return {ok:true};
}

// {action:'buildStyleDraft'} — analyze samples + corrections → styleProfile/drafts/<ts>. You review in Firebase,
// then copy the draft to assistant/styleProfile/current (or run promoteStyleDraft below).
function actBuildStyleDraft(){
  var samples = asArr(fbGet('assistant/styleSamples')).slice(-80);
  var corr = asArr(fbGet('assistant/corrections')).slice(-40);
  if(!samples.length && !corr.length) return {error:'no_samples'};
  var draft = llmJson(
    'You analyze how a Thai wall-panel shop\'s staff writes to customers on Facebook. ANALYZE the style, do not copy sentences. ' +
    'Return ONLY JSON: {"particle":"ค่ะ|ครับ","address":"","greetings":[],"closings":[],"emojiUsage":"","commonPhrases":[],"discountStyle":"","refusalStyle":"","alternativesStyle":"","notes":""}. ' +
    'Fields describe patterns (short English descriptions + a few Thai examples). Corrections show suggested→edited pairs: what the staff changed reveals preferences — weigh them strongly.',
    'STAFF REPLIES (in = customer, out = staff):\n' + JSON.stringify(samples) +
    (corr.length ? ('\n\nCORRECTIONS (suggested → edited):\n' + JSON.stringify(corr)) : ''), 1500);
  var key = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');
  draft.builtAt = Date.now(); draft.sampleCount = samples.length; draft.correctionCount = corr.length;
  fbSet('assistant/styleProfile/drafts/' + key, draft);
  return {ok:true, draftKey:key, draft:draft};
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
// Promote the newest draft to current (after you reviewed it in Firebase).
function promoteStyleDraft(){
  var drafts = fbGet('assistant/styleProfile/drafts') || {};
  var keys = Object.keys(drafts).sort();
  if(!keys.length) throw new Error('no drafts');
  var d = drafts[keys[keys.length-1]];
  d.version = ((fbGet('assistant/styleProfile/current')||{}).version||0) + 1;
  d.promotedAt = Date.now();
  fbSet('assistant/styleProfile/current', d);
}
