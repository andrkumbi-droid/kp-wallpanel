// Watches the open conversation for new incoming Thai messages and
// feeds them to the overlay (translation happens automatically).
// All selectors live in selectors.js.

(function () {
  let lastSeen = '';

  function conversationSnapshot() {
    // fixture mode: data-kp rows exist → use them
    const thread = kpQuery(KPSEL.thread);
    const rows = thread ? kpQueryAll(KPSEL.messageRow, thread) : [];
    if (rows.length) {
      return rows.map(row => ({
        dir: KPSEL.isIncoming(row) ? 'in' : 'out',
        text: KPSEL.messageText(row)
      })).filter(m => m.text);
    }
    // real Business Suite: geometric detection lives in inbox-live.js
    return (typeof kpLiveBubbles === 'function') ? kpLiveBubbles() : [];
  }

  // The trailing run of consecutive incoming messages = everything the customer
  // sent since our last reply. Treat that whole block as one "turn" so a burst
  // of separate messages is translated and answered together, not just the last.
  function trailingBurst(conv) {
    const burst = [];
    for (let i = conv.length - 1; i >= 0; i--) {
      if (conv[i].dir !== 'in') break;
      // stop at long ad/boilerplate blocks (the ad-referral message shows as incoming)
      if (conv[i].text.length > 300) break;
      burst.unshift(conv[i].text);
    }
    return burst;
  }

  function check() {
    const conv = conversationSnapshot();
    const burst = trailingBurst(conv);
    if (!burst.length) return;
    const joined = burst.join('\n');
    // process only when the burst changed and it contains Thai
    if (joined === lastSeen || !burst.some(t => KP_THAI_RE.test(t))) return;
    lastSeen = joined;
    KPUI.onIncoming(joined, conv, burst);
  }

  const mo = new MutationObserver(() => {
    clearTimeout(mo._t);
    mo._t = setTimeout(() => {
      check();
      try { if (KPUI && KPUI.autoCollect) KPUI.autoCollect(); } catch (e) {} // auto-learn new replies
    }, 400); // debounce bursts of DOM changes
  });
  mo.observe(document.body, { childList: true, subtree: true });

  KPUI.init();
  setTimeout(check, 800); // initial pass for an already-open conversation
})();
