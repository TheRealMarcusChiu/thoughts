/* Easter eggs — shared by index.html and article.html.
   - Type "marcus": highlighter mode. Drag over any text to mark it; marks
     persist for the session and survive re-renders/reloads. Uses the CSS
     Custom Highlight API (registers Ranges, injects no DOM), so support.js's
     React re-renders can't tear the marks out.
   - Konami code (up up down down left right left right b a): candlelight —
     a warm, cursor-tracking vignette that dims the page.
   Self-contained: injects its own CSS, lives outside the React root, and
   re-applies after every re-render via a MutationObserver. Esc exits either. */
(function () {
  var byId = function (id) { return document.getElementById(id); };

  // ---- inject styles ----
  var css = `
::highlight(marcus-mark){background-color:#d8a942;color:#0f0c09;}
body.marcus-on,body.marcus-on *{cursor:url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect x="9" y="2" width="6" height="13" rx="2" fill="%23d8a942"/><path d="M9 15h6l-3 6z" fill="%23ece1cf"/></svg>') 12 21,text;}
#candle-overlay{position:fixed;inset:0;z-index:99998;pointer-events:none;opacity:0;transition:opacity .6s ease;background:radial-gradient(circle 150px at var(--cx,50%) var(--cy,50%),rgba(216,169,66,.10),rgba(216,169,66,.03) 45%,transparent 64%),radial-gradient(circle 200px at var(--cx,50%) var(--cy,50%),transparent 0%,transparent 36%,rgba(7,5,3,.93) 80%);}
#candle-overlay.on{opacity:1;}
#egg-toast{position:fixed;left:50%;bottom:38px;transform:translateX(-50%) translateY(8px);z-index:99999;pointer-events:none;font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:#0f0c09;background:#d8a942;padding:9px 16px;border-radius:999px;box-shadow:0 12px 30px -8px rgba(216,169,66,.5);opacity:0;transition:opacity .35s ease,transform .35s ease;}
#egg-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}`;
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  (document.head || document.documentElement).appendChild(styleEl);

  // ---- tiny toast ----
  var toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'egg-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  // ===== candlelight (Konami code) =====
  var overlay, candleOn = false;
  function setCandle(on) {
    candleOn = on;
    if (!overlay) { overlay = document.createElement('div'); overlay.id = 'candle-overlay'; document.body.appendChild(overlay); }
    overlay.classList.toggle('on', on);
    if (on) toast('✦ candlelight');
  }
  document.addEventListener('mousemove', function (e) {
    if (!candleOn || !overlay) return;
    overlay.style.setProperty('--cx', e.clientX + 'px');
    overlay.style.setProperty('--cy', e.clientY + 'px');
  });
  var KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  var kIdx = 0;

  // ===== highlighter ("marcus") =====
  var MARK_KEY = 'marcus.marks:' + location.pathname; // per-page store
  var supportsHL = !!(window.CSS && CSS.highlights && window.Highlight);
  var hl = supportsHL ? new Highlight() : null;
  if (hl) CSS.highlights.set('marcus-mark', hl);
  var marks = load();
  var marcusOn = false, origTitle = null, origTag = null, origEb = null;

  function load() { try { return JSON.parse(sessionStorage.getItem(MARK_KEY)) || []; } catch (e) { return []; } }
  function save() { try { sessionStorage.setItem(MARK_KEY, JSON.stringify(marks)); } catch (e) {} }

  // Anchor each mark to its text node's value + offsets + which same-valued node
  // it is, so it can be re-resolved after React rebuilds the DOM (and on reload).
  function textNodes() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), out = [], n;
    while ((n = w.nextNode())) { if (n.nodeValue && n.nodeValue.trim()) out.push(n); }
    return out;
  }
  function occ(nodes, node) { var c = 0; for (var i = 0; i < nodes.length; i++) { if (nodes[i] === node) return c; if (nodes[i].nodeValue === node.nodeValue) c++; } return c; }
  function nth(nodes, val, k) { var c = 0; for (var i = 0; i < nodes.length; i++) { if (nodes[i].nodeValue === val) { if (c === k) return nodes[i]; c++; } } return null; }

  function applyMarks() {
    if (!hl) return;
    hl.clear();
    var nodes = textNodes();
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i], node = nth(nodes, m.t, m.n);
      if (!node) continue;
      var len = node.nodeValue.length, s = Math.min(m.s, len), e = Math.min(m.e, len);
      if (e <= s) continue;
      try { var r = document.createRange(); r.setStart(node, s); r.setEnd(node, e); hl.add(r); } catch (err) {}
    }
  }

  function captureSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    var range = sel.getRangeAt(0), nodes = textNodes(), segs = [];
    if (range.startContainer.nodeType === 3 && range.startContainer === range.endContainer) {
      segs.push({ node: range.startContainer, s: range.startOffset, e: range.endOffset });
    } else {
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (!range.intersectsNode(node)) continue;
        var s = node === range.startContainer ? range.startOffset : 0;
        var e = node === range.endContainer ? range.endOffset : node.nodeValue.length;
        if (e > s) segs.push({ node: node, s: s, e: e });
      }
    }
    var added = false;
    for (var j = 0; j < segs.length; j++) {
      var g = segs[j];
      marks.push({ t: g.node.nodeValue, s: g.s, e: g.e, n: occ(nodes, g.node) });
      added = true;
    }
    if (added) { save(); applyMarks(); }
    sel.removeAllRanges();
  }
  document.addEventListener('mouseup', function () { if (marcusOn) setTimeout(captureSelection, 0); });

  // Click an existing mark to remove it (in highlighter mode). Hit-test the click
  // point against stored marks; a hit also cancels the default action, so clicking
  // a marked card title removes the mark instead of opening the post.
  var downX = 0, downY = 0;
  document.addEventListener('mousedown', function (e) { downX = e.clientX; downY = e.clientY; });
  function caretAt(x, y) {
    if (document.caretPositionFromPoint) { var p = document.caretPositionFromPoint(x, y); return p ? { node: p.offsetNode, offset: p.offset } : null; }
    if (document.caretRangeFromPoint) { var r = document.caretRangeFromPoint(x, y); return r ? { node: r.startContainer, offset: r.startOffset } : null; }
    return null;
  }
  function markAtPoint(x, y) {
    var c = caretAt(x, y);
    if (!c || !c.node || c.node.nodeType !== 3) return -1;
    var nodes = textNodes();
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      if (nth(nodes, m.t, m.n) === c.node && c.offset >= m.s && c.offset <= m.e) return i;
    }
    return -1;
  }
  document.addEventListener('click', function (e) {
    if (!marcusOn) return;
    if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) return; // a drag, not a click
    var i = markAtPoint(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    marks.splice(i, 1);
    save();
    applyMarks();
    toast('mark removed');
  }, true);

  // The heading "becomes an instruction": index.html swaps its site title +
  // tagline; article.html (no site title) swaps its "← All writing" eyebrow.
  function applyTitle() {
    var t = byId('site-title'), g = byId('site-tagline'), eb = byId('mark-eyebrow');
    if (t) { if (origTitle == null) origTitle = t.textContent; var w1 = marcusOn ? 'Mark the thoughts.' : origTitle; if (t.textContent !== w1) t.textContent = w1; }
    if (g) { if (origTag == null) origTag = g.textContent; var w2 = marcusOn ? 'Drag to mark · click a mark to remove · Esc to exit.' : origTag; if (g.textContent !== w2) g.textContent = w2; }
    if (eb) { if (origEb == null) origEb = eb.textContent; var w3 = marcusOn ? '✦ Drag to mark · click to remove' : origEb; if (eb.textContent !== w3) eb.textContent = w3; }
  }
  function setMarcus(on) {
    marcusOn = on;
    document.body.classList.toggle('marcus-on', on);
    applyTitle();
    if (on) toast(supportsHL ? '✦ highlighter — drag to mark, click to remove' : '✦ highlighter (browser too old to mark)');
  }

  // ===== keys =====
  var buf = '';
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
    var key = e.key;

    // Konami code -> candlelight
    var expect = KONAMI[kIdx];
    if (key === expect || (expect.length === 1 && key.toLowerCase() === expect)) {
      if (++kIdx === KONAMI.length) { kIdx = 0; setCandle(!candleOn); }
    } else {
      kIdx = key === KONAMI[0] ? 1 : 0;
    }

    // type "marcus" -> highlighter
    if (/^[a-z]$/i.test(key)) {
      buf = (buf + key.toLowerCase()).slice(-8);
      if (buf.slice(-6) === 'marcus') { setMarcus(!marcusOn); buf = ''; }
    } else if (key !== 'Shift') {
      buf = '';
    }

    if (key === 'Escape') { if (candleOn) setCandle(false); if (marcusOn) setMarcus(false); }
  });

  // ===== re-apply marks/title after React re-renders (sort, filter, route, menus) =====
  var raf = 0;
  new MutationObserver(function () {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; applyMarks(); if (marcusOn) applyTitle(); });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  applyMarks(); // restore any marks already saved this session

  // ===== a hint in the console for the curious =====
  (function () {
    var head = 'font:600 12px "JetBrains Mono",monospace;color:#0f0c09;background:#d8a942;padding:4px 10px;border-radius:4px';
    var serif = 'font:italic 14px Newsreader,Georgia,serif;color:#ece1cf';
    var body = 'font:12px "JetBrains Mono",monospace;color:#cdc1ab;line-height:1.7';
    var dim = 'font:11px "JetBrains Mono",monospace;color:#8c8170';
    console.log('%c✦ Mark the Thoughts', head);
    console.log('%cYou found the margin. Two things are hidden here:', serif);
    console.log('%c  · type the author’s first name  →  a highlighter (drag to mark, click to remove)\n  · the old arcade incantation  ↑ ↑ ↓ ↓ ← → ← → B A  →  candlelight', body);
    console.log('%c— marcuschiu.com', dim);
  })();
})();
