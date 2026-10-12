/**
 * Consent tracking matrix for dominusos.ai (compliance P1-1h, 2026-10-12). Adapted from dominusfoundry.com's
 * tests/consent/tracking-matrix.mjs (P1-1c), which was adapted from hiresabina.ai's (P1-1b): same states, same
 * recording rules. What is this site's: the pages (/, /whitepaper, /privacy), the storage key, no form state (the
 * site has no form), an axe pass with the bar showing, and the GPC-header states, which are RECORDED as a known
 * limit rather than asserted: a static Vercel site has no server code that can read `Sec-GPC`.
 *
 *   node tests/consent/static-server.mjs . 4491 &
 *   CONSENT_ORIGIN=http://127.0.0.1:4491 CONSENT_OUT=matrix.json node tests/consent/tracking-matrix.mjs
 *
 * Every state runs in a FRESH browser context. Every request is recorded by host.
 * ⛔ Nothing about a visitor leaves this machine: analytics collection endpoints are answered in the browser with an
 * empty 204 (recorded, never delivered) and every other off-origin request is aborted. Only the gtag.js LOADER is
 * fetched for real, because without it no collection request can be observed at all.
 * PLAYWRIGHT_MODULE / AXE_CORE_PATH: this repo has no package.json, so both are loaded from an existing checkout.
 * Exit 1 on any failed assertion.
 */
import { writeFileSync, readFileSync } from 'node:fs';

const PW = process.env.PLAYWRIGHT_MODULE || '/Users/marklord/Developer/.wt/hiresabina-cmp-privacy-1012/node_modules/playwright/index.mjs';
const AXE = process.env.AXE_CORE_PATH || '/Users/marklord/Developer/Dominus Foundry/forge-web/node_modules/axe-core/axe.min.js';
const { chromium } = await import(PW);
const axeSrc = readFileSync(AXE, 'utf8');

const ORIGIN = process.env.CONSENT_ORIGIN || 'http://127.0.0.1:4491';
const OUT = process.env.CONSENT_OUT || '';
const LABEL = process.env.CONSENT_LABEL || 'candidate';
const PAGES = (process.env.CONSENT_PAGES || '/,/whitepaper,/privacy').split(',');
const KEY = process.env.CONSENT_KEY || 'dos-consent';
const GA_ID = 'G-Z0BTF1J29X';

const TRACKER_HOSTS = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|licdn\.com|linkedin\.com|googleadservices\.com|googlesyndication\.com|elevenlabs\.io)$/;
const LOADERS = /^https:\/\/www\.googletagmanager\.com\/gtag\/js/;
const trackerOf = (u) => {
  if (TRACKER_HOSTS.test(u.hostname)) return u.hostname;
  if (/^(www\.)?google\.com$/.test(u.hostname) && /^\/(ccm|rmkt|pagead|ads)\//.test(u.pathname)) return 'www.google.com(ads)';
  if (u.pathname.startsWith('/_vercel/insights')) return 'vercel-insights(same-origin)';
  return null;
};

let failures = 0; const results = [];
function ok(cond, label) { results.push({ ok: !!cond, label }); if (cond) console.log(`  ok   ${label}`); else { failures += 1; console.error(`  FAIL ${label}`); } }
function note(label) { results.push({ ok: null, label: 'KNOWN LIMIT (recorded, not asserted): ' + label }); console.log(`  note ${label}`); }

async function fresh(browser, opts = {}) {
  const { gpcSignal = false, gpcHeader = false, js = true, seedAccept = false } = opts;
  const context = await browser.newContext({ javaScriptEnabled: js, extraHTTPHeaders: gpcHeader ? { 'Sec-GPC': '1' } : {} });
  if (gpcSignal) await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true }); });
  if (seedAccept) await context.addInitScript((k) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, '1.accept.0'); } catch (e) { /* none */ } }, KEY);
  const rec = { phase: 'before', hits: [], offOrigin: new Set(), pageErrors: [] };
  await context.route('**/*', async (route) => {
    const q = route.request(); const u = new URL(q.url());
    const t = trackerOf(u);
    if (t) {
      rec.hits.push({ phase: rec.phase, host: t, method: q.method(), url: q.url(), body: q.postData() || '' });
      if (LOADERS.test(q.url())) return route.continue();
      return route.fulfill({ status: 204, body: '' });
    }
    if (u.origin !== ORIGIN) { rec.offOrigin.add(u.hostname); return route.abort(); }
    if (q.method() === 'GET' || q.method() === 'HEAD') return route.continue();
    return route.fulfill({ status: 204, body: '' });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => rec.pageErrors.push(String(e.message || e).slice(0, 200)));
  return { context, page, rec };
}
async function visit(page, path) { const r = await page.goto(ORIGIN + path, { waitUntil: 'load' }); await page.waitForTimeout(2500); return r; }
const hostsIn = (rec, phase) => [...new Set(rec.hits.filter((h) => !phase || h.phase === phase).map((h) => h.host))].sort();
const barCount = (page) => page.locator('[data-consent-bar]').count();
async function choose(page, choice, rec) {
  const btn = page.locator(`[data-consent-bar] [data-consent="${choice}"]`);
  if (await btn.count() === 0) { if (rec) rec.phase = 'after'; return false; }
  if (rec) rec.phase = 'after';
  await btn.click(); await page.waitForTimeout(3000); return true;
}
async function axe(page) {
  await page.addScriptTag({ content: axeSrc });
  return page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] });
    return res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}×${v.nodes.length}`);
  });
}

async function main() {
  const browser = await chromium.launch(process.env.CONSENT_CHROMIUM ? { executablePath: process.env.CONSENT_CHROMIUM } : {});
  const matrix = { label: LABEL, origin: ORIGIN, measured_at: new Date().toISOString(), pages: PAGES, states: {} };
  try {
    // 1 initial: no choice made. Also the axe pass, with the bar showing (the bar is part of every first view).
    { const { context, page, rec } = await fresh(browser);
      let bar = null; const axeBy = {}; const status = {};
      for (const p of PAGES) {
        const r = await visit(page, p); status[p] = r && r.status();
        if (bar === null) bar = await barCount(page);
        axeBy[p] = await axe(page).catch((e) => [`axe-error ${String(e).slice(0, 80)}`]);
      }
      const hosts = hostsIn(rec);
      matrix.states.initial = { hosts, bar_shown: bar > 0, requests: rec.hits.length, status, axe_serious_critical: axeBy, page_errors: rec.pageErrors, off_origin_aborted: [...rec.offOrigin].sort() };
      ok(hosts.length === 0, `initial: zero analytics requests before any choice (${hosts.join(', ') || 'none'})`);
      ok(bar > 0, 'initial: the consent bar is shown');
      for (const p of PAGES) ok(status[p] === 200, `initial: ${p} answers 200 (${status[p]})`);
      for (const p of PAGES) ok(axeBy[p].length === 0, `initial: axe serious+critical = 0 on ${p}, bar showing (${axeBy[p].join(', ') || 'none'})`);
      ok(rec.pageErrors.length === 0, `initial: no page errors (${rec.pageErrors.join(' | ') || 'none'})`);
      await context.close(); }

    // 2 reject
    { const { context, page, rec } = await fresh(browser);
      await visit(page, PAGES[0]); const clicked = await choose(page, 'reject', rec);
      for (const p of PAGES) await visit(page, p);
      const hosts = hostsIn(rec); const barAfter = await barCount(page);
      matrix.states.reject = { hosts, choice_made: clicked, bar_after: barAfter };
      ok(clicked, 'reject: "No analytics" button exists and was pressed');
      ok(hosts.length === 0, `reject: zero analytics requests (${hosts.join(', ') || 'none'})`);
      ok(barAfter === 0, 'reject: the bar does not come back on later pages');
      await context.close(); }

    // 3 accept (the first page is opened WITH a query string, so the "no query string reaches Google" check is not vacuous)
    { const { context, page, rec } = await fresh(browser);
      await visit(page, PAGES[0] + '?utm_source=zq-matrix&ref=zq-query#zq-frag'); const before = hostsIn(rec);
      const clicked = await choose(page, 'accept', rec);
      for (const p of PAGES) await visit(page, p + '?zq-query=1');
      const after = hostsIn(rec, 'after');
      const leaks = rec.hits.filter((h) => /zq-matrix|zq-query|zq-frag/.test(h.url + h.body));
      const gaCollect = rec.hits.filter((h) => /google-analytics\.com$/.test(h.host) && h.url.includes('tid=' + GA_ID));
      const cookies = (await context.cookies()).map((c) => c.name).sort();
      matrix.states.accept = { hosts_before_choice: before, hosts_after_accept: after, choice_made: clicked, ga4_collect_requests: gaCollect.length,
        query_or_fragment_in_analytics_requests: leaks.map((h) => h.host + ' ' + h.url.slice(0, 200)), cookies_after: cookies };
      ok(clicked && before.length === 0, `accept: nothing before the click (${before.join(', ') || 'none'})`);
      ok(after.includes('www.googletagmanager.com'), 'accept: GA4 loader requested after accept');
      ok(gaCollect.length > 0, `accept: a GA4 collection request for ${GA_ID} is made after accept (answered locally, never delivered) (${gaCollect.length})`);
      ok(after.includes('vercel-insights(same-origin)'), 'accept: Vercel Web Analytics requested after accept');
      ok(!after.some((h) => /licdn|linkedin|doubleclick|google\.com\(ads\)/.test(h)), `accept: no LinkedIn or Google Ads request (${after.join(', ')})`);
      ok(leaks.length === 0, `accept: no analytics request carries the page's query string or fragment (${leaks.length})`);
      await context.close(); }

    // 4 withdraw (accept, then "No analytics" on /privacy)
    { const { context, page, rec } = await fresh(browser);
      await visit(page, PAGES[0]); await choose(page, 'accept');
      await visit(page, '/privacy');
      const w = page.locator('[data-consent-withdraw]');
      const has = await w.count() > 0;
      if (has) { await Promise.all([page.waitForEvent('load', { timeout: 10000 }).catch(() => {}), w.click()]); await page.waitForTimeout(2500); }
      rec.phase = 'after';
      for (const p of PAGES) await visit(page, p);
      const hosts = hostsIn(rec, 'after');
      const cookies = (await context.cookies()).map((c) => c.name).filter((n) => /^(_ga|_gid|li_|_li)/.test(n));
      const statusText = has ? await page.locator('[data-consent-status]').first().textContent().catch(() => '') : '';
      matrix.states.withdraw = { hosts_after_withdraw: hosts, withdraw_control_found: has, analytics_cookies_left: cookies, status_text_on_last_page: (statusText || '').trim() };
      ok(has, 'withdraw: /privacy has a withdraw control');
      ok(hosts.length === 0, `withdraw: zero analytics requests after withdrawing (${hosts.join(', ') || 'none'})`);
      ok(cookies.length === 0, `withdraw: first-party analytics cookies cleared (${cookies.join(', ') || 'none'})`);
      await context.close(); }

    // 4b re-allow from /privacy after a reject (the control works both ways)
    { const { context, page, rec } = await fresh(browser);
      await visit(page, PAGES[0]); await choose(page, 'reject');
      await visit(page, '/privacy');
      const a = page.locator('[data-consent-allow]');
      const has = await a.count() > 0;
      rec.phase = 'after';
      if (has) { await a.click(); await page.waitForTimeout(3000); }
      const after = hostsIn(rec, 'after');
      matrix.states.allow_from_privacy = { allow_control_found: has, hosts_after_allow: after };
      ok(has && after.includes('www.googletagmanager.com'), `allow from /privacy: analytics starts only after the visitor allows it there (${after.join(', ') || 'none'})`);
      await context.close(); }

    // 5 GPC via navigator.globalPrivacyControl: asserted, alone and over a stored accept
    for (const [name, opts] of [['gpc_signal', { gpcSignal: true }], ['gpc_signal_over_stored_accept', { gpcSignal: true, seedAccept: true }]]) {
      const { context, page, rec } = await fresh(browser, opts);
      let bar = 0;
      for (const p of PAGES) { await visit(page, p); bar += await barCount(page); }
      const hosts = hostsIn(rec);
      const state = await page.evaluate(() => (window.SiteConsent ? window.SiteConsent.state() : 'no-gate'));
      const gpcText = await page.locator('[data-consent-status]').first().textContent().catch(() => '');
      matrix.states[name] = { hosts, bar_shown: bar > 0, gate_state: state, privacy_status_text: (gpcText || '').trim() };
      ok(hosts.length === 0, `${name}: zero analytics requests (${hosts.join(', ') || 'none'})`);
      ok(bar === 0, `${name}: no consent prompt`);
      ok(state === 'gpc', `${name}: the gate reports gpc (${state})`);
      await context.close();
    }

    // 5b GPC via the Sec-GPC request HEADER ONLY (no navigator property). A static site cannot read it, so this is
    //    recorded, not asserted. What IS asserted: with no choice made, nothing is sent (the gate's default).
    for (const [name, opts] of [['gpc_header_only', { gpcHeader: true }], ['gpc_header_only_over_stored_accept', { gpcHeader: true, seedAccept: true }]]) {
      const { context, page, rec } = await fresh(browser, opts);
      let bar = 0;
      for (const p of PAGES) { await visit(page, p); bar += await barCount(page); }
      const hosts = hostsIn(rec);
      const state = await page.evaluate(() => (window.SiteConsent ? String(window.SiteConsent.state()) : 'no-gate'));
      matrix.states[name] = { hosts, bar_shown: bar > 0, gate_state: state, asserted: name === 'gpc_header_only' ? 'zero requests with no choice' : 'nothing' };
      if (name === 'gpc_header_only') ok(hosts.length === 0, `${name}: zero analytics requests with no choice made (${hosts.join(', ') || 'none'})`);
      note(`${name}: the header is not visible to page code on a static host; gate state "${state}", bar ${bar > 0 ? 'shown' : 'not shown'}, hosts ${hosts.join(', ') || 'none'}`);
      await context.close();
    }

    // 6 noscript
    { const { context, page, rec } = await fresh(browser, { js: false });
      for (const p of PAGES) await visit(page, p);
      const hosts = hostsIn(rec);
      matrix.states.noscript = { hosts, off_origin_requests: [...rec.offOrigin].sort() };
      ok(hosts.length === 0, `noscript: zero analytics requests (${hosts.join(', ') || 'none'})`);
      await context.close(); }

    // 7 /privacy content, and every page's footer links to it
    { const { context, page } = await fresh(browser, { js: false });
      const r = await page.goto(ORIGIN + '/privacy', { waitUntil: 'load' });
      const h1 = (await page.locator('h1').first().textContent().catch(() => '')) || '';
      const text = (await page.locator('body').innerText().catch(() => '')) || '';
      const links = {};
      for (const p of PAGES) {
        await page.goto(ORIGIN + p, { waitUntil: 'load' });
        links[p] = await page.evaluate(() => [...document.querySelectorAll('footer a')].filter((a) => /privacy/i.test(a.textContent)).map((a) => new URL(a.href).pathname));
      }
      const missingLink = PAGES.filter((p) => !(links[p] || []).includes('/privacy'));
      const must = ['Dominus Foundry LLC', 'Google Analytics', 'Vercel Web Analytics', 'Global Privacy Control', 'mark@dominusfoundry.com', 'Nothing is sent until you choose', 'Sec-GPC'];
      const mustNot = ['By using (this|our) (web)?site', '\\bIris\\b', '\\$[0-9]', 'ElevenLabs', 'Google Ads', '\\b(installed|platform|solution|assistant|receptionist)\\b'];
      const missing = must.filter((m) => !text.includes(m));
      const present = mustNot.filter((m) => new RegExp(m, 'i').test(text));
      matrix.states.privacy_page = { status: r && r.status(), h1: h1.trim(), required_missing: missing, banned_present: present, footer_privacy_links: links, pages_without_footer_privacy_link: missingLink };
      ok(r && r.status() === 200 && /Privacy/i.test(h1), `/privacy renders (status ${r && r.status()}, h1 "${h1.trim()}")`);
      ok(missing.length === 0, `/privacy states every required item (missing: ${missing.join('; ') || 'none'})`);
      ok(present.length === 0, `/privacy carries none of the banned items (present: ${present.join('; ') || 'none'})`);
      ok(missingLink.length === 0, `every page has a footer link to /privacy (missing on: ${missingLink.join(', ') || 'none'})`);
      await context.close(); }
  } finally {
    await browser.close();
  }
  matrix.checks = results; matrix.failures = failures;
  const asserted = results.filter((r) => r.ok !== null).length;
  if (OUT) writeFileSync(OUT, JSON.stringify(matrix, null, 2) + '\n');
  console.log(`${LABEL}: ${asserted - failures} of ${asserted} checks passed`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('  FAIL harness error:', e && e.stack || e); process.exit(2); });
