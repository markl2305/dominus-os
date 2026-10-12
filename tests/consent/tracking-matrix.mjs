/**
 * Consent tracking matrix for dominusos.ai (compliance P1-1h, 2026-10-12). Adapted from dominusfoundry.com's
 * tests/consent/tracking-matrix.mjs (P1-1c), which was adapted from hiresabina.ai's (P1-1b): same states, same
 * recording rules. What is this site's: the pages (/, /whitepaper, /privacy), the storage key, no form state (the
 * site has no form), an axe pass with the bar showing, a bar-cover check at 390x844 and 1280x720, and the GPC-header
 * states. Sync round (2026-10-13): the GPC-header states are asserted against the static server's EMULATION of the
 * vercel.json `headers` rule (consent_gpc cookie); that proves the page side only, and live proof is OWED to a
 * preview deployment. Every off-origin request is recorded, aborted ones included, and any host outside the tracker
 * predicate and the known content hosts (Google Fonts, LocateFaith badge) fails the run.
 *
 *   node tests/consent/static-server.mjs . 4491 &
 *   CONSENT_ORIGIN=http://127.0.0.1:4491 CONSENT_OUT=matrix.json node tests/consent/tracking-matrix.mjs
 *
 * Every state runs in a FRESH browser context. Every request is recorded by host.
 * ⛔ Nothing about a visitor leaves this machine: analytics collection endpoints are answered in the browser with an
 * empty 204 (recorded, never delivered) and every other off-origin request is recorded and aborted. Only the gtag.js
 * LOADER is fetched for real, because without it no collection request can be observed at all.
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

// Tracker predicate (anvil 1c R1 F4 lesson): google-analytics.com, googletagmanager.com, www.google.com/g/collect,
// www.google.com/measurement/conversion, google.com/pagead, googleads.g.doubleclick.net (any doubleclick.net),
// googleadservices.com, va.vercel-scripts.com, /_vercel/insights, licdn.com; plus googlesyndication, linkedin, elevenlabs.
const TRACKER_HOSTS = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|licdn\.com|linkedin\.com|googleadservices\.com|googlesyndication\.com|elevenlabs\.io|vercel-scripts\.com)$/;
const GOOGLE_PATHS = /^\/(g\/collect|measurement\/conversion|pagead|ccm|rmkt|ads)(\/|$)/;
const LOADERS = /^https:\/\/www\.googletagmanager\.com\/gtag\/js/;
// Non-tracking third-party content this site loads on purpose; named on /privacy. Anything else off-origin fails.
const CONTENT_HOSTS = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|locatefaith\.com)$/;
const trackerOf = (u) => {
  if (TRACKER_HOSTS.test(u.hostname)) return u.hostname;
  if (/(^|\.)google\.com$/.test(u.hostname) && GOOGLE_PATHS.test(u.pathname)) return `www.google.com(${u.pathname.split('/').slice(1, 3).join('/')})`;
  if (u.pathname.startsWith('/_vercel/insights')) return 'vercel-insights(same-origin)';
  return null;
};
const EMU = 'EMULATED vercel.json header rule, live proof OWED';

let failures = 0; const results = [];
function ok(cond, label) { results.push({ ok: !!cond, label }); if (cond) console.log(`  ok   ${label}`); else { failures += 1; console.error(`  FAIL ${label}`); } }
function note(label) { results.push({ ok: null, label: 'KNOWN LIMIT (recorded, not asserted): ' + label }); console.log(`  note ${label}`); }

async function fresh(browser, opts = {}) {
  const { gpcSignal = false, gpcHeader = false, js = true, seedAccept = false } = opts;
  const context = await browser.newContext({ javaScriptEnabled: js, extraHTTPHeaders: gpcHeader ? { 'Sec-GPC': '1' } : {} });
  if (gpcSignal) await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true }); });
  if (seedAccept) await context.addInitScript((k) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, '1.accept.0'); } catch (e) { /* none */ } }, KEY);
  const rec = { phase: 'before', hits: [], offOrigin: new Set(), offOriginReqs: [], pageErrors: [] };
  await context.route('**/*', async (route) => {
    const q = route.request(); const u = new URL(q.url());
    const t = trackerOf(u);
    if (t) {
      rec.hits.push({ phase: rec.phase, host: t, method: q.method(), url: q.url(), body: q.postData() || '' });
      if (LOADERS.test(q.url())) return route.continue();
      return route.fulfill({ status: 204, body: '' });
    }
    if (u.origin !== ORIGIN) { rec.offOrigin.add(u.hostname); rec.offOriginReqs.push({ phase: rec.phase, host: u.hostname, method: q.method(), url: q.url(), body: q.postData() || '', aborted: true }); return route.abort(); }
    if (q.method() === 'GET' || q.method() === 'HEAD') return route.continue();
    return route.fulfill({ status: 204, body: '' });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => rec.pageErrors.push(String(e.message || e).slice(0, 200)));
  return { context, page, rec };
}
async function visit(page, path) { const r = await page.goto(ORIGIN + path, { waitUntil: 'load' }); await page.waitForTimeout(2500); return r; }
const hostsIn = (rec, phase) => [...new Set(rec.hits.filter((h) => !phase || h.phase === phase).map((h) => h.host))].sort();
// Off-origin hosts that are neither in the tracker predicate nor known content: each one fails the state it appears in.
const unknownOff = (rec) => [...new Set(rec.offOriginReqs.filter((r) => !CONTENT_HOSTS.test(r.host)).map((r) => r.host))].sort();
const allRequests = (rec) => [...rec.hits, ...rec.offOriginReqs];
function checkUnknown(name, rec, st) { const u = unknownOff(rec); st.unknown_off_origin_hosts = u; st.off_origin_recorded = rec.offOriginReqs.length; ok(u.length === 0, `${name}: no off-origin request outside the tracker predicate and the known content hosts (${u.join(', ') || 'none'})`); }
// The bar must not cover anything a visitor can use: at the top and the bottom of each page, the centre of every
// visible link/button/field (outside the bar) must hit that element, not the bar.
async function coverCheck(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-consent-bar]');
    const br = bar ? bar.getBoundingClientRect() : null;
    const els = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((e) => !(bar && bar.contains(e)));
    let checked = 0; const covered = [];
    const inBar = (x, y) => { const h = document.elementFromPoint(x, y); return !!(bar && h && bar.contains(h)); };
    for (const e of els) {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue;
      checked += 1;
      const label = (e.textContent || e.getAttribute('aria-label') || e.getAttribute('alt') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      if (inBar(cx, cy)) { covered.push('centre:' + label); continue; }
      if (br) { // any part of the element under the bar? probe the centre of the overlap
        const L = Math.max(r.left, br.left, 0), R = Math.min(r.right, br.right, innerWidth), T = Math.max(r.top, br.top, 0), B = Math.min(r.bottom, br.bottom, innerHeight);
        if (R > L && B > T && inBar((L + R) / 2, (T + B) / 2)) covered.push('part:' + label);
      }
    }
    return { checked, covered, bar_present: !!bar, bar_position: bar ? getComputedStyle(bar).position : null, bar_rect: br ? [Math.round(br.top), Math.round(br.bottom)] : null };
  });
}
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
      checkUnknown('initial', rec, matrix.states.initial);
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
      checkUnknown('reject', rec, matrix.states.reject);
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
      const leaks = allRequests(rec).filter((h) => !CONTENT_HOSTS.test(h.host) && /zq-matrix|zq-query|zq-frag/.test(h.url + h.body));
      const gaCollect = rec.hits.filter((h) => /google-analytics\.com$/.test(h.host) && h.url.includes('tid=' + GA_ID));
      const cookies = (await context.cookies()).map((c) => c.name).sort();
      matrix.states.accept = { hosts_before_choice: before, hosts_after_accept: after, choice_made: clicked, ga4_collect_requests: gaCollect.length,
        query_or_fragment_in_analytics_requests: leaks.map((h) => h.host + ' ' + h.url.slice(0, 200)), cookies_after: cookies };
      ok(clicked && before.length === 0, `accept: nothing before the click (${before.join(', ') || 'none'})`);
      ok(after.includes('www.googletagmanager.com'), 'accept: GA4 loader requested after accept');
      ok(gaCollect.length > 0, `accept: a GA4 collection request for ${GA_ID} is made after accept (answered locally, never delivered) (${gaCollect.length})`);
      ok(after.includes('vercel-insights(same-origin)'), 'accept: Vercel Web Analytics requested after accept');
      ok(!after.some((h) => /licdn|linkedin|doubleclick|googleadservices|google\.com\(/.test(h)), `accept: no LinkedIn or Google Ads request (${after.join(', ')})`);
      ok(leaks.length === 0, `accept: no recorded request (trackers AND aborted off-origin) carries the page's query string or fragment (${leaks.length})`);
      checkUnknown('accept', rec, matrix.states.accept);
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

    // 5b GPC via the Sec-GPC request HEADER ONLY (no navigator property). Page code cannot read a request header; the
    //    vercel.json `headers` rule answers it with `consent_gpc=1`, which the gate reads. Asserted here against the static
    //    server's EMULATION of that rule (page side only); against RED (no rule) these fail, as they should.
    for (const [name, opts] of [['gpc_header_only', { gpcHeader: true }], ['gpc_header_only_over_stored_accept', { gpcHeader: true, seedAccept: true }]]) {
      const { context, page, rec } = await fresh(browser, opts);
      let bar = 0;
      for (const p of PAGES) { await visit(page, p); bar += await barCount(page); }
      const hosts = hostsIn(rec);
      const state = await page.evaluate(() => (window.SiteConsent ? String(window.SiteConsent.state()) : 'no-gate'));
      const cookie = (await context.cookies()).find((c) => c.name === 'consent_gpc');
      matrix.states[name] = { hosts, bar_shown: bar > 0, gate_state: state, consent_gpc_cookie: cookie ? { value: cookie.value, secure: cookie.secure, sameSite: cookie.sameSite, expires_in_s: Math.round(cookie.expires - Date.now() / 1000) } : null, basis: EMU };
      ok(hosts.length === 0, `${name}: zero analytics requests (${hosts.join(', ') || 'none'}) [${EMU}]`);
      ok(bar === 0 && state === 'gpc', `${name}: no prompt and the gate reports gpc (${state}) [${EMU}]`);
      await context.close();
    }
    // 5c the header stops: the stale consent_gpc cookie is cleared, and the visitor is asked again
    { const { context, page, rec } = await fresh(browser);
      await page.setExtraHTTPHeaders({ 'Sec-GPC': '1' }); await visit(page, PAGES[0]);
      const set = (await context.cookies()).some((c) => c.name === 'consent_gpc' && c.value === '1');
      await page.setExtraHTTPHeaders({}); await visit(page, PAGES[0]);
      const left = (await context.cookies()).filter((c) => c.name === 'consent_gpc').map((c) => c.value);
      const state = await page.evaluate(() => (window.SiteConsent ? String(window.SiteConsent.state()) : 'no-gate'));
      const bar = await barCount(page);
      matrix.states.gpc_header_stops = { cookie_set_while_header: set, cookie_after_header_stops: left, gate_state_after: state, bar_after: bar > 0, hosts: hostsIn(rec), basis: EMU };
      ok(set && left.length === 0 && state === 'null' && bar > 0 && hostsIn(rec).length === 0, `gpc_header_stops: cookie set while the header is sent, cleared when it stops, the visitor is asked again, nothing sent (set ${set}, left [${left}], state ${state}) [${EMU}]`);
      await context.close(); }

    // 5d the bar covers nothing, at 390x844 and 1280x720, top and bottom of every page (anvil 1c R1 F1 lesson)
    { matrix.states.bar_cover = {};
      for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
        const context = await browser.newContext({ viewport: vp });
        await context.route('**/*', (r) => (new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort()));
        const page = await context.newPage(); const key = `${vp.width}x${vp.height}`; matrix.states.bar_cover[key] = {};
        for (const p of PAGES) {
          await page.goto(ORIGIN + p, { waitUntil: 'load' }); await page.waitForTimeout(400);
          const top = await coverCheck(page);
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(400);
          const bottom = await coverCheck(page);
          if (process.env.CONSENT_SHOTS && p === '/privacy') await page.screenshot({ path: `${process.env.CONSENT_SHOTS}-${key}-privacy-bottom.png` });
          matrix.states.bar_cover[key][p] = { top, bottom };
          ok(top.bar_present && top.covered.length === 0 && bottom.covered.length === 0 && top.checked > 0 && bottom.checked > 0,
            `bar_cover ${key} ${p}: bar shown (${top.bar_position}); covers 0 controls at top (${top.checked} checked) and 0 at bottom (${bottom.checked} checked) (${[...top.covered, ...bottom.covered].join('; ') || 'none'})`);
        }
        await context.close();
      } }

    // 6 noscript
    { const { context, page, rec } = await fresh(browser, { js: false });
      for (const p of PAGES) await visit(page, p);
      const hosts = hostsIn(rec);
      matrix.states.noscript = { hosts, off_origin_requests: [...rec.offOrigin].sort() };
      checkUnknown('noscript', rec, matrix.states.noscript);
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
      const must = ['Dominus Foundry LLC', 'Google Analytics', 'Vercel Web Analytics', 'Global Privacy Control', 'mark@dominusfoundry.com', 'Nothing is sent until you choose', 'Sec-GPC',
        'not yet been confirmed on the live site', 'A cookie holds it for 180 days', 'stays until you clear', 'Google Fonts', 'LocateFaith'];
      const mustNot = ['for 180 days, and then you are asked again', 'By using (this|our) (web)?site', '\\bIris\\b', '\\$[0-9]', 'ElevenLabs', 'Google Ads', '\\b(installed|platform|solution|assistant|receptionist)\\b'];
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
