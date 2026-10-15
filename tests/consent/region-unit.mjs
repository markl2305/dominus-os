/**
 * Consent region unit checks, offline (Mark 2026-10-14, shared memory 77550c45). No server and no network: a browser
 * route serves a page and consent/consent.js; every other request is aborted and fails the run. Ported to dominusos.ai
 * 2026-10-15 from hiresabina main f8ee005 unchanged except for the gate path (CONSENT_GATE_PATH, default
 * consent/consent.js) and the base ref (dominusos origin/main 3053675, whose consent.js is byte-identical to
 * hiresabina's e66c695, sha256 ea9a828c...).
 *
 *   node tests/consent/region-unit.mjs
 *   CONSENT_GATE_FILE=/path/to/older/consent.js node tests/consent/region-unit.mjs   # RED: a gate with no region
 *
 * R1  consent-region.mjs: every ask-first country (EU 27, EEA, UK, CH and the listed territories) is `ask`; ordinary
 *     other countries are `default`; a missing, empty, malformed, lower-case-garbage or reserved code is `ask`.
 * R1b only officially assigned ISO 3166-1 alpha-2 codes can be default-on (review F4): unassigned/user-assigned codes ask.
 * R2  consent.js reads the region strictly: only regionalDefault: true in the site config AND an unambiguous
 *     __Host-consent_region=default (every visible one exactly "default") is the default-on region; none, "ask",
 *     "DEFAULT", a malformed value, a disagreeing duplicate, the plain consent_region name, or no flag is ask-first.
 * R5  stored choices reconcile by time (review F3): a valid reject is never defeated by an older accept.
 * R6  the choice cookie is the host-only __Host-<key> (2026-10-14): only it and local storage can carry an Allow; a
 *     legacy <key> cookie counts for a reject only, migrates once, and is removed; GPC still wins.
 * R3  in the default-on region a stored choice and GPC still win; openChoices() is false under GPC.
 * R4  the ask-first bar renders byte-identical to the base gate (CONSENT_BASE_REF, default 3053675), with and without
 *     a region cookie present.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { consentRegion, ASK_FIRST_COUNTRIES, ISO_3166_1 } from '../../consent-region.mjs';

const ROOT = new URL('../../', import.meta.url);
const GATE_PATH = process.env.CONSENT_GATE_PATH || 'consent/consent.js';
const GATE = readFileSync(process.env.CONSENT_GATE_FILE || new URL(GATE_PATH, ROOT), 'utf8');
const BASE_REF = process.env.CONSENT_BASE_REF || '30536752b481699871e8d82ea34a49a439374a8e'; // dominusos origin/main before this change
const BASE = execFileSync('git', ['show', `${BASE_REF}:${GATE_PATH}`], { cwd: ROOT, encoding: 'utf8' });
const OUT = process.env.CONSENT_OUT || '';
const SITE = 'https://region-unit.test'; // https: the __Host- cookie needs a secure origin
const KEY = 'ru-consent';
// The edge's region value carries the time it was set (review round 3): "<ask|default>.<epoch seconds>".
const SEC = (offset = 0) => Math.floor(Date.now() / 1000) + offset;
const FRESH = (offset = 0) => `default.${SEC(offset)}`;

let failures = 0; const results = [];
function ok(cond, label, detail) { results.push({ ok: !!cond, label, detail }); if (cond) console.log(`  ok   ${label}`); else { failures += 1; console.error(`  FAIL ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); } }

const html = (config) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ru</title>
<script>window.CONSENT_CONFIG=${JSON.stringify({ storageKey: KEY, privatePaths: '^/(chat)(/|$)', ...config })};</script>
<script src="/consent/consent.js"></script></head><body><main><h1>ru</h1></main>
<footer><a href="/privacy#analytics-choice" data-consent-open>Your privacy choices</a></footer></body></html>`;

async function run(browser, { cookies = [], gate = GATE, config = {}, gpcSignal = false, seedStorage = null, before = null, failSetItem = false, pinNowMs = null } = {}) {
  const context = await browser.newContext();
  // A fixed clock for the window boundaries (the gate reads Date.now() once at start), so +3 s is exactly +3 s.
  if (pinNowMs !== null) await context.addInitScript((t) => { Date.now = () => t; }, pinNowMs);
  if (gpcSignal) await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true }); });
  if (seedStorage) await context.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [KEY, seedStorage]);
  // A same-named second value as document.cookie would show it (the nameless-cookie shape some browsers once allowed).
  if (before) await context.addInitScript((v) => { const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie'); Object.defineProperty(document, 'cookie', { configurable: true, get() { const c = desc.get.call(document); return c ? c + '; ' + v : v; }, set(x) { desc.set.call(document, x); } }); }, before);
  if (failSetItem) await context.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); }; });
  if (cookies.length) await context.addCookies(cookies.map((c) => ({ domain: 'region-unit.test', path: '/', secure: true, ...c })));
  const stray = [];
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin === SITE && u.pathname.startsWith('/p')) return route.fulfill({ status: 200, contentType: 'text/html', body: html(config) });
    if (u.origin === SITE && u.pathname === '/consent/consent.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: gate });
    stray.push(u.href); return route.abort();
  });
  const p = await context.newPage();
  await p.goto(`${SITE}/p/x`); await p.waitForTimeout(150);
  const r = await p.evaluate(() => ({
    state: window.SiteConsent.state(), allowed: window.SiteConsent.allowed(),
    region: window.SiteConsent.region ? window.SiteConsent.region() : 'no-region-api',
    bar: document.querySelector('[data-consent-bar]') ? document.querySelector('[data-consent-bar]').outerHTML : null,
    open: window.SiteConsent.openChoices ? window.SiteConsent.openChoices() : 'no-open-api',
    jar: document.cookie, local: (() => { try { return localStorage.getItem('ru-consent'); } catch (e) { return 'blocked'; } })(),
  }));
  await context.close();
  return { ...r, stray };
}

// Calls SiteConsent.set('reject') on a page with a stored accept, then reads the result without reloading (the reload a
// withdrawal does is suppressed so the state on this page can be read).
async function runSet(browser, { cookies = [], seedStorage = null, failSetItem = false } = {}) {
  const context = await browser.newContext();
  if (seedStorage) await context.addInitScript(([k, v]) => { if (!sessionStorage.getItem('s')) { localStorage.setItem(k, v); sessionStorage.setItem('s', '1'); } }, [KEY, seedStorage]);
  if (cookies.length) await context.addCookies(cookies.map((c) => ({ domain: 'region-unit.test', path: '/', secure: true, ...c })));
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin === SITE && u.pathname.startsWith('/p')) return route.fulfill({ status: 200, contentType: 'text/html', body: html({}) });
    if (u.origin === SITE && u.pathname === '/consent/consent.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: GATE });
    return route.abort();
  });
  const p = await context.newPage();
  await p.goto(`${SITE}/p/x`); await p.waitForTimeout(150);
  if (failSetItem) await p.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await Promise.all([p.waitForEvent('load', { timeout: 5000 }).catch(() => {}), p.evaluate(() => window.SiteConsent.set('reject'))]);
  await p.waitForTimeout(300);
  const r = await p.evaluate((k) => ({ state: window.SiteConsent.state(), local: localStorage.getItem(k) }), KEY);
  await context.close();
  return r;
}

async function main() {
  // R1
  const ask = ASK_FIRST_COUNTRIES.filter((c) => consentRegion(c) !== 'ask');
  ok(ask.length === 0 && ASK_FIRST_COUNTRIES.length === 43, `R1 all ${ASK_FIRST_COUNTRIES.length} ask-first codes are ask (${ask.join(',') || 'all'})`);
  const eu27 = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');
  ok(eu27.length === 27 && eu27.every((c) => ASK_FIRST_COUNTRIES.includes(c)) && ['IS', 'LI', 'NO', 'GB', 'CH'].every((c) => ASK_FIRST_COUNTRIES.includes(c)), 'R1 the ruled set is present: EU 27 + IS, LI, NO + GB + CH');
  for (const c of ['US', 'CA', 'MX', 'BR', 'JP', 'AU', 'IN', 'us', ' US ']) ok(consentRegion(c) === 'default', `R1 ${JSON.stringify(c)} is default`);
  for (const c of [undefined, null, '', ' ', 'XX', 'ZZ', 'T1', 'A1', 'A2', 'O1', 'AP', 'EU', 'USA', 'U', '1A', 'U$', 'de', 'gb']) ok(consentRegion(c) === 'ask', `R1 ${JSON.stringify(c)} is ask`);
  // R1b
  ok(ISO_3166_1.length === 249 && new Set(ISO_3166_1).size === 249 && ASK_FIRST_COUNTRIES.every((c) => ISO_3166_1.includes(c)), `R1b the known set is the 249 assigned ISO 3166-1 codes and contains all ${ASK_FIRST_COUNTRIES.length} ask-first codes`);
  for (const c of ['QQ', 'QZ', 'AA', 'XK', 'UK', 'AN', 'YU', 'SU', 'FX', 'QO', 'XA']) ok(consentRegion(c) === 'ask', `R1b unassigned/reserved/user-assigned ${c} is ask`);
  { const def = ISO_3166_1.filter((c) => !ASK_FIRST_COUNTRIES.includes(c)); const notDefault = def.filter((c) => consentRegion(c) !== 'default');
    ok(def.length === 206 && notDefault.length === 0, `R1b all ${def.length} other assigned codes are default (${notDefault.join(',') || 'all'})`); }

  const browser = await chromium.launch();
  try {
    // R2
    const cases = [
      ['no region cookie', [], 'ask'],
      ['fresh default.<now>', [{ name: '__Host-consent_region', value: FRESH() }], 'default'],
      ['untimed "default" (the r4-r6 format)', [{ name: '__Host-consent_region', value: 'default' }], 'ask'],
      ['default.<13 digits>', [{ name: '__Host-consent_region', value: `default.${SEC()}000` }], 'ask'],
      ['default.<now>.x (extra field)', [{ name: '__Host-consent_region', value: `${FRESH()}.x` }], 'ask'],
      ['ask.<now>', [{ name: '__Host-consent_region', value: `ask.${SEC()}` }], 'ask'],
      ['consent_region=DEFAULT', [{ name: '__Host-consent_region', value: 'DEFAULT' }], 'ask'],
      ['consent_region=US (a country, not a region)', [{ name: '__Host-consent_region', value: 'US' }], 'ask'],
      ['malformed %', [{ name: '__Host-consent_region', value: '%' }], 'ask'],
      // A __Host- cookie must have Path=/, so a path-scoped duplicate cannot exist; duplicates are exercised through a
      // second same-named cookie set by the page itself (the nameless-cookie shape) in R2c below.
      ['plain consent_region=default only (the old, plantable name)', [{ name: 'consent_region', value: 'default' }], 'ask'],
    ];
    for (const [name, cookies, want] of cases) {
      const r = await run(browser, { cookies, config: { autoBar: true, regionalDefault: true } });
      const good = want === 'default'
        ? r.state === 'default' && r.allowed === true && r.region === 'default' && r.bar === null
        : r.state === null && r.allowed === false && r.region === 'ask' && r.bar !== null;
      ok(good && r.stray.length === 0, `R2 ${name}: ${want === 'default' ? 'default-on, no bar' : 'ask-first, bar shown, allowed false'}`, { state: r.state, allowed: r.allowed, region: r.region, bar: r.bar !== null, stray: r.stray });
    }
    // R2w (Mark 2026-10-15; round-4 R4-2): at most 10 s old, at most 2 s ahead of the client clock. The browser clock is
    // pinned to an exact second T at gate start; each value is "default.<T/1000 + offset>".
    { const T = SEC() * 1000;
      for (const [label, offset, want] of [
        ['exactly now', 0, 'default'], ['8 s old', -8, 'default'], ['10 s old (boundary)', -10, 'default'],
        ['11 s old', -11, 'ask'], ['25 s old (was inside the r7 30 s window)', -25, 'ask'], ['120 s old', -120, 'ask'],
        ['+1 s ahead', 1, 'default'], ['+2 s ahead (boundary)', 2, 'default'], ['+3 s ahead', 3, 'ask'], ['+10 s ahead', 10, 'ask'], ['+120 s ahead', 120, 'ask'],
      ]) {
        const r = await run(browser, { cookies: [{ name: '__Host-consent_region', value: `default.${T / 1000 + offset}` }], config: { autoBar: true, regionalDefault: true }, pinNowMs: T });
        const good = want === 'default' ? r.state === 'default' && r.allowed === true && r.bar === null : r.state === null && r.allowed === false && r.bar !== null;
        ok(good, `R2w default.<T${offset >= 0 ? '+' : ''}${offset}> (${label}): ${want}`, { state: r.state, allowed: r.allowed, bar: r.bar !== null });
      }
    }
    // R2b: no regionalDefault in the config (a sibling site without the edge step): ask-first with a valid default cookie.
    for (const config of [{}, { regionalDefault: 'true' }, { regionalDefault: 1 }]) {
      const r = await run(browser, { cookies: [{ name: '__Host-consent_region', value: FRESH() }, { name: 'consent_region', value: FRESH() }], config: { autoBar: true, ...config } });
      ok(r.state === null && r.allowed === false && r.region === 'ask' && r.bar !== null, `R2b config ${JSON.stringify(config)} with __Host-consent_region=default: ask-first, bar shown`, { state: r.state, allowed: r.allowed, region: r.region });
    }
    // R2c: two visible __Host-consent_region values that disagree (the host's real "ask" plus a nameless planted value).
    { const r = await run(browser, { cookies: [{ name: '__Host-consent_region', value: `ask.${SEC()}` }], config: { autoBar: true, regionalDefault: true }, before: `__Host-consent_region=${FRESH()}` });
      ok(r.state === null && r.allowed === false && r.region === 'ask', 'R2c a disagreeing duplicate (planted default beside the real ask) is ask-first', r); }
    // R3
    const def = [{ name: '__Host-consent_region', value: FRESH() }];
    { const r = await run(browser, { cookies: [...def, { name: KEY, value: `1.reject.${Date.now()}` }], config: { regionalDefault: true } });
      ok(r.state === 'reject' && r.allowed === false, 'R3 default-on + stored reject (cookie): stays reject', r); }
    { const r = await run(browser, { cookies: def, seedStorage: `1.reject.${Date.now()}`, config: { regionalDefault: true } });
      ok(r.state === 'reject' && r.allowed === false, 'R3 default-on + stored reject (local storage): stays reject', r); }
    { const r = await run(browser, { cookies: [...def, { name: 'consent_gpc', value: '1' }], config: { regionalDefault: true } });
      ok(r.state === 'gpc' && r.allowed === false && r.open === false, 'R3 default-on + consent_gpc=1: gpc, allowed false, openChoices() false', r); }
    { const r = await run(browser, { cookies: def, gpcSignal: true, config: { regionalDefault: true } });
      ok(r.state === 'gpc' && r.allowed === false && r.open === false, 'R3 default-on + navigator.globalPrivacyControl: gpc, allowed false, openChoices() false', r); }
    { const r = await run(browser, { cookies: [...def, { name: KEY, value: `1.accept.${Date.now() - 181 * 864e5}` }], config: { regionalDefault: true } });
      ok(r.state === 'default' && r.allowed === true, 'R3 default-on + an expired stored accept: back to default (an expired choice is no choice)', r); }
    // R5 (review F3): the stores reconcile by the time saved in each. Ask-first region (no flag), so 'accept' means a choice.
    { const now = Date.now();
      for (const [name, cookie, local, want] of [
        ['newer cookie reject + older local accept', `1.reject.${now}`, `1.accept.${now - 60000}`, 'reject'],
        ['newer local reject + older cookie accept', `1.accept.${now - 60000}`, `1.reject.${now}`, 'reject'],
        ['older local reject + newer cookie accept (the cookie is plantable)', `1.accept.${now}`, `1.reject.${now - 60000}`, 'reject'],
        ['equal times, local accept + cookie reject', `1.reject.${now}`, `1.accept.${now}`, 'reject'],
        ['newer local accept + older cookie reject (explicit later re-acceptance)', `1.reject.${now - 60000}`, `1.accept.${now}`, 'accept'],
        ['both accept', `1.accept.${now - 60000}`, `1.accept.${now}`, 'accept'],
        ['cookie reject only', `1.reject.${now}`, null, 'reject'],
        ['local reject only', null, `1.reject.${now}`, 'reject'],
        ['ambiguous cookies (reject + garbage) + older local accept', [`1.reject.${now}`, '1.accept.x'], `1.accept.${now - 60000}`, 'reject'],
      ]) {
        const cookies = (Array.isArray(cookie) ? cookie : cookie ? [cookie] : []).map((v, i) => ({ name: KEY, value: v, path: i ? '/p' : '/' }));
        const r = await run(browser, { cookies, seedStorage: local, config: { autoBar: true } });
        ok(r.state === want && r.allowed === (want === 'accept'), `R5 ${name}: ${want}`, { state: r.state, allowed: r.allowed });
      }
      // A reject whose local-storage write throws leaves no older accept behind.
      { const r = await runSet(browser, { seedStorage: `1.accept.${now - 60000}`, cookies: [{ name: KEY, value: `1.accept.${now - 60000}` }], failSetItem: true });
        ok(r.state === 'reject' && !/accept/.test(r.local || ''), 'R5 reject with a failing local-storage write: state reject, no stale accept in local storage', r); }
    }
    // R2d (round 3): the region is read once per page load. A page opened with a fresh default stays default-on and
    // allowed after the window has passed (the request guard must not stop it mid-page).
    { const context = await browser.newContext();
      await context.addCookies([{ name: '__Host-consent_region', value: FRESH(), domain: 'region-unit.test', path: '/', secure: true }]);
      await context.route('**/*', (route) => {
        const u = new URL(route.request().url());
        if (u.origin === SITE && u.pathname.startsWith('/p')) return route.fulfill({ status: 200, contentType: 'text/html', body: html({ regionalDefault: true }) });
        if (u.origin === SITE && u.pathname === '/consent/consent.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: GATE });
        return route.abort();
      });
      const p = await context.newPage(); await p.goto(`${SITE}/p/x`); await p.waitForTimeout(150);
      const first = await p.evaluate(() => ({ state: window.SiteConsent.state(), allowed: window.SiteConsent.allowed() }));
      await p.waitForTimeout(11500);
      const later = await p.evaluate(() => ({ state: window.SiteConsent.state(), allowed: window.SiteConsent.allowed(), region: window.SiteConsent.region() }));
      await p.goto(`${SITE}/p/y`); await p.waitForTimeout(150); // a full load with the same (now old) value and no edge
      const reload = await p.evaluate(() => ({ state: window.SiteConsent.state(), allowed: window.SiteConsent.allowed() }));
      ok(first.state === 'default' && later.state === 'default' && later.allowed === true && later.region === 'default', 'R2d decided once per page: still default-on and allowed 11.5 s after load (window 10 s)', { first, later });
      ok(reload.state === null && reload.allowed === false, 'R2d a new full page load with that 11.5 s-old value and no edge refresh asks first', reload);
      await context.close(); }
    // R6 (2026-10-14): the host-only choice cookie and the legacy cookie. Ask-first region (no flag).
    { const now = Date.now(); const H = `__Host-${KEY}`;
      const jarHas = (jar, name, re) => jar.split('; ').some((c) => c.startsWith(name + '=') && re.test(decodeURIComponent(c.slice(name.length + 1))));
      { const r = await run(browser, { cookies: [{ name: H, value: `1.accept.${now}` }], config: { autoBar: true } });
        ok(r.state === 'accept' && r.allowed === true && r.bar === null, 'R6 host cookie Allow alone: accept (this host set it)', r); }
      { const r = await run(browser, { cookies: [{ name: KEY, value: `1.accept.${now}` }], config: { autoBar: true } });
        ok(r.state === null && r.allowed === false && r.bar !== null && !jarHas(r.jar, KEY, /./) && !jarHas(r.jar, H, /./), 'R6 legacy Allow alone: not trusted, asked again, legacy cookie removed, nothing carried', r); }
      { const r = await run(browser, { cookies: [{ name: KEY, value: `1.reject.${now - 5000}` }], config: { autoBar: true } });
        ok(r.state === 'reject' && r.allowed === false && r.bar === null && jarHas(r.jar, H, new RegExp(`^1\\.reject\\.${now - 5000}$`)) && !jarHas(r.jar, KEY, /./), 'R6 legacy reject: kept, migrated into the host cookie with its time, legacy removed', r); }
      { const r = await run(browser, { cookies: [{ name: KEY, value: `1.accept.${now - 5000}` }], seedStorage: `1.accept.${now - 5000}`, config: { autoBar: true } });
        ok(r.state === 'accept' && jarHas(r.jar, H, new RegExp(`^1\\.accept\\.${now - 5000}$`)) && !jarHas(r.jar, KEY, /./), 'R6 legacy Allow with the same visitor\'s local-storage Allow: carried over from local storage, legacy removed', r); }
      { const r = await run(browser, { cookies: [{ name: H, value: `1.accept.${now - 60000}` }, { name: KEY, value: `1.reject.${now}`, path: '/p' }], config: { autoBar: true } });
        ok(r.state === 'reject' && r.allowed === false, 'R6 host Allow + newer legacy reject: reject (a planted No is honoured, fail closed)', r); }
      { const r = await run(browser, { cookies: [{ name: H, value: `1.accept.${now}` }, { name: KEY, value: `1.accept.${now}`, path: '/p' }], config: { autoBar: true } });
        ok(r.state === 'accept', 'R6 host Allow + legacy Allow: accept (from the host cookie)', r); }
      { const r = await run(browser, { cookies: [{ name: H, value: `1.accept.${now}` }], gpcSignal: true, config: { autoBar: true } });
        ok(r.state === 'gpc' && r.allowed === false, 'R6 host Allow + GPC: gpc wins', r); }
    }
    // R6b (review R2-2): a legacy No newer than an existing host Allow is reconciled BEFORE anything is removed: the
    // winner goes into the host cookie, then the legacy cookies go. Root host-only, Domain-scoped and path-scoped.
    { const now = Date.now(); const H = `__Host-${KEY}`;
      const hostVal = (jar) => { const m = jar.split('; ').find((c) => c.startsWith(H + '=')); return m ? decodeURIComponent(m.slice(H.length + 1)) : null; };
      const legacyLeft = (jar) => jar.split('; ').some((c) => c.startsWith(KEY + '='));
      for (const [name, legacy, tLeg, tHost, want] of [
        ['root host-only legacy No newer than host Allow', { path: '/' }, now - 5000, now - 65000, 'reject'],
        ['Domain-scoped legacy No newer than host Allow', { domain: '.region-unit.test', path: '/' }, now - 5000, now - 65000, 'reject'],
        ['path-scoped legacy No newer than host Allow', { path: '/p' }, now - 5000, now - 65000, 'reject'],
        ['root legacy No and host Allow at the same time (tie)', { path: '/' }, now - 5000, now - 5000, 'reject'],
        ['root legacy No older than host Allow (later re-acceptance stands)', { path: '/' }, now - 65000, now - 5000, 'accept'],
      ]) {
        const cookies = [{ name: H, value: `1.accept.${tHost}` }, { name: KEY, value: `1.reject.${tLeg}`, ...legacy }];
        if (legacy.domain) delete cookies[1].domain, cookies[1].domain = legacy.domain;
        const r = await run(browser, { cookies, config: { autoBar: true } });
        const hv = hostVal(r.jar);
        const wantHost = want === 'reject' ? `1.reject.${tLeg}` : `1.accept.${tHost}`;
        ok(r.state === want && r.allowed === (want === 'accept') && hv === wantHost && !legacyLeft(r.jar), `R6b ${name}: ${want}; host cookie now ${wantHost}; legacy removed`, { state: r.state, host: hv, jar: r.jar });
      }
      // Explicit later re-acceptance after a migrated No: Allow now, then a fresh page load keeps it.
      { const context = await browser.newContext();
        await context.addCookies([{ name: H, value: `1.accept.${now - 65000}`, domain: 'region-unit.test', path: '/', secure: true }, { name: KEY, value: `1.reject.${now - 5000}`, domain: 'region-unit.test', path: '/', secure: true }]);
        await context.route('**/*', (route) => {
          const u = new URL(route.request().url());
          if (u.origin === SITE && u.pathname.startsWith('/p')) return route.fulfill({ status: 200, contentType: 'text/html', body: html({}) });
          if (u.origin === SITE && u.pathname === '/consent/consent.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: GATE });
          return route.abort();
        });
        const p = await context.newPage(); await p.goto(`${SITE}/p/x`); await p.waitForTimeout(150);
        const first = await p.evaluate(() => window.SiteConsent.state());
        await p.evaluate(() => window.SiteConsent.set('accept')); await p.waitForTimeout(100);
        await p.evaluate(() => localStorage.clear());
        await p.goto(`${SITE}/p/y`); await p.waitForTimeout(150);
        const after = await p.evaluate(() => ({ state: window.SiteConsent.state(), jar: document.cookie }));
        ok(first === 'reject' && after.state === 'accept' && !legacyLeft(after.jar) && /^1\.accept\.\d+$/.test(hostVal(after.jar) || ''), 'R6b after a migrated No, an explicit Allow stands across a reload (host cookie only, local storage cleared)', { first, after });
        await context.close(); }
    }
    // R4
    for (const [name, cookies] of [['no region cookie', []], ['ask.<now>', [{ name: '__Host-consent_region', value: `ask.${SEC()}` }]]]) {
      for (const config of [{ linkedin: '10038764', privacyHref: '/privacy' }, {}]) {
        const cand = (await run(browser, { cookies, config: { ...config, autoBar: true } })).bar;
        const base = (await run(browser, { cookies, gate: BASE, config: { ...config, autoBar: true } })).bar;
        ok(cand !== null && cand === base, `R4 ${name}, ${config.linkedin ? 'LinkedIn on' : 'defaults'}: the ask-first bar is byte-identical to ${BASE_REF}`, cand === base ? undefined : { cand, base });
      }
    }
  } finally { await browser.close(); }
  console.log(`region-unit: ${results.length - failures} of ${results.length} checks passed`);
  if (OUT) writeFileSync(OUT, JSON.stringify({ gate: process.env.CONSENT_GATE_FILE || GATE_PATH, base_ref: BASE_REF, measured_at: new Date().toISOString(), failures, results }, null, 2) + '\n');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('  FAIL harness error:', e && e.stack || e); process.exit(2); });
