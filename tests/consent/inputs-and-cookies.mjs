/**
 * What is classified is what is sent (F5), duplicate GPC cookies (F6) and strict stored choices (F7). Sol R4 review.
 * Offline: a browser route serves the pages and the gate; every other request is answered by a local sink and
 * recorded. Vendor sends are counted from INTERCEPTED destinations, never from what a transport returned.
 *
 *   node tests/consent/inputs-and-cookies.mjs
 *   CONSENT_GATE_FILE=/path/to/older/consent.js node tests/consent/inputs-and-cookies.mjs   # RED on an older gate
 *
 * F5  The review's five constructions (URL with a throwing .url, URL with a spoofed first-party .url, Request with a
 *     spoofed .url, Request with a throwing .url, an object whose String() flips from first-party to vendor) plus the
 *     same flip made from inside a vendor-URL script, x fetch / sendBeacon / XHR / image .src, in every denied state:
 *     no choice, stored reject, navigator GPC, cookie GPC, malformed consent cookie, private path, a stored Accept
 *     whose referrer could not be narrowed, and a withdrawal in progress. Zero vendor destinations may be
 *     intercepted. Allowed control: with a valid Accept the vendor-bound constructions are sent, to exactly the
 *     destination that was classified.
 * SEM fetch / XHR / beacon / image semantics are preserved: each scenario runs on the gated page and on the same page
 *     with no gate, and the intercepted requests and returned results must match (method, headers, body, signal,
 *     credentials, a Request with init overrides, a used body, a streaming body, <base> relative, protocol-relative,
 *     data:, blob:).
 * F6  Real path-scoped duplicate consent_gpc cookies, both orders, with and without a stored Accept.
 * F7  Duplicate consent cookies both orders (valid + malformed, accept + reject, accept + accept), an extra field,
 *     an encoded NUL, a raw NUL in local storage and other noncanonical spellings.
 * V1  Cookies and local storage written by the LIVE v1 gate's own save() (CONSENT_V1_REF, default 7639942) are accepted by this gate.
 * MUT One mutant of this gate per rule must be caught (skipped when CONSENT_GATE_FILE is set).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { vendorHost } from './vendor-hosts.mjs';

const ROOT = new URL('../../', import.meta.url);
const GATE_FILE = process.env.CONSENT_GATE_FILE || '';
const GATE = readFileSync(GATE_FILE || new URL(process.env.CONSENT_GATE_PATH || 'consent/consent.js', ROOT), 'utf8');
const V1 = execFileSync('git', ['show', `${process.env.CONSENT_V1_REF || '7639942d9f54298e668a3321d6a564b6e778b0ca'}:${process.env.CONSENT_GATE_PATH || 'consent/consent.js'}`], { cwd: ROOT, encoding: 'utf8' });
const OUT = process.env.CONSENT_OUT || '';
const SITE = 'https://inputs.test'; // https: the choice cookie is the Secure __Host- one (consent.js rule 5)
const REF = 'http://inputs-ref.test';
const KEY = 'ic-consent';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const VENDOR_DEST = ['https://px.ads.linkedin.com/collect', 'https://www.google.de/ads/ga-audiences'];
const CONSTRUCTIONS = ['throw-url', 'spoof-url', 'request-spoof', 'request-throw', 'flipping', 'vendor-frame-flipping'];
const TRANSPORTS = ['fetch', 'beacon', 'xhr', 'image'];

let failures = 0; const results = []; let MUTE = false; // MUTE while a mutant runs: its failures are expected
function ok(cond, label, detail) { results.push({ ok: !!cond, label, detail }); if (MUTE) { if (!cond) failures += 1; return; } if (cond) console.log(`  ok   ${label}`); else { failures += 1; console.error(`  FAIL ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 600) : ''}`); } }

const html = (gated, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><title>ic</title>${extra}
${gated ? `<script>window.CONSENT_CONFIG=${JSON.stringify({ storageKey: KEY, privatePaths: '^/(chat)(/|$)', autoBar: false })};</script><script src="/consent/consent.js"></script>` : ''}
</head><body><main><button type="button" data-consent-withdraw>Withdraw</button></main></body></html>`;

async function fresh(browser, gate, { cookies = [], local = null, gpc = false, lock = false, path = '/p' } = {}) {
  const context = await browser.newContext({ userAgent: UA, serviceWorkers: 'block' });
  // A Path=/ choice cookie is this host's own (__Host-); a path-scoped one can only be the legacy name.
  if (cookies.length) await context.addCookies(cookies.map(([name, value, p]) => ({ name: name === KEY && !p ? `__Host-${KEY}` : name, value, domain: new URL(SITE).hostname, path: p || '/', secure: name === KEY && !p })));
  await context.addInitScript(({ site, local, gpc, lock, key }) => {
    if (location.origin !== site) return;
    if (local !== null && !sessionStorage.getItem('seeded')) { localStorage.setItem(key, local); sessionStorage.setItem('seeded', '1'); }
    if (gpc) Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true });
    if (lock) Object.defineProperty(document, 'referrer', { value: document.referrer, configurable: false });
  }, { site: SITE, local, gpc, lock, key: KEY });
  const seen = []; const errors = [];
  await context.route('**/*', async (route) => {
    const q = route.request(); const u = new URL(q.url());
    if (u.origin === REF) return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'referrer-policy': 'unsafe-url' }, body: `<a id="go" href="${SITE}/p">go</a>` });
    if (u.origin === SITE && (u.pathname === '/p' || u.pathname === '/chat/p') && q.isNavigationRequest()) return route.fulfill({ status: 200, contentType: 'text/html', body: html(true) });
    if (u.origin === SITE && u.pathname === '/plain' && q.isNavigationRequest()) return route.fulfill({ status: 200, contentType: 'text/html', body: html(false) });
    if (u.origin === SITE && u.pathname === '/consent/consent.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: gate });
    const headers = await q.allHeaders();
    seen.push({ url: q.url(), host: u.hostname, method: q.method(), body: q.postData() || '', headers, vendor: vendorHost(u.hostname) || /^\/_vercel\/insights(\/|$)/.test(u.pathname) });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': SITE, 'access-control-allow-credentials': 'true', 'content-type': 'text/plain' }, body: 'echo ' + q.method() });
  });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(String(e.message || e)));
  return { context, page: p, seen, errors };
}
const go = async (p, path = '/p') => { await p.goto(SITE + path); await p.waitForTimeout(250); };
const read = (p) => p.evaluate(() => { try { return { state: SiteConsent.state(), allowed: SiteConsent.allowed() }; } catch (e) { return { threw: e.message }; } }).catch((e) => ({ threw: String(e.message) }));

// Fires every construction through every transport at a vendor destination; returns the transport results.
const fireConstructions = (p, dest, tag) => p.evaluate(async ({ dest, tag, constructions, transports }) => {
  const out = {};
  const make = (kind, t) => {
    const d = dest + '?case=' + encodeURIComponent(tag + ':' + kind + ':' + t);
    if (kind === 'throw-url') { const o = new URL(d); Object.defineProperty(o, 'url', { get() { throw Error('getter'); } }); return o; }
    if (kind === 'spoof-url') { const o = new URL(d); Object.defineProperty(o, 'url', { value: location.origin + '/sink?spoof' }); return o; }
    if (kind === 'request-spoof') { const o = new Request(d); Object.defineProperty(o, 'url', { value: location.origin + '/sink?spoof' }); return o; }
    if (kind === 'request-throw') { const o = new Request(d); Object.defineProperty(o, 'url', { get() { throw Error('getter'); } }); return o; }
    if (kind === 'flipping') { let n = 0; return { toString() { return ++n === 1 ? location.origin + '/sink?flip=' + encodeURIComponent(tag + ':' + t) : d; } }; }
    return null;
  };
  const run = async (u, t) => {
    try {
      if (t === 'fetch') return await fetch(u, { mode: 'no-cors' }).then((r) => 'status ' + r.status, (e) => 'rejected ' + e.message);
      if (t === 'beacon') return navigator.sendBeacon(u, 'x');
      if (t === 'xhr') { const x = new XMLHttpRequest(); x.open('GET', u); x.send(); return 'invoked'; }
      if (t === 'image') { const im = new Image(); im.src = u; return 'invoked'; }
    } catch (e) { return 'threw ' + e.message; }
  };
  for (const kind of constructions) {
    for (const t of transports) {
      if (kind === 'vendor-frame-flipping') {
        // The same flip, made from code whose script URL is a vendor's (eval with a sourceURL).
        const d = dest + '?case=' + encodeURIComponent(tag + ':' + kind + ':' + t);
        window.__icDest = d; window.__icTag = tag + ':' + t; window.__icT = t; window.__icRun = run;
        out[kind + '/' + t] = await eval(`(function(){let n=0;const u={toString(){return ++n===1?location.origin+'/sink?vflip='+encodeURIComponent(window.__icTag):window.__icDest;}};return window.__icRun(u,window.__icT);})()\n//# sourceURL=https://www.googletagmanager.com/ic-canary.js`);
      } else {
        out[kind + '/' + t] = await run(make(kind, t), t);
      }
    }
  }
  return out;
}, { dest, tag, constructions: CONSTRUCTIONS, transports: TRANSPORTS });

async function f5States(browser, gate, label, { quick = false } = {}) {
  const accept = () => `1.accept.${Date.now()}`;
  const states = [
    ['no-choice', {}],
    ['stored-reject', { local: `1.reject.${Date.now()}` }],
    ['navigator-gpc', { local: accept(), gpc: true }],
    ['cookie-gpc', { local: accept(), cookies: [['consent_gpc', '1']] }],
    ['malformed-consent', { cookies: [[KEY, '%']] }],
    ['private-path', { local: accept(), path: '/chat/p' }],
    ['locked-referrer', { local: accept(), lock: true, arrive: true }],
    ['withdrawal', { local: accept(), withdraw: true }],
  ];
  const vendorTotals = {};
  for (const [name, opt] of (quick ? states.slice(0, 1) : states)) {
    const { context, page: p, seen, errors } = await fresh(browser, gate, opt);
    if (opt.arrive) { await p.goto(`${REF}/source?ref-secret=1`); await Promise.all([p.waitForURL(`${SITE}/**`), p.locator('#go').click()]); await p.waitForTimeout(250); }
    else await go(p, opt.path || '/p');
    if (opt.withdraw) await p.evaluate(() => document.querySelector('[data-consent-withdraw]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    const st = await read(p);
    ok(st.allowed === false, `${label} F5 ${name}: denied (allowed() false, state ${'threw' in st ? st.threw : st.state})`, st);
    for (const dest of VENDOR_DEST) await fireConstructions(p, dest, name).catch(() => {});
    await p.waitForTimeout(500);
    const vendor = seen.filter((s) => s.vendor);
    vendorTotals[name] = vendor.length;
    ok(vendor.length === 0, `${label} F5 ${name}: zero intercepted vendor destinations from ${CONSTRUCTIONS.length} constructions x 4 transports x ${VENDOR_DEST.length} destinations`, vendor.map((s) => s.url.slice(0, 120)));
    const flips = seen.filter((s) => /[?&](flip|vflip)=/.test(s.url));
    ok(flips.length === 2 * 2 * 4, `${label} F5 ${name}: each flipping object was sent to the first-party value it was classified as, once per transport (${flips.length} of 16)`);
    await context.close();
  }
  return vendorTotals;
}

async function f5Allowed(browser, gate, label) {
  const { context, page: p, seen } = await fresh(browser, gate, { local: `1.accept.${Date.now()}` });
  await go(p);
  for (const dest of VENDOR_DEST) await fireConstructions(p, dest, 'allowed');
  await p.waitForTimeout(500);
  const byKind = (k) => seen.filter((s) => s.vendor && s.url.includes(encodeURIComponent(':' + k + ':'))).length;
  // Expected sends per destination: a URL object's String() is its href, so throw-url and spoof-url reach the vendor
  // through all 4 transports; a Request reaches it through fetch only (String(Request) is "[object Request]").
  const got = Object.fromEntries(['throw-url', 'spoof-url', 'request-spoof', 'request-throw', 'flipping', 'vendor-frame-flipping'].map((k) => [k, byKind(k)]));
  ok(got['throw-url'] === 8 && got['spoof-url'] === 8 && got['request-spoof'] === 2 && got['request-throw'] === 2 && got.flipping === 0 && got['vendor-frame-flipping'] === 0,
    `${label} F5 allowed control: vendor-bound constructions are sent to the destination classified (throw-url 8, spoof-url 8, request-spoof 2, request-throw 2; flips 0)`, got);
  await context.close();
}

// SEM: the same script on the gated page and on /plain; intercepted requests and results must match.
const SEM = {
  'post-headers-body': `const r = await fetch('/echo/a', { method: 'POST', headers: { 'x-a': '1', 'content-type': 'application/json' }, body: '{"a":1}' }); return [r.status, await r.text()];`,
  'request-with-init-override': `const q = new Request('/echo/b', { method: 'PUT', body: 'request-body', headers: { 'x-in': 'req' } }); const r = await fetch(q, { method: 'POST', headers: { 'x-o': '2' } }); return [r.status, q.bodyUsed];`,
  'request-alone-body-used-once': `const q = new Request('/echo/c', { method: 'POST', body: 'once' }); const a = await fetch(q).then((r) => r.status, (e) => 'rej ' + e.name); const b = await fetch(q).then((r) => r.status, (e) => 'rej ' + e.name); return [a, b, q.bodyUsed];`,
  'abort-signal': `const c = new AbortController(); c.abort(); return [await fetch('/echo/d', { signal: c.signal }).then((r) => r.status, (e) => e.name)];`,
  'credentials': `document.cookie = 'sess=1; path=/'; await fetch('/echo/e1', { credentials: 'omit' }); await fetch('/echo/e2', { credentials: 'include' }); await fetch('/echo/e3'); return ['done'];`,
  'streaming-body': `const s = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('stream')); c.close(); } }); return [await fetch('/echo/f', { method: 'POST', body: s, duplex: 'half' }).then((r) => r.status, (e) => e.name)];`,
  'base-relative': `const b = document.createElement('base'); b.href = '/sub/'; document.head.prepend(b); await fetch('rel-fetch'); navigator.sendBeacon('rel-beacon', 'x'); const x = new XMLHttpRequest(); x.open('GET', 'rel-xhr'); x.send(); const im = new Image(); im.src = 'rel-img'; await new Promise((r) => setTimeout(r, 300)); return [im.getAttribute('src') === null ? 'none' : 'set'];`,
  'protocol-relative-font': `await fetch('//fonts.googleapis.com/css2?pr=1', { mode: 'no-cors' }).catch(() => {}); return ['done'];`,
  'data-url': `return [await (await fetch('data:text/plain,hello')).text()];`,
  'blob-url': `const u = URL.createObjectURL(new Blob(['blobby'])); return [await (await fetch(u)).text()];`,
  'xhr-post-async-flag': `const x = new XMLHttpRequest(); x.open('POST', '/echo/g', true); x.setRequestHeader('x-x', '3'); const done = new Promise((r) => { x.onloadend = () => r(x.status); }); x.send('xhr-body'); return [await done, x.responseText];`,
  'beacon-and-image': `const b = navigator.sendBeacon('/echo/h', 'beacon-body'); const im = new Image(); im.src = '/echo/i?img=1'; await new Promise((r) => setTimeout(r, 300)); return [b];`,
  'empty-image-src': `const im = new Image(); im.src = ''; await new Promise((r) => setTimeout(r, 200)); return [im.getAttribute('src')];`,
};
const pick = (s) => ({ path: new URL(s.url).pathname + new URL(s.url).search, method: s.method, body: s.body, h: Object.fromEntries(Object.entries(s.headers).filter(([k]) => /^(x-|content-type$|cookie$)/.test(k))) });
async function semantics(browser, gate, label) {
  for (const [name, code] of Object.entries(SEM)) {
    const runs = {};
    for (const path of ['/p', '/plain']) {
      const { context, page: p, seen } = await fresh(browser, gate);
      await go(p, path);
      const res = await p.evaluate(`(async () => { ${code} })()`).catch((e) => 'eval-threw ' + e.message);
      await p.waitForTimeout(200);
      // Order-insensitive: concurrent transports (beacon vs XHR) may arrive in either order on either page.
      runs[path] = { res, reqs: seen.map(pick).map((r) => JSON.stringify(r)).sort() };
      await context.close();
    }
    const same = JSON.stringify(runs['/p']) === JSON.stringify(runs['/plain']);
    ok(same, `${label} SEM ${name}: gated page matches the ungated page (requests and results)`, runs);
  }
}

async function cookieRules(browser, gate, label) {
  const now = Date.now();
  // F6: real path-scoped duplicates. Chromium lists the longer path first, so the two placements give both orders.
  for (const [order, cookies] of [['1-then-%', [['consent_gpc', '1', '/p'], ['consent_gpc', '%', '/']]], ['%-then-1', [['consent_gpc', '%', '/p'], ['consent_gpc', '1', '/']]]]) {
    for (const local of [null, `1.accept.${now}`]) {
      const { context, page: p, seen } = await fresh(browser, gate, { cookies, local });
      await go(p);
      const raw = await p.evaluate(() => document.cookie);
      const st = await read(p);
      await fireConstructions(p, VENDOR_DEST[1], 'f6').catch(() => {});
      await p.evaluate(() => { try { fetch('https://www.google.de/ads/ga-audiences?f6', { mode: 'no-cors' }).catch(() => {}); navigator.sendBeacon('https://www.google.de/ads/ga-audiences?f6b', 'x'); const x = new XMLHttpRequest(); x.open('GET', 'https://www.google.de/ads/ga-audiences?f6x'); x.send(); new Image().src = 'https://www.google.de/ads/ga-audiences?f6i'; } catch (e) { /* recorded by counts */ } });
      await p.waitForTimeout(400);
      const vendor = seen.filter((s) => s.vendor).length;
      ok(raw.split(';').filter((c) => c.trim().startsWith('consent_gpc=')).length === 2, `${label} F6 ${order}${local ? ' + stored Accept' : ''}: control, two consent_gpc cookies are visible (${raw})`);
      ok(st.state === 'gpc' && st.allowed === false && vendor === 0, `${label} F6 ${order}${local ? ' + stored Accept' : ''}: GPC wins, allowed() false, zero vendor sends on 4 transports`, { st, vendor });
      await context.close();
    }
  }
  { const { context, page: p } = await fresh(browser, gate, { cookies: [['consent_gpc', '%']], local: `1.accept.${now}` });
    await go(p); const st = await read(p);
    ok(st.state === 'accept' && st.allowed === true, `${label} F6 lone malformed consent_gpc is no signal (stored Accept stands)`, st); await context.close(); }
  { const { context, page: p } = await fresh(browser, gate, { local: `1.accept.${now}`, gpc: true });
    await go(p); const st = await read(p);
    ok(st.state === 'gpc', `${label} F6 navigator GPC still wins over a stored Accept`, st); await context.close(); }
  // F7: duplicates and formats. [description, cookies, local, expected state]
  const A = `1.accept.${now}`, R = `1.reject.${now}`;
  const cases = [
    ['dup accept-then-%', [[KEY, A, '/p'], [KEY, '%', '/']], null, null],
    ['dup %-then-accept', [[KEY, '%', '/p'], [KEY, A, '/']], null, null],
    ['dup accept-then-reject', [[KEY, A, '/p'], [KEY, R, '/']], null, 'reject'],
    ['dup reject-then-accept', [[KEY, R, '/p'], [KEY, A, '/']], null, 'reject'],
    // Legacy-name cookies (path-scoped duplicates cannot be the __Host- one): an Allow there is never trusted, since it may
    // come from another subdomain (consent.js rule 5, 2026-10-14). Was 'accept' before the host-only choice cookie.
    ['dup accept-then-accept (legacy name: not trusted)', [[KEY, A, '/p'], [KEY, `1.accept.${now - 1000}`, '/']], null, null],
    ['dup accept-then-extra-field', [[KEY, A, '/p'], [KEY, `${A}.extra`, '/']], null, null],
    ['extra field', [[KEY, `${A}.extra`]], null, null],
    ['encoded NUL', [[KEY, `${A}%00`]], null, null],
    ['encoded NUL in the middle', [[KEY, `1.accept%00.${now}`]], null, null],
    ['leading plus', [[KEY, `+1.accept.${now}`]], null, null],
    ['exponent timestamp', [[KEY, '1.accept.1.79e12']], null, null],
    ['space', [[KEY, `1.accept.%20${now}`]], null, null],
    ['version 2', [[KEY, `2.accept.${now}`]], null, null],
    ['raw NUL in local storage', [], `${A}\u0000`, null],
    ['local extra field', [], `${A}.x`, null],
    ['local Accept + ambiguous cookies keeps precedence', [[KEY, A, '/p'], [KEY, '%', '/']], A, 'accept'],
    ['canonical cookie Accept', [[KEY, A]], null, 'accept'],
    ['canonical encoded dots', [[KEY, A.replace(/\./g, '%2E')]], null, 'accept'],
  ];
  for (const [name, cookies, local, want] of cases) {
    const { context, page: p, seen } = await fresh(browser, gate, { cookies, local });
    await go(p); const st = await read(p);
    await p.evaluate(() => { try { fetch('https://px.ads.linkedin.com/collect?f7', { mode: 'no-cors' }).catch(() => {}); } catch (e) { /* none */ } });
    await p.waitForTimeout(250);
    const vend = seen.filter((s) => s.vendor).length;
    ok(st.state === want && (want === 'accept' ? st.allowed === true : st.allowed === false && vend === 0), `${label} F7 ${name}: state ${want} (got ${'threw' in st ? st.threw : st.state}), ${want === 'accept' ? 'allowed' : 'no vendor send'}`, { st, vend });
    await context.close();
  }
}

async function v1Compat(browser, gate, label) {
  for (const choice of ['accept', 'reject']) {
    const { context, page: p } = await fresh(browser, V1);
    await go(p);
    const saved = await p.evaluate((c) => { SiteConsent.set(c); return { cookie: document.cookie, local: localStorage.getItem('ic-consent') }; }, choice);
    await p.waitForTimeout(300);
    // Now the new gate reads what v1 wrote: both stores, then the cookie alone.
    await context.route('**/consent/consent.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: gate }));
    await go(p); const both = await read(p);
    await p.evaluate(() => localStorage.removeItem('ic-consent'));
    await go(p); const cookieOnly = await read(p);
    ok(both.state === choice && cookieOnly.state === choice && /^1\.(accept|reject)\.\d{13}$/.test(saved.local),
      `${label} V1 a ${choice} saved by the live v1 gate's own save() (${saved.local}; cookie ${saved.cookie}) is read as ${choice}: both stores ${both.state}, cookie alone ${cookieOnly.state}`, { saved, both, cookieOnly });
    await context.close();
  }
}

// One mutant per rule; each must be caught by the named check.
const MUTANTS = [
  ['F5 fetch sends the caller\'s original arguments', 'return f.call(w, req);', 'return f.apply(w, arguments);', 'f5'],
  ['F5 beacon sends the caller\'s original url', 'return arguments.length > 1 ? b.call(n, href, data) : b.call(n, href);', 'return b.apply(n, arguments);', 'f5'],
  ['F5 image sets the caller\'s raw value', 'I.set.call(this, href);', 'I.set.call(this, v);', 'f5'],
  ['F6 only the first consent_gpc cookie is read', "for (var i = 0; i < g.length; i++) if (g[i] === '1') return true;", "if (g[0] === '1') return true;", 'cookies'],
  ['F7 stored choice parse allows extra fields', 'var STORED = /^1\\.(accept|reject)\\.([0-9]{1,16})$/;', 'var STORED = /^1\\.(accept|reject)\\.([0-9]{1,16})/;', 'cookies'],
  ['F7 the first duplicate consent cookie decides', '    if (!vals.length) return null;', '    if (!vals.length) return null; return parse(vals[0]);', 'cookies'],
];

async function main() {
  const browser = await chromium.launch();
  const vendorTotals = {};
  try {
    Object.assign(vendorTotals, await f5States(browser, GATE, 'gate'));
    await f5Allowed(browser, GATE, 'gate');
    await semantics(browser, GATE, 'gate');
    await cookieRules(browser, GATE, 'gate');
    await v1Compat(browser, GATE, 'gate');
    if (!GATE_FILE) {
      for (const [name, from, to, part] of MUTANTS) {
        if (!GATE.includes(from)) { ok(false, `MUT ${name}: mutation point present in the gate`); continue; }
        const mutant = GATE.replace(from, to);
        const before = failures; const saved = results.length; MUTE = true;
        if (part === 'f5') await f5States(browser, mutant, 'mutant', { quick: true }); else await cookieRules(browser, mutant, 'mutant');
        const caught = failures > before;
        // Mutant failures are expected; they are not the gate's failures.
        failures = before; results.splice(saved); MUTE = false;
        ok(caught, `MUT ${name}: caught by the ${part === 'f5' ? 'F5 construction' : 'cookie rule'} checks`);
      }
    }
  } finally {
    await browser.close();
  }
  if (OUT) writeFileSync(OUT, JSON.stringify({ measured_at: new Date().toISOString(), failures, vendor_sends_by_denied_state: vendorTotals, results }, null, 2) + '\n');
  console.log(`vendor destinations intercepted per denied state: ${JSON.stringify(vendorTotals)}`);
  console.log(`inputs-and-cookies: ${results.length - failures} of ${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
