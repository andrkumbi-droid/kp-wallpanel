/**
 * KP Wallpanel — Chat auto-translate Web App (Thai ⇄ Burmese via Claude).
 *
 * Deploy: Extensions → Apps Script (any project that can hold the key) → paste
 * this file → Deploy → New deployment → Web app → Execute as ME, Access:
 * "Anyone". Copy the /exec URL into index.html's  KP_TRANSLATE_URL.
 *
 * Set the API key once (Project Settings → Script properties), key:
 *   ANTHROPIC_API_KEY = sk-ant-...
 * NEVER commit the key to the repo.
 *
 * Request  (POST, text/plain JSON body): { "text": "...", "target": "th"|"my"|"en" }
 * Response (JSON): { "text": "<translation>" }  or  { "error": "..." }
 */

var KP_TR_MODEL = 'claude-haiku-4-5-20251001'; // fast + cheap; good for short chat lines

function doPost(e) {
  return _trHandle(e);
}
function doGet(e) {
  // Allow ?text=..&target=.. for quick manual testing in the browser.
  return _trHandle(e);
}

function _trHandle(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try { payload = JSON.parse(e.postData.contents); } catch (err) { payload = {}; }
    }
    if (e && e.parameter) {
      if (payload.text == null && e.parameter.text) payload.text = e.parameter.text;
      if (payload.target == null && e.parameter.target) payload.target = e.parameter.target;
    }
    var text = (payload.text || '').toString().trim();
    var target = (payload.target || 'th').toString().toLowerCase();
    if (!text) return _json({ error: 'no text' });
    if (text.length > 2000) text = text.slice(0, 2000);

    var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!key) return _json({ error: 'ANTHROPIC_API_KEY not set' });

    var langName = target === 'my' ? 'Burmese (Myanmar)'
                 : target === 'en' ? 'English'
                 : 'Thai';
    var sys = 'You are a translation engine for a warehouse/logistics team chat. '
      + 'Translate the user message into ' + langName + '. '
      + 'Keep it natural and casual, preserve numbers, order codes (e.g. 2-028, #027, KP065), '
      + 'product codes and emoji unchanged. Output ONLY the translation, no quotes, no notes, '
      + 'no romanization. If the text is already in ' + langName + ', return it unchanged.';

    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        model: KP_TR_MODEL,
        max_tokens: 1024,
        system: sys,
        messages: [{ role: 'user', content: text }]
      })
    });

    var code = res.getResponseCode();
    var body = JSON.parse(res.getContentText() || '{}');
    if (code !== 200) {
      return _json({ error: 'api ' + code + ': ' + ((body.error && body.error.message) || '') });
    }
    var out = (body.content && body.content[0] && body.content[0].text || '').trim();
    return _json({ text: out });
  } catch (err) {
    return _json({ error: String(err) });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
