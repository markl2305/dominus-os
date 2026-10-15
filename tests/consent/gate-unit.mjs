/**
 * Consent gate v2 unit checks, offline (compliance goal, 2026-10-12). No server and no network: a browser route serves
 * a page, consent/consent.js (CONSENT_GATE_PATH), the cached REAL Vercel Web Analytics loader (tests/consent/fixtures) and a second
 * origin to arrive from. Every other request is aborted and fails the run.
 *
 *   node tests/consent/gate-unit.mjs                                  # the candidate gate
 *   CONSENT_GATE_FILE=/path/to/old/consent.js node tests/consent/gate-unit.mjs   # RED: an older gate
 *
 * V1  the incoming referrer's query never reaches Vercel's collection body (`r`), arriving by a real link from a
 *     page served with Referrer-Policy: unsafe-url; clicked Accept and stored Accept.
 * V2  a stored choice older than 180 days is no choice, in local storage AND in the cookie; 179 days still counts.
 * V3  barText / acceptLabel / rejectLabel render through config; the defaults render the bar byte-identical to the
 *     v1 gate (CONSENT_BASE_REF, default 7639942, dominusos's own pre-v2-adoption commit).
 * W   withdrawing stops every vendor request from the first press on the withdraw control (mouse and keyboard),
 *     with the real cached LinkedIn tag, which otherwise reports that very click.
 * F1  one answer (anvil gate-v2 R1): when the referrer cannot be narrowed, allowed() is false, nothing runs, analytics
 *     mounted outside the gate cannot send, and withdrawing still reloads; GPC and no-choice refuse vendor fetches.
 * Also: VERSION is unchanged and a choice saved by the v1 gate is honoured by this one (nobody is asked again).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ROOT = new URL('../../', import.meta.url);
const GATE = readFileSync(process.env.CONSENT_GATE_FILE || new URL(process.env.CONSENT_GATE_PATH || 'consent/consent.js', ROOT), 'utf8');
const BASE_REF = process.env.CONSENT_BASE_REF || '7639942d9f54298e668a3321d6a564b6e778b0ca'; // dominusos's own pre-v2-adoption commit (consent.js there is byte-identical to hiresabina's d0c2a21)
const BASE = execFileSync('git', ['show', `${BASE_REF}:${process.env.CONSENT_GATE_PATH || 'consent/consent.js'}`], { cwd: ROOT, encoding: 'utf8' });
const VERCEL = readFileSync(new URL('./fixtures/vercel-insights-script.js', import.meta.url), 'utf8');
const LI = Object.fromEntries(['insight.min.js', 'insight.beta.min.js', 'insight.old.min.js'].map((f) => [`https://snap.licdn.com/li.lms-analytics/${f}`, readFileSync(new URL(`./fixtures/linkedin-${f}`, import.meta.url), 'utf8')]));
const OUT = process.env.CONSENT_OUT || '';
const SITE = 'https://gate-unit.test'; // https: the choice cookie is the Secure __Host- one (consent.js rule 5)
const REF = 'http://gate-unit-ref.test';
const KEY = 'unit-consent';
const DAY = 864e5;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

let failures = 0; const results = [];
function ok(cond, label, detail) { results.push({ ok: !!cond, label, detail }); if (cond) console.log(`  ok   ${label}`); else { failures += 1; console.error(`  FAIL ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); } }

const page = (config) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>unit</title>
<script>window.CONSENT_CONFIG=${JSON.stringify({ storageKey: KEY, ...config })};</script>
<script src="/consent/consent.js"></script></head><body><main><h1>unit</h1>
<p><button type="button" data-consent-withdraw onclick="window.SiteConsent.set('reject')">Withdraw: no analytics</button></p></main></body></html>`;

async function fresh(browser, { config = { vercel: true }, gate = GATE, seedStorage = null, seedCookie = null } = {}) {
  const context = await browser.newContext({ userAgent: UA, serviceWorkers: 'block' });
  await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }); });
  if (seedStorage) await context.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, seedStorage]);
  if (seedCookie) await context.addCookies([{ name: `__Host-${KEY}`, value: seedCookie, url: SITE, secure: true }]); // this host's own choice cookie
  const rec = { views: [], vendor: [], stray: [], navReferer: '', target: '/p', phase: 'before' };
  await context.route('**/*', async (route) => {
    const q = route.request(); const u = new URL(q.url());
    if (u.origin === REF) return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'referrer-policy': 'unsafe-url' }, body: `<a id="go" href="${SITE}${rec.target}">go</a>` });
    if (u.origin === SITE) {
      if (u.pathname === '/p') { if (q.isNavigationRequest()) rec.navReferer = (await q.allHeaders()).referer || ''; return route.fulfill({ status: 200, contentType: 'text/html', body: page(config) }); }
      if (u.pathname === '/consent/consent.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: gate });
      if (u.pathname === '/_vercel/insights/script.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: VERCEL });
      if (u.pathname.startsWith('/_vercel/insights/')) { rec.views.push({ path: u.pathname, body: q.postData() || '' }); return route.fulfill({ status: 204, body: '' }); }
    }
    if (LI[q.url()]) return route.fulfill({ status: 200, contentType: 'text/javascript', body: LI[q.url()] });
    if (/(^|\.)linkedin\.com$/.test(u.hostname)) { rec.vendor.push({ phase: rec.phase, url: q.url() }); return route.fulfill({ status: 204, body: '' }); }
    rec.stray.push(q.url());
    return route.abort();
  });
  const p = await context.newPage();
  return { context, page: p, rec };
}
const state = (p) => p.evaluate(() => (window.SiteConsent ? window.SiteConsent.state() : 'no-gate'));
const barHtml = (p) => p.evaluate(() => { const b = document.querySelector('[data-consent-bar]'); return b ? b.outerHTML : null; });

async function main() {
  const browser = await chromium.launch();
  try {
    // V1 — arrive by a real link carrying a query-bearing referrer, then Accept (clicked, or already stored).
    for (const [name, opts] of [['clicked accept', {}], ['stored accept', { seedStorage: `1.accept.${Date.now()}` }]]) {
      for (const [rname, src] of [['query referrer', '/source?ref-secret=1&utm_source=zq'], ['origin-only referrer', '/']]) {
        const { context, page: p, rec } = await fresh(browser, opts);
        rec.target = '/p?page-secret=1#frag-secret';
        await p.goto(`${REF}${src}`);
        await Promise.all([p.waitForURL(`${SITE}/**`), p.locator('#go').click()]);
        await p.waitForLoadState('load');
        if (!opts.seedStorage) { await p.locator('[data-consent="accept"]').click(); }
        await p.waitForTimeout(1500);
        const bodies = rec.views.filter((v) => v.path === '/_vercel/insights/view').map((v) => JSON.parse(v.body));
        const want = REF + src.split('?')[0];
        const domRef = await p.evaluate(() => document.referrer);
        ok(rec.navReferer === REF + src, `V1 ${name}, ${rname}: control fires, the browser sent Referer ${rec.navReferer}`);
        ok(bodies.length === 1, `V1 ${name}, ${rname}: the real Vercel loader posted one page view`, bodies.length);
        ok(bodies.length > 0 && bodies.every((b) => b.r === want && !/secret|utm_/.test(JSON.stringify(b))), `V1 ${name}, ${rname}: Vercel r is ${want} and nothing secret is in the body`, bodies);
        ok(bodies.every((b) => b.o === `${SITE}/p`), `V1 ${name}, ${rname}: Vercel o is the page without query or fragment`, bodies.map((b) => b.o));
        ok(domRef === want, `V1 ${name}, ${rname}: document.referrer seen by every loader is ${want}`, domRef);
        ok(rec.stray.length === 0, `V1 ${name}, ${rname}: no other request left the page`, rec.stray);
        await context.close();
      }
    }
    // V1 control: with no choice nothing is narrowed and nothing is sent (the gate does not touch the page before Accept).
    { const { context, page: p, rec } = await fresh(browser);
      rec.target = '/p';
      await p.goto(`${REF}/source?ref-secret=1`);
      await Promise.all([p.waitForURL(`${SITE}/**`), p.locator('#go').click()]);
      await p.waitForTimeout(1200);
      ok(rec.views.length === 0 && (await p.evaluate(() => document.referrer)) === `${REF}/source?ref-secret=1`, 'V1 no choice: nothing posted, document.referrer untouched');
      await context.close(); }

    // W — withdraw with the real LinkedIn tag running: nothing to a vendor from the press onward, mouse or keyboard.
    for (const how of ['mouse', 'keyboard']) {
      const { context, page: p, rec } = await fresh(browser, { config: { linkedin: '10038764', vercel: true }, seedStorage: `1.accept.${Date.now()}` });
      await p.goto(`${SITE}/p`); await p.waitForTimeout(2500);
      const before = rec.vendor.length + rec.views.length;
      rec.phase = 'press';
      const btn = p.locator('[data-consent-withdraw]');
      await Promise.all([p.waitForEvent('load', { timeout: 8000 }).catch(() => {}), how === 'mouse' ? btn.click() : btn.focus().then(() => p.keyboard.press('Enter'))]);
      await p.waitForTimeout(2000);
      const after = rec.vendor.filter((v) => v.phase === 'press').map((v) => v.url.slice(0, 80));
      const s = await state(p);
      ok(before > 0 && rec.vendor.some((v) => v.phase === 'before'), `W ${how}: control fires, LinkedIn and Vercel sent before the press (${before})`);
      ok(after.length === 0 && s === 'reject', `W ${how}: zero vendor requests from the press through the reload, state ${s}`, after);
      await context.close();
    }

    // F1 (anvil gate-v2 R1) — one answer. The browser refuses the referrer narrowing (the property is made
    // non-configurable before the gate runs): with a stored Accept, allowed() is false, no loader runs, an analytics
    // script mounted outside the gate sends nothing, and withdrawing still reloads.
    { const { context, page: p, rec } = await fresh(browser, { config: { linkedin: '10038764', vercel: true }, seedStorage: `1.accept.${Date.now()}` });
      await context.addInitScript((site) => { if (location.origin === site) Object.defineProperty(document, 'referrer', { value: document.referrer, configurable: false }); }, SITE);
      rec.target = '/p';
      await p.goto(`${REF}/source?ref-secret=1`);
      await Promise.all([p.waitForURL(`${SITE}/**`), p.locator('#go').click()]);
      await p.waitForLoadState('load'); await p.waitForTimeout(1500);
      const dom = await p.evaluate(() => ({ state: SiteConsent.state(), allowed: SiteConsent.allowed(), ref: document.referrer }));
      ok(dom.ref.includes('ref-secret') && dom.state === 'accept' && dom.allowed === false, 'F1 refused narrowing: control fires (referrer locked), state accept, allowed() false', dom);
      ok(rec.views.length === 0 && rec.vendor.length === 0, 'F1 refused narrowing: nothing loaded, nothing sent', { views: rec.views, vendor: rec.vendor });
      await p.evaluate(() => {
        window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
        const sc = document.createElement('script'); sc.src = '/_vercel/insights/script.js'; document.head.appendChild(sc);
      });
      await p.waitForTimeout(1200);
      await p.evaluate(() => { window.va('event', { name: 'external' }); navigator.sendBeacon('https://px.ads.linkedin.com/collect?probe=1', 'x'); new Image().src = 'https://px.ads.linkedin.com/collect?probe=img'; });
      await p.waitForTimeout(1200);
      ok(rec.views.length === 0 && rec.vendor.length === 0, 'F1 refused narrowing: an analytics script mounted outside the gate and direct pings send nothing', { views: rec.views, vendor: rec.vendor });
      const btn = p.locator('[data-consent-withdraw]');
      const reloaded = await Promise.all([p.waitForEvent('load', { timeout: 8000 }).then(() => true).catch(() => false), btn.click()]).then((r) => r[0]);
      await p.waitForTimeout(800);
      await p.evaluate(() => { try { window.va && window.va('event', { name: 'after-withdraw' }); } catch (e) { /* none */ } });
      await p.waitForTimeout(1000);
      ok(reloaded && (await state(p)) === 'reject' && rec.views.length === 0 && rec.vendor.length === 0, 'F1 refused narrowing: withdrawing reloads although the gate loaded nothing; va(event) afterwards sends nothing', { reloaded, views: rec.views });
      await context.close(); }
    // F1 — the guard is the same answer in the other "no" states: no choice, and Global Privacy Control with a
    // stored Accept. A direct vendor fetch is refused in the page; first-party requests pass.
    for (const [name, opts, gpc] of [['no choice', {}, false], ['GPC over a stored accept', { seedStorage: `1.accept.${Date.now()}` }, true]]) {
      const { context, page: p, rec } = await fresh(browser, opts);
      if (gpc) await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true }); });
      await p.goto(`${SITE}/p`); await p.waitForTimeout(800);
      const r = await p.evaluate(async () => {
        const v = await fetch('https://px.ads.linkedin.com/collect?probe=1').then(() => 'sent', (e) => 'refused: ' + e.message);
        const own = await fetch('/p').then((x) => x.status, () => 'refused');
        return { v, own, allowed: SiteConsent.allowed() };
      });
      ok(r.v.startsWith('refused') && r.own === 200 && r.allowed === false && rec.vendor.length === 0, `F1 ${name}: allowed() false, a direct vendor fetch is refused, a first-party fetch passes`, r);
      await context.close();
    }
    // F1 — a first-choice "No analytics" is not a withdrawal: no reload, and an Allow on the same page then runs.
    { const { context, page: p, rec } = await fresh(browser);
      await p.goto(`${SITE}/p`); await p.waitForTimeout(500);
      const reloaded = await Promise.all([p.waitForEvent('load', { timeout: 2500 }).then(() => true).catch(() => false), p.locator('[data-consent="reject"]').click()]).then((x) => x[0]);
      await p.evaluate(() => SiteConsent.set('accept')); await p.waitForTimeout(1500);
      ok(!reloaded && (await state(p)) === 'accept' && rec.views.length === 1, 'F1 first-choice reject: no reload; a later Allow on the same page loads and posts one view', { reloaded, views: rec.views.length });
      await context.close(); }

    // V2 — expiry, each store alone, and the two stores disagreeing.
    const cases = [
      ['localStorage 179d accept', { seedStorage: `1.accept.${Date.now() - 179 * DAY}` }, 'accept'],
      ['localStorage 181d accept', { seedStorage: `1.accept.${Date.now() - 181 * DAY}` }, null],
      ['localStorage 181d reject', { seedStorage: `1.reject.${Date.now() - 181 * DAY}` }, null],
      ['cookie 179d accept', { seedCookie: `1.accept.${Date.now() - 179 * DAY}` }, 'accept'],
      ['cookie 181d accept', { seedCookie: `1.accept.${Date.now() - 181 * DAY}` }, null],
      ['cookie 181d reject', { seedCookie: `1.reject.${Date.now() - 181 * DAY}` }, null],
      ['localStorage 181d accept + cookie 10d reject', { seedStorage: `1.accept.${Date.now() - 181 * DAY}`, seedCookie: `1.reject.${Date.now() - 10 * DAY}` }, 'reject'],
      // One timestamp for both (two Date.now() calls could differ by a millisecond): a tie is a reject.
      ...(() => { const t = Date.now() - 10 * DAY; return [['localStorage 10d reject + cookie 10d accept (same time)', { seedStorage: `1.reject.${t}`, seedCookie: `1.accept.${t}` }, 'reject']]; })(),
      ['localStorage time 2 days in the future', { seedStorage: `1.accept.${Date.now() + 2 * DAY}` }, null],
      ['localStorage no time', { seedStorage: '1.accept' }, null],
    ];
    for (const [name, seed, want] of cases) {
      const { context, page: p, rec } = await fresh(browser, seed);
      await p.goto(`${SITE}/p`); await p.waitForTimeout(800);
      const s = await state(p); const bar = await barHtml(p);
      const loaded = rec.views.length > 0;
      ok(s === want && (want === null ? bar !== null && !loaded : bar === null) && (want === 'accept') === loaded,
        `V2 ${name}: state ${want}${want === null ? ', bar shown, nothing loaded' : ''}`, { state: s, bar: !!bar, loaded });
      await context.close();
    }
    // A fresh choice is saved with its time in both stores, and the cookie still expires in 180 days.
    { const { context, page: p } = await fresh(browser);
      await p.goto(`${SITE}/p`); await p.locator('[data-consent="reject"]').click();
      const local = await p.evaluate((k) => localStorage.getItem(k), KEY);
      const cookie = (await context.cookies()).find((c) => c.name === `__Host-${KEY}`);
      const t = Number(String(local).split('.')[2]);
      ok(/^1\.reject\.\d+$/.test(local) && Math.abs(Date.now() - t) < 60000, `V2 save: local storage holds ${local}`);
      ok(cookie && Math.abs(cookie.expires - (Date.now() / 1000 + 180 * 86400)) < 120 && decodeURIComponent(cookie.value) === local, `V2 save: the cookie matches and expires in 180 days (${cookie && cookie.expires})`);
      await context.close(); }

    // Compatibility: a choice the v1 gate saved is honoured by this gate, so VERSION does not need to change.
    { const { context, page: p } = await fresh(browser, { gate: BASE, config: {} });
      await p.goto(`${SITE}/p`); await p.locator('[data-consent="accept"]').click();
      const saved = await p.evaluate((k) => localStorage.getItem(k), KEY);
      await context.close();
      const { context: c2, page: p2 } = await fresh(browser, { seedStorage: saved, config: {} });
      await p2.goto(`${SITE}/p`); await p2.waitForTimeout(500);
      const s = await state(p2); const v = await p2.evaluate(() => window.SiteConsent.version);
      ok(s === 'accept' && v === 1, `compat: a v1-saved choice (${saved}) reads as accept; VERSION is ${v}`);
      await c2.close(); }

    // V3 — wording through config; the defaults byte-identical to v1.
    for (const [name, config] of [['hiresabina config (LinkedIn on)', { linkedin: '10038764', privacyHref: '/privacy' }], ['no LinkedIn, default privacy link', {}]]) {
      const { context, page: p } = await fresh(browser, { config: { ...config, autoBar: true } });
      await p.goto(`${SITE}/p`); const cand = await barHtml(p); await context.close();
      const { context: c2, page: p2 } = await fresh(browser, { gate: BASE, config: { ...config, autoBar: true } });
      await p2.goto(`${SITE}/p`); const base = await barHtml(p2); await c2.close();
      ok(cand !== null && cand === base, `V3 defaults, ${name}: the bar renders byte-identical to ${BASE_REF}`, cand === base ? undefined : { cand, base });
    }
    { const custom = { barText: 'We use Google Analytics, which also measures visits for Google Ads without cookies, only if you allow it.', acceptLabel: 'Allow analytics and Ads measurement', rejectLabel: 'No analytics or Ads' };
      const { context, page: p } = await fresh(browser, { config: custom });
      await p.goto(`${SITE}/p`);
      const r = await p.evaluate(() => { const b = document.querySelector('[data-consent-bar]'); return b && { text: b.querySelector('p').textContent, link: b.querySelector('p a') && b.querySelector('p a').getAttribute('href'), accept: b.querySelector('[data-consent="accept"]').textContent, reject: b.querySelector('[data-consent="reject"]').textContent }; });
      ok(r && r.text === custom.barText + ' Privacy notice' && r.link === '/privacy', 'V3 custom: barText renders, then the Privacy notice link', r);
      ok(r && r.accept === custom.acceptLabel && r.reject === custom.rejectLabel, 'V3 custom: accept and reject labels render', r);
      await p.locator('[data-consent="reject"]').click();
      ok((await state(p)) === 'reject', 'V3 custom: the relabelled reject button still records reject');
      await context.close(); }
  } finally { await browser.close(); }
  console.log(`gate-unit: ${results.length - failures} of ${results.length} checks passed`);
  if (OUT) writeFileSync(OUT, JSON.stringify({ gate: process.env.CONSENT_GATE_FILE || (process.env.CONSENT_GATE_PATH || 'consent/consent.js'), base_ref: BASE_REF, measured_at: new Date().toISOString(), failures, results }, null, 2) + '\n');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('  FAIL harness error:', e && e.stack || e); process.exit(2); });
