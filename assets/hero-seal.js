/* DominusOS hero "Seal": an engraved guilloche ring around the hero statement.
   Decorative only (aria-hidden canvas, pointer-events none). Calm pace. Honors reduced motion
   (one still frame), pauses when the hero is off screen or the tab is hidden, DPR capped at 2,
   drawn at 30fps. No dependencies. (dominusos.ai copy, 2026-11-12, for a per-frame budget at 4x CPU, same look: precomputed tables; 300 + 1.2R points per strand instead of 360 + 1.6R; no per-frame allocation of colours or gradients; strand and tick paths cached and rebuilt a third per frame.) Remove the script tag and the page is exactly as before. */
(function () {
  var hero = document.querySelector('.hero2');
  if (!hero || !window.requestAnimationFrame) return;
  var inner = hero.querySelector('.hero2-in');
  var c = document.createElement('canvas');
  c.className = 'hero2-seal';
  c.setAttribute('aria-hidden', 'true');
  hero.insertBefore(c, hero.firstChild);
  var g = c.getContext('2d');
  if (!g) return;

  var SPEED = 1;            // 1 = Calm
  var GOLD = '210,178,122', EMBER = '232,137,60';
  var W = 0, H = 0, D = 1, cx = 0, cy = 0, R0 = 0, box = null;
  var t = 0, last = 0, raf = 0, visible = true;
  var rm = window.matchMedia('(prefers-reduced-motion: reduce)');

  // radius is in units of R0; amp in units of R0; k = lobes; n = interwoven strands
  var BANDS = [
    { r: 1.00, a: 0.030, k: 16, n: 4, dir: 1, col: GOLD, al: 0.20 },
    { r: 1.17, a: 0.052, k: 24, n: 6, dir: -1, col: GOLD, al: 0.15 },
    { r: 1.37, a: 0.040, k: 36, n: 5, dir: 1, col: EMBER, al: 0.15 },
    { r: 1.58, a: 0.060, k: 30, n: 6, dir: -1, col: GOLD, al: 0.10 }
  ];

  function size() {
    var r = hero.getBoundingClientRect();
    W = r.width; H = r.height;
    D = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(W * D); c.height = Math.round(H * D);
    g.setTransform(D, 0, 0, D, 0, 0);
    var b = inner.getBoundingClientRect();
    var kids = inner.children, wmax = 0, i, kr;
    for (i = 0; i < kids.length; i++) { kr = kids[i].getBoundingClientRect(); if (kr.width > wmax) wmax = kr.width; }
    box = { x: b.left - r.left, y: b.top - r.top, w: Math.min(b.width, wmax || b.width), h: b.height };
    cx = W / 2; cy = box.y + box.h / 2;
    // the ring clears the statement on wide screens and is cut by the hero edges on narrow ones
    R0 = Math.max(Math.min(box.w / 2 + 70, W * 0.34), Math.min(W, H) * 0.50, 230);
    tables(); fades();
  }

  // Per-band lookup tables (built on resize): cos/sin of the base angle and of the two lobe frequencies, so a frame
  // evaluates no trig per point; phase and rotation enter through the angle-addition identities. Same curve as before.
  var TAB = [];
  function tables() {
    TAB = BANDS.map(function (b) {
      var R = b.r * R0, steps = Math.max(300, Math.round(R * 1.2)), n = steps + 1, i, th;
      var t = { steps: steps, c: new Float32Array(n), s: new Float32Array(n), sk: new Float32Array(n), ck: new Float32Array(n), sh: new Float32Array(n), ch: new Float32Array(n) };
      for (i = 0; i < n; i++) {
        th = (i / steps) * 6.283185307;
        t.c[i] = Math.cos(th); t.s[i] = Math.sin(th);
        t.sk[i] = Math.sin(b.k * th); t.ck[i] = Math.cos(b.k * th);
        t.sh[i] = Math.sin((b.k / 2) * th); t.ch[i] = Math.cos((b.k / 2) * th);
      }
      return t;
    });
  }
  function strand(T, R, A, ph, rot) {
    var i, rr, x, y, n = T.steps;
    var cp = Math.cos(ph), sp = Math.sin(ph), cq = Math.cos(-ph * 0.5), sq = Math.sin(-ph * 0.5), cr = Math.cos(rot), sr = Math.sin(rot);
    var A2 = A * 0.35, C = T.c, S = T.s, SK = T.sk, CK = T.ck, SH = T.sh, CH = T.ch;
    var P = new Path2D();
    for (i = 0; i <= n; i++) {
      // R + A sin(k th + ph) + 0.35 A sin(k/2 th - ph/2), at angle th + rot
      rr = R + A * (SK[i] * cp + CK[i] * sp) + A2 * (SH[i] * cq + CH[i] * sq);
      x = cx + rr * (C[i] * cr - S[i] * sr); y = cy + rr * (S[i] * cr + C[i] * sr);
      if (i) P.lineTo(x, y); else P.moveTo(x, y);
    }
    P.closePath();
    return P;
  }

  // No per-frame allocation: stroke colours are precomputed strings, the 180 dial ticks use cos/sin tables (turned by
  // the angle-addition identities), and the three mask gradients are built once per resize in fades().
  var BSTYLE = BANDS.map(function (b) { return 'rgba(' + b.col + ',' + b.al + ')'; });
  var TICK = 'rgba(' + GOLD + ',0.30)', SEG = 16, ESTYLE = [], DOT = 'rgba(242,162,94,0.9)';
  for (var e = 0; e < SEG; e++) ESTYLE.push('rgba(' + EMBER + ',' + (0.55 * (1 - e / SEG)).toFixed(3) + ')');
  var TC = new Float32Array(180), TS = new Float32Array(180), TL = new Float32Array(180);
  for (var q = 0; q < 180; q++) { TC[q] = Math.cos(q * 0.034906585); TS[q] = Math.sin(q * 0.034906585); TL[q] = q % 15 === 0 ? 7 : 3; }
  // Strand and tick paths are cached. A moving frame rebuilds a third of the strands (round robin) and, on one frame in
  // three, the dial ticks, so each shape updates at 10Hz while the ring is drawn at 30fps. One update moves a strand by
  // at most ~0.35px and the ticks by ~0.15px, below a device pixel. The ember mark still moves every frame. A full draw
  // (first frame, resize, the reduced-motion still) rebuilds everything at the current time.
  var PATHS = [], TICKS = null, flip = 0;
  function draw(full) {
    var i, j, b, k = 0;
    g.clearRect(0, 0, W, H);
    g.lineWidth = 0.8;
    flip = (flip + 1) % 3;
    for (i = 0; i < BANDS.length; i++) {
      b = BANDS[i];
      g.strokeStyle = BSTYLE[i];
      for (j = 0; j < b.n; j++, k++) {
        if (full || !PATHS[k] || k % 3 === flip) PATHS[k] = strand(TAB[i], b.r * R0, b.a * R0, j * 6.283185307 / b.n + b.dir * t * 0.16, b.dir * t * 0.006);
        g.stroke(PATHS[k]);
      }
    }
    // dial ticks between the first two bands (base angle i * 2deg, turned by t * 0.004)
    var rt = 1.085 * R0;
    if (full || !TICKS || flip === 0) {
      var cr = Math.cos(t * 0.004), sr = Math.sin(t * 0.004), co, si, r1;
      TICKS = new Path2D();
      for (i = 0; i < 180; i++) {
        co = TC[i] * cr - TS[i] * sr; si = TS[i] * cr + TC[i] * sr; r1 = rt - TL[i];
        TICKS.moveTo(cx + r1 * co, cy + r1 * si);
        TICKS.lineTo(cx + rt * co, cy + rt * si);
      }
    }
    g.strokeStyle = TICK;
    g.stroke(TICKS);
    // one ember mark travelling the dial: authority passing around the ring
    var head = t * 0.085;
    g.lineWidth = 1.6; g.lineCap = 'round';
    for (i = 0; i < SEG; i++) {
      var a0 = head - i * 0.012;
      g.strokeStyle = ESTYLE[i];
      g.beginPath(); g.arc(cx, cy, rt, a0 - 0.012, a0); g.stroke();
    }
    g.fillStyle = DOT;
    g.beginPath(); g.arc(cx + (rt) * Math.cos(head), cy + (rt) * Math.sin(head), 2.2, 0, 6.3); g.fill();

    // keep the statement calm: soft punch-out behind the words, then fade to the hero edges (gradients built in fades())
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.translate(cx, cy); g.scale(FX, FY);
    g.fillStyle = GPUNCH; g.beginPath(); g.arc(0, 0, 1.2, 0, 6.3); g.fill();
    g.restore();
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = GTOP; g.fillRect(0, 0, W, 150);
    g.fillStyle = GBOT; g.fillRect(0, H - 110, W, 110);
    g.restore();
  }

  // the three mask gradients, built once per resize (they depend only on the hero's size and the statement's box)
  var GPUNCH = null, GTOP = null, GBOT = null, FX = 1, FY = 1;
  function fades() {
    FX = box.w / 2 + 24; FY = box.h / 2 + 30;
    GPUNCH = g.createRadialGradient(0, 0, 0.72, 0, 0, 1.18);
    GPUNCH.addColorStop(0, 'rgba(0,0,0,1)'); GPUNCH.addColorStop(1, 'rgba(0,0,0,0)');
    GTOP = g.createLinearGradient(0, 0, 0, 150);
    GTOP.addColorStop(0, 'rgba(0,0,0,1)'); GTOP.addColorStop(0.45, 'rgba(0,0,0,.85)'); GTOP.addColorStop(1, 'rgba(0,0,0,0)');
    GBOT = g.createLinearGradient(0, H - 110, 0, H);
    GBOT.addColorStop(0, 'rgba(0,0,0,0)'); GBOT.addColorStop(1, 'rgba(0,0,0,1)');
  }

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden || rm.matches) return;
    if (now - last >= 32) {
      t += Math.min(now - last, 100) / 1000 * SPEED;
      last = now;
      draw();
    }
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (rm.matches) { draw(true); return; }
    if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function relayout() { size(); draw(true); kick(); }

  t = 40; // start mid-pattern so the still frame is a good one
  relayout();
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(hero); else window.addEventListener('resize', relayout);
  if (window.IntersectionObserver) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; kick(); }).observe(hero);
  document.addEventListener('visibilitychange', kick);
  if (rm.addEventListener) rm.addEventListener('change', relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
})();
