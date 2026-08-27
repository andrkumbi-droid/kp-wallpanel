/**
 * build-th-geo.js — builds data/th-geo.json (the Thai gazetteer behind the
 * address → pin prediction in index.html).
 *
 * Two public sources, joined on the official 6-digit TIS-1099 sub-district code:
 *   1. thailand-geography-json → Thai names (province/amphoe/tambon) + postal code
 *      https://raw.githubusercontent.com/thailand-geography-data/thailand-geography-json/main/src/geography.json
 *   2. GeoNames TH dump (CC BY 4.0) → coordinates of every ADM2 (amphoe) and
 *      ADM3 (tambon): https://download.geonames.org/export/dump/TH.zip
 *
 * The join is exact: 7436/7436 tambon and 928/928 amphoe get coordinates.
 *
 * USAGE (from the repo root):
 *   node tools/build-th-geo.js <geography.json> <geonames-TH.txt> > data/th-geo.json
 *
 * OUTPUT SHAPE — nested, so the client can index it any way it likes:
 *   { v, gen, src, n:{prov,amphoe,tambon},
 *     p: { "<provinceTh>": { "<amphoeTh>": { c:[lat,lng], z:<zip>,
 *                                            t:{ "<tambonTh>":[lat,lng] | [lat,lng,zip] } } } } }
 *   A tambon carries its own zip ONLY when it differs from the amphoe's main zip.
 */
const fs = require('fs');

const geoFile = process.argv[2] || 'geography.json';
const gnFile = process.argv[3] || 'TH.txt';

const rows = JSON.parse(fs.readFileSync(geoFile, 'utf8'));

// GeoNames: admin3 code → tambon point, admin2 code → amphoe point.
const adm3 = {}, adm2 = {};
for (const line of fs.readFileSync(gnFile, 'utf8').split('\n')) {
  if (!line) continue;
  const c = line.split('\t');
  if (c[7] === 'ADM3' && c[12]) adm3[c[12]] = [+c[4], +c[5]];
  else if (c[7] === 'ADM2' && c[11]) adm2[c[11]] = [+c[4], +c[5]];
}

const r4 = n => Math.round(n * 1e4) / 1e4;   // ~11 m — far finer than a tambon centroid needs
const out = {}, zipTally = {};
let nT = 0, nMiss = 0;

for (const r of rows) {
  const prov = r.provinceNameTh, amp = r.districtNameTh, tam = r.subdistrictNameTh;
  const pt = adm3[String(r.subdistrictCode)];
  if (!pt) { nMiss++; continue; }
  out[prov] = out[prov] || {};
  const A = out[prov][amp] = out[prov][amp] || { t: {} };
  A.t[tam] = [r4(pt[0]), r4(pt[1]), r.postalCode];
  nT++;
  const key = prov + ' ' + amp;
  zipTally[key] = zipTally[key] || {};
  zipTally[key][r.postalCode] = (zipTally[key][r.postalCode] || 0) + 1;
  if (!A.c) {
    const ap = adm2[String(r.districtCode)];
    if (ap) A.c = [r4(ap[0]), r4(ap[1])];
  }
}

// Hoist the dominant postal code to the amphoe and strip it from the tambon rows
// that agree with it — that is most of them, and it keeps the file a third smaller.
let nA = 0;
for (const prov of Object.keys(out)) {
  for (const amp of Object.keys(out[prov])) {
    nA++;
    const A = out[prov][amp];
    const tally = zipTally[prov + ' ' + amp] || {};
    let best = 0, bestN = -1;
    for (const z of Object.keys(tally)) if (tally[z] > bestN) { bestN = tally[z]; best = +z; }
    A.z = best;
    for (const tam of Object.keys(A.t)) {
      const v = A.t[tam];
      A.t[tam] = (v[2] === best) ? [v[0], v[1]] : [v[0], v[1], v[2]];
    }
    if (!A.c) {                                   // no ADM2 point → mean of its tambon
      const ts = Object.keys(A.t).map(k => A.t[k]);
      A.c = [r4(ts.reduce((s, v) => s + v[0], 0) / ts.length), r4(ts.reduce((s, v) => s + v[1], 0) / ts.length)];
    }
  }
}

process.stderr.write('provinces ' + Object.keys(out).length + ' | amphoe ' + nA + ' | tambon ' + nT + ' | unmatched ' + nMiss + '\n');
process.stdout.write(JSON.stringify({
  v: 1,
  gen: new Date().toISOString().slice(0, 10),
  src: 'thailand-geography-json (names/zip) x GeoNames TH ADM2+ADM3 (coords, CC BY 4.0)',
  n: { prov: Object.keys(out).length, amphoe: nA, tambon: nT },
  p: out
}));
