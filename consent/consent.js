/*
 * Visitor consent gate, v1. Dependency-free, no vendor. RULED by Mark 2026-10-12 (compliance goal P1-1b):
 * keep GA4, but no analytics request until a real Accept; Reject and withdraw are honoured; Global Privacy
 * Control is honoured; the same pattern is reused on dominusfoundry.com (copy this file unchanged).
 *
 * How a page uses it — set the config BEFORE this file loads, then load it synchronously in <head>:
 *   <script>window.CONSENT_CONFIG = { storageKey: 'sabina-consent', privacyHref: '/privacy',
 *     ga4: 'G-XXXXXXX', linkedin: '1234567', vercel: true, privatePaths: '^/(api|chat)(/|$)' };</script>
 *   <script src="/consent/consent.js"></script>
 * On a React/Next page, load it `async` and set `autoBar: false`, then call SiteConsent.mountBar() from a client
 * component after hydration: a node inserted into <body> before hydration is wiped by React's re-render.
 * Components that need the state listen for the `siteconsent` window event (fired once the gate is ready and on
 * every change), because an async script may arrive after they mount.
 *
 * The rules this file enforces, and the only ones:
 *   1. Nothing is loaded until the stored choice is "accept" for the CURRENT version. No choice = nothing.
 *      A page load on a private route (C.privatePaths) loads nothing even after accept.
 *   2. GPC wins over everything: navigator.globalPrivacyControl === true, or the `consent_gpc=1` cookie that
 *      proxy.js sets when the request carried `Sec-GPC: 1`, is a reject. No bar is shown and a stored
 *      "accept" is ignored while the signal is on.
 *   3. Withdrawing (SiteConsent.set('reject') from the privacy page) disables GA4 at once, clears the
 *      analytics cookies this site can clear, and reloads so no loaded script keeps running.
 *   4. No server-side injection: every analytics tag is created here, in the browser, after rule 1 passes.
 *      With JavaScript off nothing runs, so nothing is sent.
 * Bump VERSION to ask everyone again (an old stored choice is then treated as no choice).
 */
(function (w, d) {
  'use strict';
  if (w.SiteConsent) return;
  var C = w.CONSENT_CONFIG || {};
  var VERSION = 1;
  var KEY = C.storageKey || 'site-consent';
  var PRIVATE = new RegExp(C.privatePaths || '^/(api|chat|login)(/|$)');
  var subs = [];
  var started = false;

  function readCookie(name) {
    var m = d.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function gpcOn() {
    try { if (w.navigator && w.navigator.globalPrivacyControl === true) return true; } catch (e) { /* no signal */ }
    return readCookie('consent_gpc') === '1';
  }
  function stored() {
    var raw = null;
    try { raw = w.localStorage.getItem(KEY); } catch (e) { /* storage blocked: fall back to the cookie */ }
    if (!raw) raw = readCookie(KEY);
    if (!raw) return null;
    var parts = String(raw).split('.');
    if (+parts[0] !== VERSION || (parts[1] !== 'accept' && parts[1] !== 'reject')) return null;
    return parts[1];
  }
  function save(choice) {
    var v = VERSION + '.' + choice + '.' + Date.now();
    try { w.localStorage.setItem(KEY, v); } catch (e) { /* cookie below still records it */ }
    d.cookie = KEY + '=' + encodeURIComponent(v) + '; Path=/; Max-Age=' + (60 * 60 * 24 * 180) + '; SameSite=Lax' +
      (w.location.protocol === 'https:' ? '; Secure' : '');
  }
  // The effective state: 'gpc' | 'accept' | 'reject' | null (no choice yet).
  function state() { return gpcOn() ? 'gpc' : stored(); }
  function allowed() { return state() === 'accept'; }

  function addScript(src) {
    var s = d.createElement('script');
    s.async = true; s.src = src;
    (d.head || d.documentElement).appendChild(s);
  }
  function cleanReferrer() {
    try { var r = new URL(d.referrer); return r.origin + r.pathname; } catch (e) { return ''; }
  }
  function loadGa4(id) {
    // The query string and fragment never reach Google: page_location is origin + pathname, the automatic
    // page_view is off, and the one page_view below is built from the same two parts.
    var path = w.location.pathname;
    w['ga-disable-' + id] = PRIVATE.test(path);
    w.dataLayer = w.dataLayer || [];
    w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
    var loc = w.location.origin + path;
    var ref = cleanReferrer();
    w.gtag('js', new Date());
    w.gtag('config', id, { send_page_view: false, page_location: loc, page_referrer: ref });
    if (!PRIVATE.test(path)) {
      w.gtag('event', 'page_view', { page_location: loc, page_path: path, page_title: d.title, page_referrer: ref, send_to: id });
      w.__consentPageViewPath = path; // a client-side router can skip its own first page_view for this path
    }
    addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id));
  }
  function loadLinkedIn(pid) {
    w._linkedin_partner_id = pid;
    w._linkedin_data_partner_ids = w._linkedin_data_partner_ids || [];
    w._linkedin_data_partner_ids.push(pid);
    if (!w.lintrk) { w.lintrk = function (a, b) { w.lintrk.q.push([a, b]); }; w.lintrk.q = []; }
    addScript('https://snap.licdn.com/li.lms-analytics/insight.min.js');
  }
  function loadVercel() {
    // First-party Vercel Web Analytics for pages that do not render the React <Analytics /> component.
    w.va = w.va || function () { (w.vaq = w.vaq || []).push(arguments); };
    w.va('beforeSend', function (event) {
      var url = new URL(event.url);
      if (PRIVATE.test(url.pathname)) return null;
      url.search = ''; url.hash = '';
      return Object.assign({}, event, { url: url.toString() });
    });
    addScript('/_vercel/insights/script.js');
  }
  // Private routes (C.privatePaths) load nothing at all, accept or not: the check runs before any loader.
  // A tag already loaded on an earlier page of the same tab is not unloaded by a client-side route change;
  // GA4 page views and Vercel events still drop private paths through their own filters.
  function privatePage() { return PRIVATE.test(w.location.pathname); }
  function start() {
    if (started || !allowed() || privatePage()) return;
    started = true;
    if (C.ga4) loadGa4(C.ga4);
    if (C.linkedin) loadLinkedIn(C.linkedin);
    if (C.vercel) loadVercel();
  }

  function clearAnalyticsCookies() {
    var names = d.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); });
    var host = w.location.hostname;
    var domains = ['', host, '.' + host];
    var parts = host.split('.');
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    names.forEach(function (n) {
      if (!/^(_ga|_gid|_gat|_gcl|li_|_li|lidc|bcookie|AnalyticsSyncHistory|UserMatchHistory)/.test(n)) return;
      domains.forEach(function (dom) {
        d.cookie = n + '=; Path=/; Max-Age=0' + (dom ? '; Domain=' + dom : '');
      });
    });
  }

  function emit() {
    var s = state();
    subs.slice().forEach(function (fn) { try { fn(s); } catch (e) { /* a listener never breaks the gate */ } });
    try { w.dispatchEvent(new CustomEvent('siteconsent', { detail: s })); } catch (e) { /* very old browser: subscribers above still ran */ }
  }

  function set(choice) {
    if (choice !== 'accept' && choice !== 'reject') return;
    var wasRunning = started;
    save(choice);
    removeBar();
    if (choice === 'accept') { start(); emit(); return; }
    if (C.ga4) w['ga-disable-' + C.ga4] = true;
    clearAnalyticsCookies();
    emit();
    // A tag that already loaded on this page cannot be unloaded; a reload is the only honest way to stop it.
    if (wasRunning) w.location.reload();
  }

  var bar = null;
  function removeBar() { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); bar = null; }
  function showBar() {
    if (bar || state() !== null || !d.body) return;
    bar = d.createElement('div');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Analytics choice');
    bar.setAttribute('data-consent-bar', '');
    bar.style.cssText = 'position:relative;z-index:50;display:flex;flex-wrap:wrap;align-items:center;gap:.6rem 1rem;' +
      'padding:.75rem 1rem;font:inherit;font-size:.9rem;line-height:1.45;background:#1d1a15;color:#efe7d8;' +
      'border-bottom:1px solid rgba(239,231,216,.25)';
    var p = d.createElement('p');
    p.style.cssText = 'margin:0;flex:1 1 22rem';
    p.appendChild(d.createTextNode('We use analytics (Google Analytics, Vercel Web Analytics' + (C.linkedin ? ', LinkedIn' : '') +
      ') only if you allow it. Nothing is sent until you choose. '));
    var a = d.createElement('a');
    a.href = C.privacyHref || '/privacy'; a.textContent = 'Privacy notice'; a.style.color = 'inherit';
    p.appendChild(a);
    bar.appendChild(p);
    [['accept', 'Allow analytics'], ['reject', 'No analytics']].forEach(function (b) {
      var btn = d.createElement('button');
      btn.type = 'button'; btn.textContent = b[1]; btn.setAttribute('data-consent', b[0]);
      btn.style.cssText = 'font:inherit;min-height:44px;padding:.5rem 1rem;cursor:pointer;border:1px solid #efe7d8;' +
        'border-radius:2px;background:' + (b[0] === 'accept' ? '#efe7d8;color:#1d1a15' : 'transparent;color:#efe7d8');
      btn.addEventListener('click', function () { set(b[0]); });
      bar.appendChild(btn);
    });
    d.body.insertBefore(bar, d.body.firstChild);
  }

  w.SiteConsent = {
    version: VERSION,
    state: state,           // 'gpc' | 'accept' | 'reject' | null
    allowed: allowed,       // true only for a stored, current-version accept with no GPC signal
    set: set,               // 'accept' | 'reject' (reject after accept = withdraw)
    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },
    mountBar: showBar,      // shows the bar if no choice has been made (no-op under GPC or after a choice)
  };

  start();
  emit();
  if (C.autoBar === false) return;
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', showBar); else showBar();
})(window, document);
