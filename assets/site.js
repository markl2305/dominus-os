/* DominusOS — one script for all pages (redesign, 2026-10-14).
   Nothing here contacts another host. Analytics consent is entirely
   /consent/consent.js; this file only keeps the nav clear of its bar. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var lightMQ = window.matchMedia('(prefers-color-scheme: light)');
  var reduced = function () { return reduceMQ.matches; };
  // Storage can be blocked (private window, file://): every access is wrapped.
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------------------------------------------------------- segmented control */
  function segmented(el, onChange) {
    var btns = $$('button', el);
    el.style.setProperty('--n', btns.length);
    function set(v, fire) {
      var i = 0;
      btns.forEach(function (b, j) { if (b.getAttribute('data-v') === v) i = j; });
      btns.forEach(function (b, j) { b.setAttribute('aria-checked', String(j === i)); b.tabIndex = j === i ? 0 : -1; });
      el.style.setProperty('--i', i);
      if (fire) onChange(btns[i].getAttribute('data-v'));
    }
    el.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && el.contains(b)) set(b.getAttribute('data-v'), true); });
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var i = 0; btns.forEach(function (b, j) { if (b.getAttribute('aria-checked') === 'true') i = j; });
      i = (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
      set(btns[i].getAttribute('data-v'), true); btns[i].focus(); e.preventDefault();
    });
    return { set: set };
  }

  /* ---------------------------------------------------------- theme
     System (default) · Dark · Light. "System" stores nothing, so the
     dos-theme key keeps meaning what the privacy notice says it means. */
  (function theme() {
    var segs = $$('.seg-theme');
    if (!segs.length) return;
    var resolve = function (pref) { return pref === 'light' || (pref === 'system' && lightMQ.matches) ? 'light' : 'dark'; };
    var controls = [];
    function apply(pref) {
      var next = resolve(pref);
      var swap = function () { root.setAttribute('data-theme-pref', pref); root.setAttribute('data-theme', next); };
      if (next !== root.getAttribute('data-theme') && document.startViewTransition && !reduced()) document.startViewTransition(swap);
      else swap();
      controls.forEach(function (c) { c.set(pref, false); });
    }
    segs.forEach(function (el) {
      controls.push(segmented(el, function (v) {
        if (v === 'system') store.del('dos-theme'); else store.set('dos-theme', v);
        apply(v);
      }));
    });
    var pref = root.getAttribute('data-theme-pref') || 'system';
    controls.forEach(function (c) { c.set(pref, false); });
    lightMQ.addEventListener('change', function () { if (root.getAttribute('data-theme-pref') === 'system') apply('system'); });
  })();

  /* ---------------------------------------------------------- nav: where am I */
  var sections = $$('[data-name]');
  (function nav() {
    var nav = $('#nav'), btn = $('#where'), idx = $('#index'), list = $('#indexList'), prog = $('#progress');
    if (!nav) return;
    if (list && sections.length) {
      list.innerHTML = sections.map(function (s) {
        return '<li><a href="#' + s.id + '" data-id="' + s.id + '"><span class="n">' + (s.getAttribute('data-n') || '') + '</span>' + s.getAttribute('data-name') + '</a></li>';
      }).join('');
    }
    function setCurrent(s) {
      if (!btn) return;
      $('.n', btn).textContent = s ? (s.getAttribute('data-n') || '') : '';
      $('.name', btn).textContent = s ? s.getAttribute('data-name') : (btn.getAttribute('data-top') || 'Overview');
      $$('a[data-id]', list).forEach(function (a) { a.setAttribute('aria-current', String(!!s && a.getAttribute('data-id') === s.id)); });
      $$('.toc a').forEach(function (a) { a.setAttribute('aria-current', String(!!s && a.getAttribute('href') === '#' + s.id)); });
    }
    // The current section is the last one whose top has crossed a line 35% down the viewport.
    var ticking = false;
    function onScroll() {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = window.scrollY, max = root.scrollHeight - window.innerHeight;
        if (prog) prog.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
        nav.classList.toggle('scrolled', y > 4);
        barOffset();
        var stage = document.getElementById('top');
        nav.classList.toggle('solid', !stage || stage.getBoundingClientRect().bottom < nav.getBoundingClientRect().bottom + 8);
        var line = window.innerHeight * 0.35, cur = null;
        sections.forEach(function (s) { if (s.getBoundingClientRect().top <= line) cur = s; });
        if (y >= max - 2 && sections.length) cur = sections[sections.length - 1];
        setCurrent(cur);
      });
    }
    // The live gate draws its bar as the first child of <body>, in flow. While
    // any of it is on screen the fixed nav sits just below it, never over it.
    function barOffset() {
      var bar = document.querySelector('body > [data-consent-bar]');
      var off = bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0;
      root.style.setProperty('--bar-off', off + 'px');
    }
    if ('MutationObserver' in window) new MutationObserver(onScroll).observe(document.body, { childList: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();

    if (!btn || !idx) return;
    function open(v) {
      idx.classList.toggle('open', v);
      btn.setAttribute('aria-expanded', String(v));
      if (v) {
        idx.removeAttribute('inert');
        var t = $('a[aria-current="true"]', idx) || $('a', idx);
        if (t) t.focus({ preventScroll: true });
      } else idx.setAttribute('inert', '');
    }
    btn.addEventListener('click', function () { open(btn.getAttribute('aria-expanded') !== 'true'); });
    idx.addEventListener('click', function (e) {
      var a = e.target.closest('a'); if (!a) return;
      var id = a.getAttribute('data-id');
      if (!id) { open(false); return; }
      e.preventDefault(); open(false);
      var target = document.getElementById(id);
      target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' });
      history.replaceState(null, '', '#' + id);
      btn.focus({ preventScroll: true });
    });
    document.addEventListener('pointerdown', function (e) {
      if (idx.classList.contains('open') && !idx.contains(e.target) && !btn.contains(e.target)) open(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && idx.classList.contains('open')) { open(false); btn.focus(); }
    });
    idx.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var links = $$('a', idx), i = links.indexOf(document.activeElement);
      links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus(); e.preventDefault();
    });
  })();

  /* ---------------------------------------------------------- reveal, once */
  (function reveal() {
    var els = $$('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -6% 0px' });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ---------------------------------------------------------- How it works: the action path
     A segmented control picks one of the three outcomes the paragraph names;
     the diagram lights that path and the paragraph marks the sentence that
     says it. Same words, mapped. */
  (function path() {
    var fig = $('#pathFig'); if (!fig) return;
    var seg = $('#pathSeg');
    var sentences = $$('[data-scn]', document).filter(function (el) { return el.classList.contains('scn'); });
    function show(v) {
      fig.setAttribute('data-scn', v);
      $$('[data-on]', fig).forEach(function (el) {
        el.classList.toggle('on', (' ' + el.getAttribute('data-on') + ' ').indexOf(' ' + v + ' ') !== -1);
      });
      sentences.forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-scn') === v); });
      var live = $('#pathLive'); if (live) live.textContent = ($('[data-scn="' + v + '"].scn') || {}).textContent || '';
    }
    var c = segmented(seg, show);
    c.set('permitted', true);
  })();
  /* ---------------------------------------------------------- authority flows: tabs */
  (function flow() {
    var tabs = $$('.flow-step'); if (!tabs.length) return;
    var prev = $('[data-flow="prev"]'), next = $('[data-flow="next"]');
    var cur = 0;
    function select(i, focus) {
      cur = Math.max(0, Math.min(tabs.length - 1, i));
      tabs.forEach(function (t, j) {
        var on = j === cur;
        t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).classList.toggle('on', on);
      });
      if (prev) prev.disabled = cur === 0;
      if (next) next.disabled = cur === tabs.length - 1;
      if (focus) tabs[cur].focus();
    }
    // On phones the panel sits under the stack: bring it into view after a tap.
    function reveal() {
      var pan = document.querySelector('.flow-panels');
      if (window.matchMedia('(max-width: 860px)').matches) pan.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    }
    tabs.forEach(function (t, j) {
      t.addEventListener('click', function () { select(j); reveal(); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { select(cur + 1, true); e.preventDefault(); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { select(cur - 1, true); e.preventDefault(); }
      });
    });
    if (prev) prev.addEventListener('click', function () { select(cur - 1); });
    if (next) next.addEventListener('click', function () { select(cur + 1); });
    select(0);
  })();

  /* ---------------------------------------------------------- status ledger filter */
  (function ledger() {
    var seg = $('#ledgerSeg'), rows = $$('#ledger2 li'); if (!seg) return;
    segmented(seg, function (v) {
      rows.forEach(function (r) {
        var show = v === 'all' || r.getAttribute('data-st') === v;
        r.classList.toggle('hide', !show);
        r.classList.remove('enter');
        if (show && !reduced()) { void r.offsetWidth; r.classList.add('enter'); }
      });
    }).set('all', false);
  })();
})();
