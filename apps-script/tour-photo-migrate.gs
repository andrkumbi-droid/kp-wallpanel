/**
 * ONE-OFF: move the car photographs out of the tour history.
 *
 * WHY THIS RUNS HERE AND NOT IN THE APP
 * Every archived tour used to carry its car photo inside its own record — ~310 KB a
 * piece, 188 of them, 58 MB in total. Every device that opens the Drivers tab pulls
 * that whole node down, which on the office line (and on a phone) took minutes.
 * Moving them from a browser would mean pushing those 58 MB down AND back up through
 * the same line. Apps Script sits in Google's own network next to the database, so
 * the pictures never leave it: the office line carries nothing at all.
 *
 * WHAT IT DOES, PER TOUR, IN THIS ORDER
 *   1. read  tourHistory/<driver>/<rec>/carPhotos + carFeeSlips
 *   2. write tourPhotos/<driver>/<rec>   ← the pictures, at their new address
 *   3. read  it back and count           ← proof that step 2 really landed
 *   4. strip carPhotos/carFeeSlips off the record, leaving carPhotoN/carSlipN
 * Nothing is removed before it has been written AND read back somewhere else. Stop it
 * whenever you like: moved tours read from the new place, the rest from the old one,
 * the app shows both. Running it again picks up whatever is left.
 *
 * SETUP (once)
 *   1. Apps Script editor → new file → paste this in.
 *   2. Project Settings → tick "Show appsscript.json manifest file".
 *   3. In appsscript.json add:
 *        "oauthScopes": [
 *          "https://www.googleapis.com/auth/script.external_request",
 *          "https://www.googleapis.com/auth/firebase.database",
 *          "https://www.googleapis.com/auth/userinfo.email"
 *        ]
 *   4. Run migrateTourPhotos() and approve the permission prompt.
 *
 * Apps Script stops a run after six minutes. This one stops itself at five and
 * remembers where it got to, so just press Run again until it reports FINISHED.
 */

var DB = 'https://kp-wallpanel-default-rtdb.asia-southeast1.firebasedatabase.app';
var ROOT = '/v2';                 // the season root the app writes under
var TIME_BUDGET_MS = 5 * 60 * 1000;

function _url(path) {
  return DB + ROOT + path + '?access_token=' + ScriptApp.getOAuthToken();
}
function _get(path, shallow) {
  var u = _url(path + '.json') + (shallow ? '&shallow=true' : '');
  var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('GET ' + path + ' → ' + r.getResponseCode());
  var t = r.getContentText();
  return (t === 'null' || t === '') ? null : JSON.parse(t);
}
function _put(path, obj) {
  var r = UrlFetchApp.fetch(_url(path + '.json'), {
    method: 'put', contentType: 'application/json',
    payload: JSON.stringify(obj), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('PUT ' + path + ' → ' + r.getResponseCode());
}
function _patch(path, obj) {
  var r = UrlFetchApp.fetch(_url(path + '.json'), {
    method: 'patch', contentType: 'application/json',
    payload: JSON.stringify(obj), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('PATCH ' + path + ' → ' + r.getResponseCode());
}
function _count(v) {
  if (!v) return 0;
  return (v instanceof Array) ? v.length : Object.keys(v).length;
}
function _arr(v) {
  if (!v) return [];
  return (v instanceof Array) ? v : Object.keys(v).map(function (k) { return v[k]; });
}

/** What is left to move — reads only the KEYS, never a picture. Safe to run any time. */
function countTourPhotos() {
  var drivers = _get('/tourHistory', true) || {};
  var tours = 0, withPics = 0, pics = 0;
  Object.keys(drivers).forEach(function (dk) {
    var recs = _get('/tourHistory/' + dk, true) || {};
    Object.keys(recs).forEach(function (rk) {
      tours++;
      var n = _count(_get('/tourHistory/' + dk + '/' + rk + '/carPhotos', true))
            + _count(_get('/tourHistory/' + dk + '/' + rk + '/carFeeSlips', true));
      if (n) { withPics++; pics += n; }
    });
  });
  var msg = tours + ' tours · ' + withPics + ' still holding ' + pics + ' pictures';
  Logger.log(msg);
  return msg;
}

/** The move itself. Run, then run again until it says FINISHED. */
function migrateTourPhotos() {
  var t0 = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  var moved = parseInt(props.getProperty('tpm_moved') || '0', 10);
  var failed = [];

  var drivers = _get('/tourHistory', true) || {};
  var dks = Object.keys(drivers).sort();

  for (var i = 0; i < dks.length; i++) {
    var dk = dks[i];
    var recs = _get('/tourHistory/' + dk, true) || {};
    var rks = Object.keys(recs).sort();

    for (var j = 0; j < rks.length; j++) {
      if (new Date().getTime() - t0 > TIME_BUDGET_MS) {
        props.setProperty('tpm_moved', String(moved));
        Logger.log('PAUSED after ' + moved + ' tours — press Run again to continue.');
        return 'PAUSED · ' + moved + ' moved so far — press Run again';
      }
      var rk = rks[j];
      var base = '/tourHistory/' + dk + '/' + rk;

      // Is there anything here? Asking for the keys costs a few bytes, not a photo.
      var np = _count(_get(base + '/carPhotos', true));
      var ns = _count(_get(base + '/carFeeSlips', true));
      if (!np && !ns) continue;

      try {
        var ph = _arr(_get(base + '/carPhotos'));
        var sl = _arr(_get(base + '/carFeeSlips'));
        _put('/tourPhotos/' + dk + '/' + rk, { carPhotos: ph, carFeeSlips: sl });

        // Read the new place back before touching the old one. Counts have to match,
        // otherwise this tour is left exactly as it was and reported at the end.
        var okP = _count(_get('/tourPhotos/' + dk + '/' + rk + '/carPhotos', true));
        var okS = _count(_get('/tourPhotos/' + dk + '/' + rk + '/carFeeSlips', true));
        if (okP !== ph.length || okS !== sl.length) throw new Error('copy mismatch ' + okP + '/' + ph.length);

        _patch(base, { carPhotos: null, carFeeSlips: null, carPhotoN: ph.length, carSlipN: sl.length });
        moved++;
      } catch (err) {
        failed.push(dk + '/' + rk + ': ' + err.message);
      }
    }
  }

  props.deleteProperty('tpm_moved');
  var out = 'FINISHED · ' + moved + ' tours moved'
          + (failed.length ? ' · ' + failed.length + ' failed:\n' + failed.join('\n') : '');
  Logger.log(out);
  return out;
}

/** Emergency undo: put the pictures back into the records. Same guarantees, reversed. */
function undoTourPhotoMigration() {
  var drivers = _get('/tourPhotos', true) || {};
  var back = 0;
  Object.keys(drivers).forEach(function (dk) {
    var recs = _get('/tourPhotos/' + dk, true) || {};
    Object.keys(recs).forEach(function (rk) {
      var v = _get('/tourPhotos/' + dk + '/' + rk) || {};
      var ph = _arr(v.carPhotos), sl = _arr(v.carFeeSlips);
      if (!ph.length && !sl.length) return;
      _patch('/tourHistory/' + dk + '/' + rk, { carPhotos: ph, carFeeSlips: sl });
      back++;
    });
  });
  Logger.log(back + ' tours restored');
  return back + ' tours restored';
}
