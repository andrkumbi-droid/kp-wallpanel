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

/**
 * SECOND PASS: the odometer photographs.
 *
 * Every km reading a driver enters is photographed, and that picture sat inside the
 * tour record's km log — twice over, because it was written to .photo AND .photos.
 * One tour of Aoo + Waen's came to 5 MB that way, and every device downloaded it to
 * show a column of numbers. Same treatment as the car photos: the pictures move to
 * tourPhotos/<driver>/<record>/km/<row>, the log keeps kmPhotoN, and the app fetches
 * them when somebody taps the 📷 button.
 *
 * Same rules as before: write the pictures, read them back, and only then rewrite the
 * log without them. Stops itself at five minutes — run again until FINISHED.
 */
function migrateKmPhotos() {
  var t0 = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  var moved = parseInt(props.getProperty('kmm_moved') || '0', 10);
  var failed = [];

  var drivers = _get('/tourHistory', true) || {};
  var dks = Object.keys(drivers).sort();

  for (var i = 0; i < dks.length; i++) {
    var dk = dks[i];
    var recs = _get('/tourHistory/' + dk, true) || {};
    var rks = Object.keys(recs).sort();

    for (var j = 0; j < rks.length; j++) {
      if (new Date().getTime() - t0 > TIME_BUDGET_MS) {
        props.setProperty('kmm_moved', String(moved));
        Logger.log('PAUSED after ' + moved + ' tours — press Run again to continue.');
        return 'PAUSED · ' + moved + ' moved so far — press Run again';
      }
      var rk = rks[j];
      var base = '/tourHistory/' + dk + '/' + rk;

      var log = _get(base + '/kmLog');
      if (!log) continue;
      var rows = _arr(log);
      var hasPics = false;
      for (var r = 0; r < rows.length; r++) {
        if ((rows[r] && rows[r].photo) || (rows[r] && rows[r].photos)) { hasPics = true; break; }
      }
      if (!hasPics) continue;

      try {
        // Pull the pictures out of the rows, keeping the row itself intact.
        var pics = {}, clean = [];
        for (var k = 0; k < rows.length; k++) {
          var e = rows[k] || {};
          var arr = _arr(e.photos);
          if (e.photo && arr.indexOf(e.photo) < 0) arr.unshift(e.photo);
          var c = {};
          for (var f in e) { if (f !== 'photo' && f !== 'photos') c[f] = e[f]; }
          if (arr.length) { pics[String(k)] = arr; c.kmPhotoN = arr.length; }
          clean.push(c);
        }

        _put('/tourPhotos/' + dk + '/' + rk + '/km', pics);

        // Count the rows back before rewriting the log.
        var okRows = _count(_get('/tourPhotos/' + dk + '/' + rk + '/km', true));
        if (okRows !== Object.keys(pics).length) throw new Error('copy mismatch ' + okRows);

        _put(base + '/kmLog', clean);
        moved++;
      } catch (err) {
        failed.push(dk + '/' + rk + ': ' + err.message);
      }
    }
  }

  props.deleteProperty('kmm_moved');
  var out = 'FINISHED · ' + moved + ' km logs cleaned'
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
      if (ph.length || sl.length) _patch('/tourHistory/' + dk + '/' + rk, { carPhotos: ph, carFeeSlips: sl });
      // ...and the odometer shots back into their rows.
      if (v.km) {
        var rows = _arr(_get('/tourHistory/' + dk + '/' + rk + '/kmLog'));
        Object.keys(v.km).forEach(function (idx) { if (rows[idx]) rows[idx].photos = _arr(v.km[idx]); });
        if (rows.length) _put('/tourHistory/' + dk + '/' + rk + '/kmLog', rows);
      }
      if (!ph.length && !sl.length && !v.km) return;
      back++;
    });
  });
  Logger.log(back + ' tours restored');
  return back + ' tours restored';
}
