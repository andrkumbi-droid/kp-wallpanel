/**
 * KP Wallpanel — geo-clean.gs
 * ---------------------------------------------------------------------------
 * Stage 5 of the address→pin machinery: the LEFTOVERS.
 *
 * index.html resolves a Thai address to จังหวัด / อำเภอ / ตำบล with rules and the
 * official 7,436-entry register (data/th-geo.json). Most addresses fall out of
 * that on their own. What is left over is the human stuff: a sub-district
 * spelled by ear, a village name where the sub-district should be, a district
 * that has been renamed, no ต./อ. markers at all. That is what this file is for.
 *
 * The split matters: **the model only PROPOSES a name — the app disposes.**
 * Whatever comes back is checked against the official register in the browser
 * before it is stored (ofGeoAI in index.html), so an invented sub-district
 * simply does not survive the trip. Nothing here can write a bad coordinate.
 *
 * DEPLOY (one time):
 *   1. New Apps Script project (or add this file to an existing one — but note
 *      one project = one /exec URL, and adding a file needs a NEW VERSION
 *      deployment or the old code keeps serving).
 *   2. Project Settings → Script properties:  ANTHROPIC_API_KEY = sk-ant-...
 *      NEVER commit the key to the repo.
 *   3. Deploy ▸ New deployment ▸ Web app.  Execute as: Me | Access: Anyone
 *   4. Copy the /exec URL into index.html →  var KP_GEOAI_URL = '...';
 *   Check a deployment: open <url>?action=ping → {"ok":true,"geoclean":true}
 *
 * REQUEST  (POST, JSON body):
 *   { "action":"geoclean",
 *     "items":[ {"h":"<hash>", "addr":"<raw thai address>", "prov":"<guess|''>"} , … ] }
 * RESPONSE (JSON):
 *   { "items":[ {"h":"…","prov":"ชัยภูมิ","amphoe":"เกษตรสมบูรณ์","tambon":"บ้านหัน"} , … ] }
 *   Unreadable entries are simply left out — an empty answer is a valid answer.
 */

// Sonnet, not Haiku: this is spelling-variant work on hand-typed Thai, which is
// exactly where the bigger model earns its money. It runs on a few dozen
// addresses a month, so the cost is noise. Swap in 'claude-haiku-4-5-20251001'
// if you ever batch thousands.
var KP_GEO_MODEL = 'claude-sonnet-5';
var KP_GEO_MAX_ITEMS = 60;

function doPost(e) { return _geoHandle(e); }
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'ping') return _geoJson({ ok: true, geoclean: true });
  return _geoHandle(e);
}

function _geoHandle(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try { payload = JSON.parse(e.postData.contents); } catch (err) { payload = {}; }
    }
    var items = payload.items;
    if (!items || !items.length) return _geoJson({ error: 'no items' });
    if (items.length > KP_GEO_MAX_ITEMS) items = items.slice(0, KP_GEO_MAX_ITEMS);

    var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!key) return _geoJson({ error: 'ANTHROPIC_API_KEY not set' });

    var sys =
      'You resolve hand-typed Thai delivery addresses to the official Thai administrative register.\n' +
      'For each numbered address, return the จังหวัด (province), อำเภอ/เขต (district) and ตำบล/แขวง ' +
      '(sub-district) it belongs to, spelled EXACTLY as in the official register — not as the ' +
      'customer typed it.\n' +
      'Rules:\n' +
      '- Write names WITHOUT the ต./อ./จ. prefix. The capital district is "เมือง"+province ' +
      '(e.g. "เมืองขอนแก่น"), never a bare "เมือง". Bangkok districts are the เขต name and ' +
      'sub-districts the แขวง name, both without the prefix.\n' +
      '- A village name (บ้าน…, หมู่บ้าน…) is NOT a sub-district. Use it only as a clue.\n' +
      '- A postal code in the text is strong evidence — trust it over a misspelled name.\n' +
      '- If you are not confident about the sub-district, return the district alone and leave ' +
      'tambon empty. If you are not confident about the district either, omit the entry ' +
      'completely. A missing answer is always better than a guessed one: every answer is ' +
      'checked against the official register and a wrong one is discarded anyway.\n' +
      '- Never invent a name that does not exist in the register.\n' +
      'Output STRICT JSON only, no prose, no code fence:\n' +
      '{"items":[{"i":<number>,"prov":"…","amphoe":"…","tambon":"…"}]}';

    var lines = items.map(function (it, i) {
      return (i + 1) + '. ' + String(it.addr || '').replace(/\s+/g, ' ').slice(0, 200)
           + (it.prov ? '   [province guessed by the app: ' + it.prov + ']' : '');
    }).join('\n');

    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: KP_GEO_MODEL,
        max_tokens: 4000,
        system: sys,
        messages: [{ role: 'user', content: lines }]
      })
    });

    var code = res.getResponseCode();
    var body = {};
    try { body = JSON.parse(res.getContentText() || '{}'); } catch (err) {}
    if (code !== 200) return _geoJson({ error: 'api ' + code + ': ' + ((body.error && body.error.message) || '') });

    var out = '';
    (body.content || []).forEach(function (c) { if (c.type === 'text') out += c.text; });
    out = out.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();

    var parsed;
    try { parsed = JSON.parse(out); } catch (err) { return _geoJson({ error: 'bad json from model' }); }

    // Map the model's 1-based index back onto the caller's hashes. The hash never
    // goes to the model — it has no use for it, and this way a shuffled or
    // hallucinated index can only drop an entry, never mislabel one.
    var res2 = [];
    (parsed.items || []).forEach(function (r) {
      var i = parseInt(r.i, 10) - 1;
      if (!(i >= 0 && i < items.length)) return;
      if (!r.prov) return;
      res2.push({
        h: items[i].h,
        addr: items[i].addr,
        prov: String(r.prov || '').trim(),
        amphoe: String(r.amphoe || '').trim(),
        tambon: String(r.tambon || '').trim()
      });
    });
    return _geoJson({ items: res2, asked: items.length });
  } catch (err) {
    return _geoJson({ error: String(err) });
  }
}

function _geoJson(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
