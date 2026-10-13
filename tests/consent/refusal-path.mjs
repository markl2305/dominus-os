/**
 * The gate's fail-closed path (anvil gate-v2 R1 F1; adopted from that review's independent.mjs and
 * locked-withdraw.mjs). Against a running build:
 *
 *   CONSENT_ORIGIN=http://127.0.0.1:4521 CONSENT_OUT=refusal.json node tests/consent/refusal-path.mjs
 *
 * A browser init script makes this document's real, query-bearing referrer NON-CONFIGURABLE before the gate runs,
 * so the gate cannot narrow it (a controlled refusal, not ordinary Chromium behaviour). The visitor arrives by a real
 * link from a page served with Referrer-Policy: unsafe-url, with a stored Accept. Then, for the React page (/privacy)
 * and the static, synchronously gated page (/evaluate-improved/index.html):
 *   R1  the gate reports the CHOICE (state 'accept') but its one answer, allowed(), is false;
 *   R2  zero vendor requests of any kind leave the page (no loader, no collection), React's <Analytics /> included;
 *   R3  an analytics script mounted OUTSIDE the gate (the real Vercel loader, injected by hand) and direct
 *       fetch / sendBeacon / XHR / image pings to vendor hosts all produce zero collection requests;
 *   R4  withdrawing reloads the page even though the gate itself loaded nothing, and a synthetic va('event', …)
 *       afterwards produces no request.
 * Control (no lock): the same arrival makes the real Vercel loader post a page view whose `r` is origin + path, so
 * the instrument fires; withdrawing from it reloads and a later va('event') sends nothing.
 * Every off-origin request is answered in the browser (vendor collection: empty 204, recorded; anything else:
 * aborted; a host not in CONSENT_ALLOWED_HOSTS fails the run). Loaders come from tests/consent/fixtures; nothing is fetched live. Exit 1 on failure.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { vendorHost, VERCEL_PATH } from './vendor-hosts.mjs';

const ORIGIN = new URL(process.env.CONSENT_ORIGIN || 'http://127.0.0.1:4521').origin;
const OUT = process.env.CONSENT_OUT || '';
const KEY = process.env.CONSENT_STORAGE_KEY || 'dos-consent';
const GA_ID = process.env.CONSENT_GA_ID || 'G-Z0BTF1J29X';
const REF = 'http://consent-refusal-ref.test';
const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const VERCEL = fx('vercel-insights-script.js');
const LOADERS = {
  'https://snap.licdn.com/li.lms-analytics/insight.min.js': fx('linkedin-insight.min.js'),
  'https://snap.licdn.com/li.lms-analytics/insight.beta.min.js': fx('linkedin-insight.beta.min.js'),
  'https://snap.licdn.com/li.lms-analytics/insight.old.min.js': fx('linkedin-insight.old.min.js'),
};
let GTAG = null; try { GTAG = fx(`gtag-js-${GA_ID}.js`); } catch (e) { /* no fixture: the GA loader is answered 204 */ }
// Off-origin hosts that are not analytics (same list and env as tracking-matrix.mjs): aborted, recorded, not unknown.
const ALLOWED_HOSTS = new Set((process.env.CONSENT_ALLOWED_HOSTS ?? 'locatefaith.com,fonts.googleapis.com,fonts.gstatic.com').split(',').filter(Boolean));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const TARGETS = (process.env.CONSENT_REFUSAL_TARGETS || 'static:/privacy').split(',').map((x) => x.split(':'));

const results = []; let failures = 0;
const ok = (c, label, detail) => { results.push({ ok: !!c, label, detail }); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${label}`); if (!c) failures += 1; };

async function setup(browser, { lock }) {
  const context = await browser.newContext({ serviceWorkers: 'block', userAgent: UA });
  await context.addInitScript(({ origin, lock, key }) => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    if (location.origin !== origin) return;
    try { if (!localStorage.getItem(key)) localStorage.setItem(key, '1.accept.' + Date.now()); } catch (e) { /* none */ }
    if (lock) Object.defineProperty(document, 'referrer', { value: document.referrer, configurable: false });
  }, { origin: ORIGIN, lock, key: KEY });
  const rec = { phase: 'arrival', vendor: [], unknown: [], navs: [] };
  await context.route('**/*', async (route) => {
    const q = route.request(); const u = new URL(q.url());
    if (u.origin === REF) {
      return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'referrer-policy': 'unsafe-url' }, body: `<a id="go" href="${ORIGIN}${rec.target}?pageSecret=1#fragSecret">Go</a>` });
    }
    const vercelPath = u.origin === ORIGIN && VERCEL_PATH.test(u.pathname);
    if (u.origin === ORIGIN && !vercelPath) {
      if (q.isNavigationRequest()) rec.navs.push({ phase: rec.phase, url: q.url(), referer: (await q.allHeaders()).referer || '' });
      if (q.method() === 'GET' || q.method() === 'HEAD') return route.continue();
      return route.fulfill({ status: 204, body: '' });
    }
    if (vercelPath || vendorHost(u.hostname)) {
      const loader = vercelPath && u.pathname === '/_vercel/insights/script.js';
      rec.vendor.push({ phase: rec.phase, method: q.method(), url: q.url(), body: q.postData() || '', loader });
      if (loader) return route.fulfill({ status: 200, contentType: 'text/javascript', body: VERCEL });
      if (LOADERS[u.origin + u.pathname]) return route.fulfill({ status: 200, contentType: 'text/javascript', body: LOADERS[u.origin + u.pathname] });
      if (GTAG && u.origin + u.pathname === 'https://www.googletagmanager.com/gtag/js' && u.searchParams.get('id') === GA_ID) return route.fulfill({ status: 200, contentType: 'text/javascript', body: GTAG });
      return route.fulfill({ status: 204, body: '' });
    }
    if (ALLOWED_HOSTS.has(u.hostname)) { rec.allowed = (rec.allowed || 0) + 1; return route.abort(); }
    rec.unknown.push({ phase: rec.phase, url: q.url() });
    return route.abort();
  });
  const page = await context.newPage();
  return { context, page, rec };
}
async function arrive(page, rec, target) {
  rec.target = target;
  await page.goto(`${REF}/source?refSecret=1#refFragment`);
  await Promise.all([page.waitForURL(`${ORIGIN}/**`), page.locator('#go').click()]);
  await page.waitForLoadState('load'); await page.waitForTimeout(3500);
}
const collection = (list) => list.filter((h) => !h.loader && !/\/gtag\/js|li\.lms-analytics\/insight/.test(h.url));
async function withdraw(page, rec, mode) {
  rec.phase = 'withdraw';
  const navsBefore = rec.navs.length;
  const control = page.locator('[data-consent-withdraw]');
  const load = page.waitForEvent('load', { timeout: 8000 }).then(() => true).catch(() => false);
  if (mode === 'react' && await control.count() > 0) await control.first().click();
  else await page.evaluate(() => window.SiteConsent.set('reject'));
  const reloaded = await load; await page.waitForTimeout(1500);
  rec.phase = 'after-withdraw';
  const st = await page.evaluate(() => ({ state: window.SiteConsent && window.SiteConsent.state(), allowed: window.SiteConsent && window.SiteConsent.allowed(), va: typeof window.va }));
  const n = rec.vendor.length;
  await page.evaluate(() => { try { window.va && window.va('event', { name: 'refusal-after-withdraw' }); } catch (e) { /* none */ } });
  await page.waitForTimeout(1500);
  return { reloaded: reloaded && rec.navs.length > navsBefore, st, after: rec.vendor.slice(n) };
}

const browser = await chromium.launch();
const out = [];
try {
  for (const [mode, target] of TARGETS) {
    // Control: no lock. The instrument must fire.
    { const { context, page, rec } = await setup(browser, { lock: false });
      await arrive(page, rec, target);
      const sent = rec.navs.find((n) => n.phase === 'arrival');
      ok(sent && sent.referer === `${REF}/source?refSecret=1`, `${mode} control: the browser sent the query-bearing Referer by real navigation (${sent && sent.referer})`);
      const views = rec.vendor.filter((h) => h.url === `${ORIGIN}/_vercel/insights/view` && h.method === 'POST').map((h) => { try { return JSON.parse(h.body); } catch (e) { return {}; } });
      ok(views.length > 0 && views.every((b) => b.r === `${REF}/source` && !String(b.o).includes('Secret')), `${mode} control: the real Vercel loader posted a view, r is origin + path (${JSON.stringify(views.map((b) => b.r))})`);
      const w = await withdraw(page, rec, mode);
      ok(w.reloaded && w.st.state === 'reject' && w.st.allowed === false, `${mode} control: withdrawing reloads, state reject, allowed() false (${JSON.stringify(w)})`.slice(0, 300));
      ok(collection(w.after).length === 0, `${mode} control: va('event') after the withdrawal sends nothing (${collection(w.after).map((h) => h.url).join(', ') || 'none'})`);
      ok(rec.unknown.length === 0, `${mode} control: no unknown off-origin request (${rec.unknown.map((h) => h.url).join(', ') || 'none'})`);
      out.push({ case: `${mode}-control`, rec }); await context.close(); }

    // Refusal: referrer made non-configurable before the gate runs.
    { const { context, page, rec } = await setup(browser, { lock: true });
      await arrive(page, rec, target);
      const sent = rec.navs.find((n) => n.phase === 'arrival');
      ok(sent && sent.referer === `${REF}/source?refSecret=1`, `${mode} refusal: the browser sent the query-bearing Referer by real navigation`);
      const dom = await page.evaluate(() => ({ state: window.SiteConsent && window.SiteConsent.state(), allowed: window.SiteConsent && window.SiteConsent.allowed(), referrer: document.referrer }));
      ok(dom.referrer.includes('refSecret') , `${mode} refusal: control fires, the lock held, document.referrer still carries the query (${dom.referrer})`);
      ok(dom.state === 'accept' && dom.allowed === false, `${mode} refusal: R1 state() is the choice ('accept'), allowed() is false (${JSON.stringify(dom)})`);
      ok(rec.vendor.length === 0, `${mode} refusal: R2 zero vendor requests, loaders included (${rec.vendor.map((h) => h.method + ' ' + h.url).join(', ') || 'none'})`);
      rec.phase = 'external';
      await page.evaluate(() => {
        window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
        const s = document.createElement('script'); s.src = '/_vercel/insights/script.js'; document.head.appendChild(s);
      });
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        try { window.va('event', { name: 'external-mount' }); } catch (e) { /* none */ }
        try { fetch('/_vercel/insights/event', { method: 'POST', body: '{"probe":1}' }).catch(() => {}); } catch (e) { /* none */ }
        try { navigator.sendBeacon('https://px.ads.linkedin.com/collect?probe=1', 'x'); } catch (e) { /* none */ }
        try { const x = new XMLHttpRequest(); x.open('GET', 'https://region1.google-analytics.com/g/collect?probe=1'); x.send(); } catch (e) { /* none */ }
        try { new Image().src = 'https://px.ads.linkedin.com/collect?probe=img'; } catch (e) { /* none */ }
      });
      await page.waitForTimeout(2000);
      const ext = collection(rec.vendor.filter((h) => h.phase === 'external'));
      ok(ext.length === 0, `${mode} refusal: R3 an analytics script mounted outside the gate, and direct fetch/beacon/XHR/image pings, send nothing (${ext.map((h) => h.method + ' ' + h.url).join(', ') || 'none'})`);
      const w = await withdraw(page, rec, mode);
      ok(w.reloaded && w.st.state === 'reject' && w.st.allowed === false, `${mode} refusal: R4 withdrawing reloads although the gate loaded nothing, state reject (${JSON.stringify({ reloaded: w.reloaded, st: w.st })})`);
      ok(collection(w.after).length === 0 && collection(rec.vendor.filter((h) => h.phase === 'withdraw')).length === 0, `${mode} refusal: R4 nothing is sent during or after the withdrawal, va('event') included (${[...rec.vendor.filter((h) => h.phase === 'withdraw'), ...w.after].map((h) => h.url).join(', ') || 'none'})`);
      ok(rec.unknown.length === 0, `${mode} refusal: no unknown off-origin request (${rec.unknown.map((h) => h.url).join(', ') || 'none'})`);
      out.push({ case: `${mode}-refusal`, dom, rec }); await context.close(); }
  }
} catch (e) {
  ok(false, `harness error: ${String(e && e.message || e).split('\n')[0]}`);
} finally {
  await browser.close();
  if (OUT) writeFileSync(OUT, JSON.stringify({ measured_at: new Date().toISOString(), origin: ORIGIN, failures, results, cases: out }, null, 2) + '\n');
}
console.log(`refusal-path: ${results.length - failures} of ${results.length} checks passed`);
process.exit(failures ? 1 : 0);
