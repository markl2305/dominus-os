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
    var nav = $('#nav'), btn = $('#where'), idx = $('#index'), list = $('#indexList');
    if (!nav) return;
    // The index sheet opens below the header as rendered. With enlarged text the section
    // label wraps and the header grows past 64px, so its real height is published here.
    // Measured only from the observer (its first callback follows the first layout): reading
    // layout here, during setup, would let the diagram's initial selection animate on load.
    function navHeight() { root.style.setProperty('--nav-real', nav.getBoundingClientRect().height + 'px'); }
    if ('ResizeObserver' in window) new ResizeObserver(navHeight).observe(nav);
    else window.addEventListener('resize', navHeight);
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
    // The choice re-opened from "Your privacy choices" sits at the END of <body>
    // (data-consent-reopened) and must not move the nav.
    function barOffset() {
      var bar = document.querySelector('body > [data-consent-bar]:not([data-consent-reopened])');
      var off = bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0;
      root.style.setProperty('--bar-off', off + 'px');
    }
    if ('MutationObserver' in window) new MutationObserver(onScroll).observe(document.body, { childList: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();

    if (!btn || !idx) return;
    // Family rule 12: the index opens from its trigger and closes along the same path, faster (styles.css,
    // round 4). Open and closed are two CSS states, so toggling mid-animation carries on from the current
    // value. On phones it is a sheet from the header edge over a dimming scrim.
    var scrim = document.createElement('div');
    scrim.className = 'index-scrim'; scrim.setAttribute('aria-hidden', 'true');
    idx.parentNode.insertBefore(scrim, idx);
    // The scrim belongs to the menu: tapping it closes the sheet and returns focus to the trigger.
    scrim.addEventListener('pointerdown', function (e) { e.preventDefault(); open(false); btn.focus({ preventScroll: true }); });
    // While the panel is still on its way out (outside tap, scrim, swipe), Escape must still bring focus
    // back to the trigger: the exit is part of the menu, not a finished dismissal.
    var closing = false, closingTimer = null;
    function endClosing() { closing = false; clearTimeout(closingTimer); }
    idx.addEventListener('transitionend', function (e) { if (e.target === idx && e.propertyName === 'opacity' && !idx.classList.contains('open')) endClosing(); });
    function open(v) {
      if (v) endClosing();
      else if (idx.classList.contains('open')) { closing = !reduced(); clearTimeout(closingTimer); if (closing) closingTimer = setTimeout(endClosing, 400); }
      if (v) {
        // The panel grows out of the trigger: its transform origin sits on the trigger's centre.
        var b = btn.getBoundingClientRect();
        idx.style.setProperty('--origin-x', Math.round(b.left + b.width / 2 - idx.offsetLeft) + 'px');
      }
      // Whatever closes it, focus never stays inside the closed panel.
      var hadFocus = !v && idx.contains(document.activeElement);
      idx.classList.toggle('open', v);
      scrim.classList.toggle('on', v);
      btn.setAttribute('aria-expanded', String(v));
      if (v) {
        idx.removeAttribute('inert');
        var t = $('a[aria-current="true"]', idx) || $('a', idx);
        if (t) t.focus({ preventScroll: true });
      } else {
        if (hadFocus) btn.focus({ preventScroll: true });
        idx.setAttribute('inert', '');
      }
    }
    // Swipe the sheet back up towards the header to dismiss it (only when the swipe did not scroll the list).
    var swipe = null;
    idx.addEventListener('touchstart', function (e) { swipe = { y: e.touches[0].clientY, top: idx.scrollTop }; }, { passive: true });
    idx.addEventListener('touchend', function (e) {
      if (swipe && idx.scrollTop === swipe.top && swipe.y - e.changedTouches[0].clientY > 40) open(false);
      swipe = null;
    }, { passive: true });
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
      if (e.key !== 'Escape') return;
      if (idx.classList.contains('open')) { open(false); btn.focus(); }
      else if (closing) { endClosing(); btn.focus({ preventScroll: true }); }
    });
    idx.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var links = $$('a', idx), i = links.indexOf(document.activeElement);
      links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus(); e.preventDefault();
    });
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
    // The panel swap animates only after the visitor picks a step; the first panel is in place from first paint.
    var flowEl = tabs[0].closest('.flow');
    function choose(i, focus) { if (flowEl) flowEl.setAttribute('data-touched', ''); select(i, focus); }
    // On phones the panel sits under the stack: bring it into view after a tap.
    function reveal() {
      var pan = document.querySelector('.flow-panels');
      if (window.matchMedia('(max-width: 860px)').matches) pan.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    }
    tabs.forEach(function (t, j) {
      t.addEventListener('click', function () { choose(j); reveal(); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { choose(cur + 1, true); e.preventDefault(); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { choose(cur - 1, true); e.preventDefault(); }
      });
    });
    if (prev) prev.addEventListener('click', function () { choose(cur - 1); });
    if (next) next.addEventListener('click', function () { choose(cur + 1); });
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

  /* ---------------------------------------------------------- entrances (family rule 11)
     Native scrolling is never touched: nothing here reads or follows the scroll position.
     Each content block plays one short, time-based entrance when it first comes about 15%
     into the viewport, and never again. The hero, anything on screen at load, anything a fast
     flick passed and anything a deep link or anchor jump lands on shows at once. Without JS,
     with reduced motion and in print, everything is simply visible (styles.css, round 4). */
  (function entrances() {
    if (reduced() || !('IntersectionObserver' in window)) return;
    var ITEMS = [
      '.chap-head.reveal > *', '.sec-head.reveal > *', '.prose.reveal > *', '.cta2-in.reveal > *',
      '.reveal:not(.chap-head):not(.sec-head):not(.prose):not(.cta2-in)',
      '.glance2 .kicker', '.g-tile', '.notice > *'
    ].join(',');
    var STAGGER = 80, WINDOW = 100; // a batch's stagger never exceeds 100ms, so 700ms entrances end within 800ms
    var items = $$(ITEMS).filter(function (el) { return !el.closest('#top, .nav, .index, .foot'); });
    var show = function (el, delay) { el.style.setProperty('--reveal-delay', delay + 'ms'); el.setAttribute('data-revealed', ''); };
    var showNow = function (el) { el.setAttribute('data-reveal-instant', ''); el.setAttribute('data-revealed', ''); };
    // Only items still below the viewport wait; anything on screen at load (or above it, after a deep link) shows at once.
    var waiting = items.filter(function (el) { return el.getBoundingClientRect().top >= window.innerHeight; });
    items.forEach(function (el) { el.setAttribute('data-reveal', ''); if (waiting.indexOf(el) === -1) showNow(el); });
    root.setAttribute('data-motion-ready', '');
    var pending = waiting.slice();
    var done = function (el) { var i = pending.indexOf(el); if (i !== -1) pending.splice(i, 1); io.unobserve(el); jump.unobserve(el); };
    // A deep link or an in-page anchor scrolls (smoothly) to its target; until that scroll ends,
    // everything it passes or lands on shows at once.
    var lastY = window.scrollY, initial = true, jumping = false, jumpTimer = 0;
    function endJump() { jumping = false; clearTimeout(jumpTimer); }
    function startJump() { jumping = true; clearTimeout(jumpTimer); jumpTimer = setTimeout(endJump, 1500); window.addEventListener('scrollend', endJump, { once: true }); }
    if (location.hash) startJump();
    window.addEventListener('hashchange', startJump);
    document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href^="#"]'); if (a && a.getAttribute('href').length > 1) startJump(); }, true);
    var io = new IntersectionObserver(function (entries) {
      var jumped = initial || jumping || Math.abs(window.scrollY - lastY) > window.innerHeight * 0.9;
      lastY = window.scrollY; initial = false;
      var entering = entries.filter(function (e) { return e.isIntersecting && pending.indexOf(e.target) !== -1; }).map(function (e) { return e.target; });
      if (!entering.length) return;
      entering.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
      // Anything earlier in the page that a fast flick skipped shows at once.
      var first = entering[0];
      pending.slice().forEach(function (el) { if (el.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) { showNow(el); done(el); } });
      var step = entering.length > 1 ? Math.min(STAGGER, WINDOW / (entering.length - 1)) : 0;
      entering.forEach(function (el, i) {
        done(el);
        // Arrived by a jump rather than entering from below: show it at once.
        if (jumped || el.getBoundingClientRect().top < window.innerHeight * 0.5) showNow(el); else show(el, Math.round(i * step));
      });
    }, { rootMargin: '0px 0px -15% 0px', threshold: 0 });
    // During a jump, an item anywhere in the viewport (not only past the 15% line) shows at once.
    var jump = new IntersectionObserver(function (entries) {
      if (!jumping) return;
      entries.forEach(function (e) { if (e.isIntersecting && pending.indexOf(e.target) !== -1) { showNow(e.target); done(e.target); } });
    }, { threshold: 0 });
    waiting.forEach(function (el) { io.observe(el); jump.observe(el); });
    reduceMQ.addEventListener('change', function () { if (reduced()) { pending.slice().forEach(function (el) { showNow(el); done(el); }); } });
    // Printing shows everything (styles.css also forces it).
    window.addEventListener('beforeprint', function () { pending.slice().forEach(function (el) { showNow(el); done(el); }); });
  })();

  /* ---------------------------------------------------------- smooth anchor jumps (family rule 12)
     Turned on only after load, so the browser's own jump to a deep link's target stays instant. */
  (function smoothAnchors() {
    // Never under reduced motion, and it follows the preference if it changes after load.
    var ready = false;
    var sync = function () { if (ready && !reduced()) root.setAttribute('data-smooth-scroll', ''); else root.removeAttribute('data-smooth-scroll'); };
    var on = function () { setTimeout(function () { ready = true; sync(); }, 0); };
    reduceMQ.addEventListener('change', sync);
    if (document.readyState === 'complete') on(); else window.addEventListener('load', on, { once: true });
  })();

  /* ---------------------------------------------------------- images (family rule 12)
     An image still loading fades in from the page colour in 300ms; one already decoded is simply there. */
  (function images() {
    if (reduced()) return;
    $$('img').forEach(function (img) {
      if (img.complete) return;
      img.setAttribute('data-loading', '');
      var end = function () { img.removeAttribute('data-loading'); };
      img.addEventListener('load', end, { once: true });
      img.addEventListener('error', end, { once: true });
    });
  })();
})();
