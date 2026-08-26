/**
 * KP Wallpanel — FlowAccount relay (tax invoices from the app).
 *
 * The app is a public static page, so the FlowAccount client-id/secret must
 * never reach the browser. This Web App holds them and does three things:
 *   · health  → fetch a token, report ok/error (used by the app's setup check)
 *   · create  → create a TAX INVOICE in FlowAccount from an app order,
 *               then fetch its PDF (original + copy) and hand it back as base64
 *   · pdf     → re-fetch the PDF of an already-created invoice (reprint)
 *
 * The invoice is created IN FlowAccount — same number series, same VAT report,
 * exactly as if someone typed it there. The app only saves the returned id.
 *
 * Deploy (same pattern as translate.gs):
 *   Apps Script → paste this file → Deploy → Web app → Execute as ME,
 *   Access "Anyone" → copy the /exec URL into index.html KP_FLOWACCOUNT_URL.
 *
 * Script properties (Project Settings → Script properties):
 *   FA_CLIENT_ID      = <from FlowAccount MyCompany → Connections>
 *   FA_CLIENT_SECRET  = <same place>                    NEVER commit these.
 *   FA_MODE           = sandbox | live                  (start with sandbox!)
 *   FA_CULTURE        = th                              (optional, default th)
 *   FA_TOKEN_URL      = (optional override; default depends on FA_MODE, see below)
 *   FA_BASE_SANDBOX   = (optional; default https://openapi.flowaccount.com/v3-alpha)
 *   FA_BASE_LIVE      = (optional; default https://openapi.flowaccount.com/v3-alpha)
 *   FA_PATH_CREATE    = (optional; default /tax-invoices/inline)
 *   FA_PATH_PDF       = (optional; default /tax-invoices/{id}/export-pdf/base64)
 *
 * SANDBOX vs LIVE is only the TOKEN endpoint (verified against the live host on
 * 26.08.2026, unauthenticated):
 *   POST /test/token   → 200 {"error":"invalid_client"}  ← the sandbox door, open
 *   POST /token        → 403 {"message":"Forbidden"}     ← live, closed to us
 *   /v3-alpha/th/tax-invoices                   → 401 with a bad bearer = exists
 *   /sandbox/…                                  → 403    = never existed
 * So a sandbox token is what makes the calls run against the sandbox company;
 * the API path is the same v3-alpha for both. The old sandbox defaults
 * (/token + /sandbox) could not have worked — that is what the relay's
 * "token 403" really was, on top of the placeholder credentials.
 *
 * The create path is /tax-invoices/inline, from FlowAccount's own SDK
 * (github.com/flowaccount/flowaccount-openapi-sdk, TaxInvoiceApi:
 * "POST /tax-invoices/inline — Create tax invoice document inline discount or
 * inline vat", body InlineDocument → InlineDocumentResponse with
 * data.recordId / data.documentId / data.documentSerial). The guessed
 * /tax-invoices/inline-document answered 405 with a perfectly valid token.
 *
 * Request  (POST, text/plain JSON body):
 *   { "action":"health" }
 *   { "action":"create", "doc": { ...InlineDocument fields... } }
 *   { "action":"pdf", "id": 123456 }
 * Response (JSON): { ok:true, ... } or { error:"..." }
 */

function doPost(e) { return _faHandle(e); }
function doGet(e)  { return _faHandle(e); }   // ?action=health for a browser check

function _faProps() {
  var p = PropertiesService.getScriptProperties();
  var mode = (p.getProperty('FA_MODE') || 'sandbox').toLowerCase();
  return {
    id: p.getProperty('FA_CLIENT_ID') || '',
    secret: p.getProperty('FA_CLIENT_SECRET') || '',
    mode: mode,
    culture: p.getProperty('FA_CULTURE') || 'th',
    tokenUrl: p.getProperty('FA_TOKEN_URL')
      || (mode === 'live' ? 'https://openapi.flowaccount.com/token'
                          : 'https://openapi.flowaccount.com/test/token'),
    base: mode === 'live'
      ? (p.getProperty('FA_BASE_LIVE') || 'https://openapi.flowaccount.com/v3-alpha')
      : (p.getProperty('FA_BASE_SANDBOX') || 'https://openapi.flowaccount.com/v3-alpha'),
    // The one path that was guessed wrong for two weeks. It is a property now, so
    // the next surprise from FlowAccount costs a line in the settings, not a redeploy.
    pathCreate: p.getProperty('FA_PATH_CREATE') || '/tax-invoices/inline',
    pathPdf: p.getProperty('FA_PATH_PDF') || '/tax-invoices/{id}/export-pdf/base64'
  };
}

// Client-credentials token, cached until shortly before it expires.
function _faToken(cfg) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('fa_token_' + cfg.mode);
  if (hit) return hit;
  var res = UrlFetchApp.fetch(cfg.tokenUrl, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    muteHttpExceptions: true,
    payload: {
      grant_type: 'client_credentials',
      scope: 'flowaccount-api',
      client_id: cfg.id,
      client_secret: cfg.secret
    }
  });
  var code = res.getResponseCode();
  var body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (err) {}
  if (code !== 200 || !body.access_token) {
    throw new Error('token ' + code + ': ' + (res.getContentText() || '').slice(0, 300));
  }
  var ttl = Math.max(60, Math.min(21600, (parseInt(body.expires_in, 10) || 3600) - 120));
  cache.put('fa_token_' + cfg.mode, body.access_token, ttl);
  return body.access_token;
}

function _faApi(cfg, method, path, payloadObj) {
  var res = UrlFetchApp.fetch(cfg.base + path, {
    method: method,
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + _faToken(cfg) },
    payload: payloadObj ? JSON.stringify(payloadObj) : undefined
  });
  var code = res.getResponseCode();
  var body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (err) {}
  if (code < 200 || code >= 300) {
    throw new Error('api ' + code + ' ' + path + ': ' + (res.getContentText() || '').slice(0, 400));
  }
  return body;
}

// PDF of one tax invoice: original + copy in one file (เอกสารออกเป็นชุด).
function _faPdf(cfg, id) {
  var body = _faApi(cfg, 'post',
    '/' + cfg.culture + cfg.pathPdf.replace('{id}', id),
    { culture: cfg.culture, document: { original: true, copy: true } });
  var b64 = body && (body.data || body.pdf || '');
  if (!b64) throw new Error('pdf: empty response');
  return b64;
}

function _faHandle(e) {
  try {
    var req = {};
    if (e && e.postData && e.postData.contents) {
      try { req = JSON.parse(e.postData.contents); } catch (err) { req = {}; }
    }
    if (e && e.parameter && !req.action) req.action = e.parameter.action;

    var cfg = _faProps();
    if (!cfg.id || !cfg.secret) return _faJson({ error: 'FA_CLIENT_ID / FA_CLIENT_SECRET not set' });

    if (req.action === 'health') {
      _faToken(cfg);
      return _faJson({ ok: true, mode: cfg.mode, base: cfg.base });
    }

    if (req.action === 'create') {
      if (!req.doc || !req.doc.contactName) return _faJson({ error: 'no document' });
      var made = _faApi(cfg, 'post', '/' + cfg.culture + cfg.pathCreate, req.doc);
      // The created document sits in .data on the new API; be liberal in what we read.
      var d = made && (made.data || made);
      var id = d && (d.recordId || d.id);
      var serial = d && (d.documentSerial || d.documentId || d.bookCode || '');
      if (!id) return _faJson({ error: 'created but no id: ' + JSON.stringify(made).slice(0, 300) });
      var out = { ok: true, mode: cfg.mode, id: id, serial: serial };
      try { out.pdf = _faPdf(cfg, id); }
      catch (err) { out.pdfError = String(err); }   // invoice exists — say so even if the PDF hiccups
      return _faJson(out);
    }

    if (req.action === 'pdf') {
      if (!req.id) return _faJson({ error: 'no id' });
      return _faJson({ ok: true, mode: cfg.mode, id: req.id, pdf: _faPdf(cfg, req.id) });
    }

    return _faJson({ error: 'unknown action' });
  } catch (err) {
    return _faJson({ error: String(err), hint: _faHint(String(err)) });
  }
}

// The two failures that actually happen, in plain words — so whoever hits them
// knows whether to fix a credential, a plan, or a URL.
function _faHint(msg) {
  msg = String(msg || '');
  if (/token 40[13]/.test(msg))
    return 'FlowAccount refuses the credentials: either FA_CLIENT_ID / FA_CLIENT_SECRET are still the placeholders / wrong, or this account has no Open API access yet (it is only in the Pro Business package — sandbox access is issued by developer_support@flowaccount.com).';
  if (/token 400/.test(msg))
    return 'Token request rejected — check FA_CLIENT_ID / FA_CLIENT_SECRET for stray spaces or a swapped pair.';
  if (/api 404/.test(msg))
    return 'Endpoint not found for this account: the base URL does not match. Override FA_BASE_SANDBOX / FA_BASE_LIVE with the value from developers.flowaccount.com.';
  if (/api 40[13]/.test(msg))
    return 'Authenticated, but not allowed to create this document — check the package and that the credentials belong to this company.';
  return '';
}

function _faJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
