/*
 * Visitor consent gate, v2 (VERSION stays 1: the stored-choice format is unchanged, so no one is asked again). Dependency-free, no vendor. RULED by Mark 2026-10-12 (compliance goal P1-1b):
 * keep GA4, but no analytics request until a real Accept; Reject and withdraw are honoured; Global Privacy
 * Control is honoured; the same pattern is reused on dominusfoundry.com (copy this file unchanged).
 *
 * How a page uses it — set the config BEFORE this file loads, then load it synchronously in <head>:
 *   <script>window.CONSENT_CONFIG = { storageKey: 'sabina-consent', privacyHref: '/privacy',
 *     ga4: 'G-XXXXXXX', linkedin: '1234567', vercel: true, privatePaths: '^/(api|chat)(/|$)' };</script>
 *   <script src="/consent/consent.js"></script>
 * Optional wording, all three default to the strings below: barText (the sentence before the Privacy notice link),
 * acceptLabel ('Allow analytics') and rejectLabel ('No analytics'). A site whose analytics tag also measures for an
 * advertising product names it here, through config, never by editing this file.
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
 *   3. Withdrawing (SiteConsent.set('reject') from the privacy page, or any reject that replaces a stored
 *      accept) disables GA4 at once, clears the analytics cookies this site can clear, and ALWAYS reloads, so no
 *      loaded script keeps running, including one this file did not load. From the first pointerdown, keydown
 *      or click on a withdraw control (mark it data-consent-withdraw), the page refuses every request to an
 *      analytics host until the reload, because a running tag (LinkedIn's) reports that very click. A press that
 *      is abandoned leaves analytics off on that page until the next full load.
 *   4. No server-side injection: every analytics tag is created here, in the browser, after rule 1 passes.
 *      With JavaScript off nothing runs, so nothing is sent.
 *   5. A choice is remembered for 180 days in BOTH stores: the cookie expires then, and a local-storage copy older
 *      than that (by the time saved with it) is treated as no choice, so the visitor is asked again.
 *   6. The page a visitor came from never reaches a vendor with its query string or fragment. Before any tag
 *      loads, document.referrer is narrowed to origin + path for this page, so every loader (GA4, LinkedIn,
 *      Vercel, and Vercel's React <Analytics />, which reads document.referrer itself and outside beforeSend)
 *      sees the same clean value. If the browser refuses the narrowing, nothing may run (rule 7).
 *   7. ONE ANSWER. SiteConsent.allowed() is the only "may any vendor run on this page now" answer: true only for
 *      a stored accept, no GPC, not a private path, not withdrawn on this page, and the referrer narrowed. state()
 *      is the visitor's CHOICE, for display only; never mount or call analytics on state() === 'accept'. The
 *      'siteconsent' event carries the state; a consumer re-reads allowed() when it fires.
 *      Safe by construction: from the moment this file runs, every fetch, sendBeacon, XMLHttpRequest and image
 *      request to an analytics host (or this site's /_vercel/insights) is refused while allowed() is false, so an
 *      analytics script mounted outside this file (React's <Analytics />, a tag a later change adds) cannot send
 *      either. Load this file before any analytics code: synchronously on a static page; on a Next page, any
 *      analytics component renders only when allowed() is true, which cannot be before this file ran.
 *   8. What counts as a vendor request (rule 7's guard): a host in a vendor's registrable-domain family, normalised
 *      (case, IDNA, port, trailing dot), including every regional google.<cc>; the /_vercel/insights path segment on
 *      any origin; and, while allowed() is false, ANY off-origin request made from a vendor's own script. Same-origin
 *      requests (relative URLs resolve against document.baseURI) are first-party and untouched, except that segment.
 *      Boundaries, by design: the guard wraps fetch, sendBeacon, XMLHttpRequest and image .src. A function a script
 *      captured before this file ran, a <script>/<iframe> src, and img.setAttribute('src') are not covered, which is
 *      why this file must run before any analytics code. The measured GA4, LinkedIn and Vercel loaders collect only
 *      through the wrapped APIs.
 *   9. Fail safe. Every read this file makes (cookies, local storage, URLs, the call stack, its own config) is total:
 *      an unreadable or malformed value is no value, never an exception and never a grant. Inside the request
 *      guard the destination is classified first, so a first-party request never depends on any of those reads,
 *      and an exception while deciding refuses a vendor destination and passes everything else.
 *  10. What is classified is what is sent (F5). Each wrapper resolves its input ONCE with the platform's own saved
 *      constructors: fetch builds the real Request (new Request(input, init)), reads that Request's url and sends
 *      THAT Request; sendBeacon, XHR open and image src resolve String(input) once against document.baseURI and hand
 *      the native API that absolute string. No .url property or second conversion of the caller's object is read,
 *      and the caller's object never reaches the native API. An input that cannot be resolved is refused quietly.
 *  11. Stored choices are strict (F7): exactly 1.<accept|reject>.<digits> within 180 days. Duplicate consent cookies
 *      grant acceptance only if every visible one parses and all agree; a valid local-storage choice still comes first.
 *      Every visible consent_gpc cookie is read (F6): any exact "1" means GPC, whatever its order or siblings.
 * Bump VERSION to ask everyone again (an old stored choice is then treated as no choice).
 */
(function (w, d) {
  'use strict';
  if (w.SiteConsent) return;
  var C = w.CONSENT_CONFIG || {};
  var VERSION = 1;
  var KEY = C.storageKey || 'site-consent';
  var MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
  // Rule 9 (fail safe): an unparseable privatePaths makes every path private, so nothing loads; it never breaks the gate.
  var PRIVATE;
  try { PRIVATE = new RegExp(C.privatePaths || '^/(api|chat|login)(/|$)'); } catch (e) { PRIVATE = /^/; }
  var subs = [];
  var started = false;

  // Rule 9: total. EVERY visible cookie with this name, in document order (path-scoped duplicates are real). A value this
  // file cannot read (malformed percent encoding such as "%", "%E0%A4", invalid encoded UTF-8) is null in the list,
  // never an exception and never a choice. An unreadable document.cookie is an empty list.
  function readCookies(name) {
    var out = [];
    try {
      var all = String(d.cookie || '').split(';');
      for (var i = 0; i < all.length; i++) {
        var part = all[i].replace(/^\s+/, '');
        var eq = part.indexOf('=');
        if (eq < 0 || part.slice(0, eq) !== name) continue;
        var v = null;
        try { v = decodeURIComponent(part.slice(eq + 1)); } catch (e) { v = null; }
        out.push(v);
      }
    } catch (e) { return []; }
    return out;
  }
  // Rule 2 / F6: GPC is on if the navigator says so, or if ANY visible consent_gpc cookie is exactly "1", whatever
  // its order among duplicates and whatever malformed siblings it has. A lone malformed consent_gpc is no signal.
  function gpcOn() {
    try { if (w.navigator && w.navigator.globalPrivacyControl === true) return true; } catch (e) { /* no signal */ }
    var g = readCookies('consent_gpc');
    for (var i = 0; i < g.length; i++) if (g[i] === '1') return true;
    return false;
  }
  // Rule 10 / F7: a stored choice is exactly "1.<accept|reject>.<digits>" (three fields, nothing else: no extra
  // field, no NUL, no sign, no space), saved within the last 180 days and not more than a day ahead of this clock.
  // Anything else is no choice. The saved format is unchanged; every value this file or v1 ever wrote matches it.
  var STORED = /^1\.(accept|reject)\.([0-9]{1,16})$/;
  function parse(raw) {
    if (typeof raw !== 'string') return null;
    var m = STORED.exec(raw);
    if (!m || VERSION !== 1) return null;
    var age = Date.now() - Number(m[2]);
    if (!(age <= MAX_AGE_MS && age >= -864e5)) return null;
    return m[1];
  }
  // F7: the cookie supplies a choice only when it is unambiguous: every visible consent cookie parses and all agree.
  // Any malformed, expired or disagreeing sibling means the cookie grants no acceptance; if one of them is a valid
  // reject, reject is honoured (the more private reading), otherwise there is no choice.
  function cookieChoice() {
    var vals = readCookies(KEY), first = null, ambiguous = false, sawReject = false;
    if (!vals.length) return null;
    for (var i = 0; i < vals.length; i++) {
      var c = parse(vals[i]);
      if (c === 'reject') sawReject = true;
      if (c === null) { ambiguous = true; continue; }
      if (first === null) first = c; else if (c !== first) ambiguous = true;
    }
    if (!ambiguous) return first;
    return sawReject ? 'reject' : null;
  }
  // A valid local-storage choice keeps its precedence over the cookie.
  function stored() {
    var local = null;
    try { local = parse(w.localStorage.getItem(KEY)); } catch (e) { /* storage blocked: fall back to the cookie */ }
    return local || cookieChoice();
  }
  function save(choice) {
    var v = VERSION + '.' + choice + '.' + Date.now();
    try { w.localStorage.setItem(KEY, v); } catch (e) { /* cookie below still records it */ }
    try {
      d.cookie = KEY + '=' + encodeURIComponent(v) + '; Path=/; Max-Age=' + (60 * 60 * 24 * 180) + '; SameSite=Lax' +
        (w.location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) { /* cookies blocked: local storage above still records it */ }
  }
  // The effective state: 'gpc' | 'accept' | 'reject' | null (no choice yet).
  function state() { return gpcOn() ? 'gpc' : stored(); }
  var quiet = false; // set by a withdrawal; nothing runs again on this page
  function privatePage() { return PRIVATE.test(w.location.pathname); }
  // Rule 7, the one answer. Narrowing is attempted only once a run is otherwise allowed.
  function allowed() {
    if (quiet || state() !== 'accept' || privatePage()) return false;
    narrowReferrer();
    return d.referrer === cleanReferrer();
  }

  function addScript(src) {
    var s = d.createElement('script');
    s.async = true; s.src = src;
    (d.head || d.documentElement).appendChild(s);
  }
  function cleanReferrer() {
    try { var r = new URL(d.referrer); return r.origin + r.pathname; } catch (e) { return ''; }
  }
  // Rule 6. Vercel's loader reads document.referrer on every send and puts it in its body as `r`, beyond the reach
  // of beforeSend; LinkedIn's reads it when framed. Shadowing the property on this document is the one place
  // every loader is covered. The value stays a real URL (origin + path), as GA4's page_referrer already was.
  function narrowReferrer() {
    var clean = cleanReferrer();
    if (d.referrer === clean) return;
    try { Object.defineProperty(d, 'referrer', { configurable: true, get: function () { return clean; } }); } catch (e) { /* not redefinable: see start() */ }
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
      var url;
      try { url = new URL(event.url); } catch (e) { return null; } // an event this file cannot read is dropped
      if (PRIVATE.test(url.pathname)) return null;
      url.search = ''; url.hash = '';
      return Object.assign({}, event, { url: url.toString() });
    });
    addScript('/_vercel/insights/script.js');
  }
  // Rule 8. Which requests are a vendor's. The host is normalised first (the URL parser lower-cases it, applies IDNA
  // and drops the port; a trailing dot is stripped here), then matched by registrable-domain FAMILY, so regional and
  // sub-domain spellings are covered: every google.<tld> and google.<sld>.<cc> (www.google.co.uk/ads/ga-audiences is in
  // the real GA runtime), and the ads/analytics domains below. The Vercel insights namespace counts on ANY origin, as a
  // path segment. A same-origin request is first-party (never touched) unless it is that namespace.
  var VENDOR_DOMAIN = /(^|\.)(google-analytics\.com|googletagmanager\.com|googletagservices\.com|doubleclick\.net|googleadservices\.com|googlesyndication\.com|app-measurement\.com|licdn\.com|linkedin\.com|vercel-insights\.com|vercel-scripts\.com)$/;
  var GOOGLE_DOMAIN = /(^|\.)google\.([a-z]{2,3}|(co|com|org|net|ac|ad|edu|gob|gov|ne|nic|or)\.[a-z]{2})$/;
  var VERCEL_PATH = /^\/_vercel\/insights(\/|$)/;
  // F5: the platform's own constructors and transports, saved before any other script can replace them. Every
  // classification below uses NURL/NRequest, and every send uses the saved native transport.
  var NURL = w.URL, NRequest = w.Request;
  var REQUEST_URL = NRequest && Object.getOwnPropertyDescriptor(NRequest.prototype, 'url');
  function baseHref() { try { return d.baseURI || w.location.href; } catch (e) { return w.location.href; } }
  // Internal strings only (stack frame URLs). Never given a caller's object.
  function toUrl(s) {
    try { return new NURL(String(s), baseHref()); } catch (e) { return null; }
  }
  // F5: a caller's input, resolved ONCE the way the browser resolves it (String() once, then against the document
  // base URL), to the absolute string the native API is then handed. null when it cannot be resolved; the wrapper
  // then refuses quietly. No .url property, getter or second conversion of the caller's object is ever read.
  function resolveHref(input) {
    try { return new NURL(String(input), baseHref()).href; } catch (e) { return null; }
  }
  function vendorHost(host) {
    var h = String(host || '').toLowerCase().replace(/\.+$/, '');
    return VENDOR_DOMAIN.test(h) || GOOGLE_DOMAIN.test(h);
  }
  function vendorUrl(u) {
    var x = toUrl(u);
    if (!x || !/^https?:$/.test(x.protocol)) return false;
    if (VERCEL_PATH.test(x.pathname)) return true;
    return x.origin !== w.location.origin && vendorHost(x.hostname);
  }
  // A request to ANY other off-origin host is refused too while allowed() is false if a vendor's code made it: a
  // recognised vendor URL appears in the current call stack (a heuristic, not provenance: a vendor ANCESTOR of site
  // code counts too, and a native async call with no such frame does not). Listed-family destinations do not depend
  // on it, and nothing same-origin is ever attributed.
  var FRAME_URL = /(https?:\/\/[^\s()'"]+?)(?::\d+){1,2}\)?$/;
  function fromVendorCode() {
    var stack = '';
    try { stack = String(new Error().stack || ''); } catch (e) { return false; }
    var lines = stack.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = FRAME_URL.exec(lines[i].trim());
      if (m && vendorUrl(m[1])) return true;
    }
    return false;
  }
  // Rule 9 + F5: decides on the RESOLVED absolute string that will be sent. The destination is classified before
  // consent is read, so first-party traffic never depends on a cookie or storage. An unresolved destination (null) is
  // refused. Any exception while deciding refuses a vendor destination and passes everything else.
  function refusedHref(href) {
    if (typeof href !== 'string') return true;
    var x;
    try { x = new NURL(href); } catch (e) { return true; }
    if (x.protocol !== 'http:' && x.protocol !== 'https:') return false; // data:, blob:, about: send nothing to a vendor
    var vendor = VERCEL_PATH.test(x.pathname) || (x.origin !== w.location.origin && vendorHost(x.hostname));
    if (!vendor && x.origin === w.location.origin) return false; // first-party: never consults consent
    try {
      if (allowed()) return false;
      if (vendor) return true;
      return fromVendorCode();
    } catch (e) {
      return vendor;
    }
  }
  // Rule 7 + F5: installed once, before any tag can load. Each wrapper resolves its input once, classifies that exact
  // value, and hands the native API that same value; the caller's original object never reaches the native API.
  // A refused or unresolvable call is refused quietly: fetch rejects with a TypeError, sendBeacon returns false, an
  // XHR opens on the resolved URL (or about:blank) and its send() does nothing, an image src is not set.
  (function guardNetwork() {
    var refuse = function () { return Promise.reject(new TypeError('analytics not allowed')); };
    var f = w.fetch;
    if (f && NRequest && REQUEST_URL && REQUEST_URL.get) {
      w.fetch = function (input, init) {
        var req, href;
        try {
          // The platform builds the real Request (method, headers, body, signal, credentials, a Request input with init
          // overrides); its url is what fetch will dispatch, and that same Request is what is sent.
          req = arguments.length > 1 ? new NRequest(input, init) : new NRequest(input);
          href = REQUEST_URL.get.call(req);
        } catch (e) { return refuse(); }
        if (refusedHref(href)) return refuse();
        return f.call(w, req);
      };
    }
    var n = w.navigator;
    if (n && n.sendBeacon) {
      var b = n.sendBeacon;
      n.sendBeacon = function (url, data) {
        var href = resolveHref(url);
        if (href === null || refusedHref(href)) return false;
        return arguments.length > 1 ? b.call(n, href, data) : b.call(n, href);
      };
    }
    var X = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
    if (X && typeof WeakMap === 'function') {
      var open = X.open, send = X.send;
      // The decision remembered for each XHR is keyed in a WeakMap, not an expando a page script could reset.
      var xhrs = new WeakMap();
      X.open = function (m, u) {
        var href = resolveHref(u);
        var args = Array.prototype.slice.call(arguments);
        args[1] = href === null ? 'about:blank' : href; // the decision is taken from exactly what native open() gets
        xhrs.set(this, { href: href, drop: href === null || refusedHref(href) });
        return open.apply(this, args);
      };
      X.send = function () {
        var st = xhrs.get(this);
        if (st && (st.drop || refusedHref(st.href))) return; // re-checked at send: a withdrawal in between refuses it
        return send.apply(this, arguments);
      };
    }
    var I = w.HTMLImageElement && Object.getOwnPropertyDescriptor(w.HTMLImageElement.prototype, 'src');
    if (I && I.set) {
      Object.defineProperty(w.HTMLImageElement.prototype, 'src', { configurable: true, enumerable: I.enumerable, get: I.get,
        set: function (v) {
          var raw;
          try { raw = String(v); } catch (e) { return; }
          if (raw === '') { I.set.call(this, ''); return; } // an empty src requests nothing, as natively
          var href = resolveHref(raw);
          if (href === null || refusedHref(href)) return;
          I.set.call(this, href);
        } });
    }
  })();
  // Only a withdrawal quiets the page: a first-choice reject leaves nothing running and nothing to stop.
  function quiesce() {
    if (quiet || !(started || stored() === 'accept')) return;
    quiet = true;
    if (C.ga4) w['ga-disable-' + C.ga4] = true;
  }
  // Registered before any tag loads, on window in the capture phase, so it runs ahead of a tag's own listeners.
  ['pointerdown', 'mousedown', 'keydown', 'click'].forEach(function (type) {
    w.addEventListener(type, function (e) {
      if (type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      var t = e.target;
      if (t && t.closest && t.closest('[data-consent-withdraw],[data-consent="reject"]')) quiesce();
    }, true);
  });

  // Private routes (C.privatePaths) load nothing at all, accept or not: allowed() is false there. A tag already
  // loaded on an earlier page of the same tab is not unloaded by a client-side route change, but its requests are
  // refused while the visitor is on a private path (rule 7), and GA4/Vercel also drop them through their filters.
  // If the browser refused the referrer narrowing, allowed() is false and no tag loads (rule 6).
  function start() {
    if (started || !allowed()) return;
    started = true;
    if (C.ga4) loadGa4(C.ga4);
    if (C.linkedin) loadLinkedIn(C.linkedin);
    if (C.vercel) loadVercel();
  }

  function clearAnalyticsCookies() {
    var all = '';
    try { all = String(d.cookie || ''); } catch (e) { return; }
    var names = all.split(';').map(function (c) { return c.split('=')[0].trim(); });
    var host = w.location.hostname;
    var domains = ['', host, '.' + host];
    var parts = host.split('.');
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    names.forEach(function (n) {
      if (!/^(_ga|_gid|_gat|_gcl|li_|_li|lidc|bcookie|AnalyticsSyncHistory|UserMatchHistory)/.test(n)) return;
      domains.forEach(function (dom) {
        try { d.cookie = n + '=; Path=/; Max-Age=0' + (dom ? '; Domain=' + dom : ''); } catch (e) { /* blocked */ }
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
    // A withdrawal is any reject that replaces an accept, whether or not this file loaded anything on this page.
    var withdrawing = choice === 'reject' && (started || stored() === 'accept');
    if (choice === 'reject') quiesce(); else quiet = false; // an explicit Allow is a new choice on this page
    save(choice);
    removeBar();
    if (choice === 'accept') { start(); emit(); return; }
    if (C.ga4) w['ga-disable-' + C.ga4] = true;
    clearAnalyticsCookies();
    emit();
    // A tag that already loaded on this page (by this file or anything else) cannot be unloaded; a reload is the only
    // honest way to stop it, so a withdrawal always reloads.
    if (withdrawing) w.location.reload();
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
    var text = C.barText || ('We use analytics (Google Analytics, Vercel Web Analytics' + (C.linkedin ? ', LinkedIn' : '') +
      ') only if you allow it. Nothing is sent until you choose.');
    p.appendChild(d.createTextNode(text + (/\s$/.test(text) ? '' : ' ')));
    var a = d.createElement('a');
    a.href = C.privacyHref || '/privacy'; a.textContent = 'Privacy notice'; a.style.color = 'inherit';
    p.appendChild(a);
    bar.appendChild(p);
    [['accept', C.acceptLabel || 'Allow analytics'], ['reject', C.rejectLabel || 'No analytics']].forEach(function (b) {
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
    allowed: allowed,       // THE answer to "may any vendor run on this page now" (rule 7)
    set: set,               // 'accept' | 'reject' (reject after accept = withdraw)
    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },
    mountBar: showBar,      // shows the bar if no choice has been made (no-op under GPC or after a choice)
  };

  start();
  emit();
  if (C.autoBar === false) return;
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', showBar); else showBar();
})(window, document);
