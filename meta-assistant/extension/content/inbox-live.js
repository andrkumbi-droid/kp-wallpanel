// Live Meta Business Suite scraping (real inbox, not the fixture).
// Business Suite markup uses hashed class names, so detection is STRUCTURAL /
// GEOMETRIC, not CSS-class based — discovered from the live inbox on 2026-07-10:
//   · incoming (customer) bubbles are left-aligned; outgoing (page) are right-aligned
//   · the staff who wrote the replies is shown as "Gesendet von X" / "Sent by X",
//     but ONLY under the last message of the thread → we attribute at CONVERSATION
//     granularity (assumes one staff handled the chat; ambiguous ones are flagged)
// selectors.js fixture path stays authoritative for offline dev; this runs only
// when no data-kp fixture nodes are present.

const KP_SENTBY_RE = /(?:Gesendet von|Sent by)\s+(.+)$/i;
// noise lines that are not real messages (date separators appear standalone too)
const KP_NOISE_RE = /^(?:\d{1,2}:\d{2}|(?:Mo|Di|Mi|Do|Fr|Sa|So|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,\s]|Heute|Gestern|Today|Yesterday|Gesendet von|Sent by|Vorgeschlagene|Suggested|KI [·\-]|Zum Übernehmen|Zum Einfügen|Möchtest du|Schließen|Close|Du kannst|Werbeanzeige|Diese Unterhaltung|Dieser Chat|Details ansehen|Mir zuweisen)/i;

// Read the staff member the open conversation is attributed to, or '' if none/ambiguous.
// NB: the "Gesendet von X" node has children (<a> + <div>), so match the SMALLEST
// element whose combined text carries the attribution — not leaf nodes only.
function kpLiveStaff() {
  const nodes = [...document.querySelectorAll('span, div, a')].filter(n => {
    if (!KP_SENTBY_RE.test((n.textContent || '').replace(/\s+/g, ' ').trim())) return false;
    return ![...n.children].some(c => KP_SENTBY_RE.test((c.textContent || '').replace(/\s+/g, ' ').trim()));
  });
  const names = [...new Set(nodes.map(n => ((n.textContent || '').replace(/\s+/g, ' ').trim().match(KP_SENTBY_RE) || [])[1]).filter(Boolean))];
  return names.length === 1 ? names[0].trim() : ''; // '' = none, or >1 (ambiguous — don't guess)
}

// SAFE per-staff sampling: only the TRAILING run of outgoing messages (the ones the
// visible "Gesendet von X" actually applies to), paired with the preceding customer
// message. Earlier outgoing messages have an unknown sender and are deliberately NOT
// collected — this guarantees correct labels even when several staff share a chat.
function kpLiveTrailingSamples() {
  const b = kpLiveBubbles();
  let end = b.length - 1;
  while (end >= 0 && b[end].dir !== 'out') end--;      // last outgoing message
  if (end < 0) return [];
  let start = end;
  while (start - 1 >= 0 && b[start - 1].dir === 'out') start--; // back to run start
  // Business Suite renders each LINE of a message as its own node; join the whole
  // trailing outgoing run into one reply text (also groups a same-turn burst) — that
  // is what we want for style analysis, and avoids capturing only partial messages.
  const outText = b.slice(start, end + 1).map(x => x.text).filter(t => KP_THAI_RE.test(t)).join('\n').trim();
  if (!outText) return [];
  let inText = '';
  for (let j = start - 1; j >= 0; j--) { if (b[j].dir === 'in') { inText = b[j].text; break; } }
  return [{ in: inText, out: outText }];
}

// Scrape the open conversation into ordered {dir, text} bubbles using x-position.
// Bounds are viewport-RELATIVE (the old fixed 430/1300px broke on other window sizes —
// e.g. a wide screen clipped the right-aligned staff replies → no "out" bubbles).
function kpLiveBubbles() {
  const vw = window.innerWidth;
  // Skip the thread list (left ~25% of width) and a small right margin; keep the rest.
  const leftMin = Math.min(360, vw * 0.24);   // thread-list width, capped
  const rightMax = vw - 16;
  const leaves = [...document.querySelectorAll('div, span')].filter(n => {
    if (n.children.length) return false;
    const t = (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length < 2 || KP_NOISE_RE.test(t)) return false;
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left > leftMin && r.right < rightMax && r.top > 120;
  });
  if (!leaves.length) return [];
  leaves.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  // Dynamic split: divider = midpoint of the actual horizontal span of the bubbles,
  // so left/right (customer/staff) classification adapts to any layout / info-pane state.
  let minL = Infinity, maxR = -Infinity;
  leaves.forEach(n => { const r = n.getBoundingClientRect(); if (r.left < minL) minL = r.left; if (r.right > maxR) maxR = r.right; });
  const midX = (minL + maxR) / 2;
  return leaves.map(n => {
    const r = n.getBoundingClientRect();
    return { dir: (r.left + r.width / 2) > midX ? 'out' : 'in', text: (n.innerText || n.textContent).replace(/\s+/g, ' ').trim() };
  });
}
