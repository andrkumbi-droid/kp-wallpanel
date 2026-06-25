/**
 * resolve-link.gs — KP Wallpanel map-link resolver
 * ------------------------------------------------------------------
 * Turns a Google-Maps SHORT link (maps.app.goo.gl / goo.gl/maps) — the kind
 * customers share from LINE — into {lat,lng}. The browser can't do this itself
 * (CORS blocks reading the redirect), so the client calls THIS web app.
 *
 * DEPLOY (one time):
 *   1. New Apps Script project (or add this file to an existing one).
 *   2. Deploy ▸ New deployment ▸ type "Web app".
 *        Execute as: Me   |   Who has access: Anyone
 *   3. Copy the /exec URL → paste it into index.html as KP_RESOLVER_URL.
 *   After ANY code change you must Deploy ▸ Manage deployments ▸ edit ▸
 *   "New version", or the old code keeps serving.
 *
 * USAGE:  GET <exec-url>?url=<encoded short link>
 *   →  {"lat":13.7563,"lng":100.5018}        on success
 *   →  {"error":"..."}                        otherwise
 *
 * Security: only google-maps hosts are resolved, so it can't be used as an
 * open redirect/SSRF proxy. No keys live here.
 */

function doGet(e) {
  var url = (e && e.parameter && e.parameter.url) ? String(e.parameter.url).trim() : '';
  var out = resolveMapLink(url);
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

// Whitelist of hosts we're willing to follow — keeps this from being an open proxy.
function _isAllowedHost(url) {
  return /^https?:\/\/(?:[a-z0-9-]+\.)*(?:google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl)\//i.test(url);
}

// Try to pull lat,lng out of any maps URL or page text.
function _extractCoords(s) {
  if (!s) return null;
  var dec = s;
  try { dec = decodeURIComponent(s); } catch (err) {}
  var hay = s + ' ' + dec; // search both raw and decoded (consent pages hide the real url in ?continue=)
  // Separator between lat,lng can be "," "+" " " or "%20" (Google writes
  // /maps/search/13.95,+100.74). SEP allows comma plus any of those after it.
  var SEP = '\\s*,[\\s+]*';
  var LAT = '(-?\\d{1,3}\\.\\d{3,})';
  // Order matters: !3d!4d is the actual map marker (precise), @lat,lng is only the
  // viewport centre — prefer the marker, fall back to the viewport.
  var m = hay.match(/!3d(-?\d{1,3}\.\d{3,})!4d(-?\d{1,3}\.\d{3,})/)
       || hay.match(new RegExp('[?&](?:q|query|destination|ll|sll|daddr)=' + LAT + SEP + LAT))
       || hay.match(new RegExp('/(?:search|place|dir)/' + LAT + SEP + LAT))
       || hay.match(/@(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  var lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat: lat, lng: lng };
}

function resolveMapLink(url) {
  if (!url) return { error: 'no url' };
  // Strip junk that customers sometimes paste onto the end of a link (a stray
  // backslash, quote, whitespace, bracket) — those make UrlFetchApp throw.
  url = url.replace(/[\\"'<>()\s]+$/g, '').trim();
  if (!_isAllowedHost(url)) return { error: 'host not allowed' };

  // Maybe coords are already in the given URL (long link) — cheapest case.
  var direct = _extractCoords(url);
  if (direct) return direct;

  var opts = {
    followRedirects: false,
    muteHttpExceptions: true,
    headers: {
      // A desktop UA + explicit language reduces the chance of a consent interstitial.
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  };

  var cur = url;
  for (var hop = 0; hop < 6; hop++) {
    var resp;
    try { resp = UrlFetchApp.fetch(cur, opts); } catch (err) { return { error: 'fetch failed: ' + err }; }
    var code = resp.getResponseCode();

    if (code >= 300 && code < 400) {
      var loc = resp.getAllHeaders()['Location'] || resp.getAllHeaders()['location'];
      if (Array.isArray(loc)) loc = loc[0];
      if (!loc) return { error: 'redirect without location' };
      var hit = _extractCoords(loc);
      if (hit) return hit;
      // resolve relative redirects against the current url
      cur = /^https?:\/\//i.test(loc) ? loc : (cur.replace(/(:\/\/[^\/]+).*$/, '$1') + loc);
      continue;
    }

    // 200 (or other) — coords must be in the final URL. We deliberately do NOT
    // parse the page body: Google embeds a decoy centre (52.5,13.4 Berlin) in the
    // HTML chrome, and returning a wrong coordinate is worse than returning none
    // (a no-coord stop just goes to the end of the list for the driver to handle).
    var fin = _extractCoords(cur);
    if (fin) return fin;
    return { error: 'no coords found (code ' + code + ')' };
  }
  return { error: 'too many redirects' };
}

// Quick manual test: edit the link, Run ▸ testResolve, check the log.
function testResolve() {
  Logger.log(resolveMapLink('https://maps.app.goo.gl/E4wUpQJKnAHVZ6iAA'));
}
