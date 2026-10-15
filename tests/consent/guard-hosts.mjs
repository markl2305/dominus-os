/**
 * The gate's request guard, host classification (anvil gate-v2 R2 F3). Offline: a browser route serves a page,
 * consent/consent.js (CONSENT_GATE_PATH) and probe scripts; every other request is answered by a local sink (recorded, never
 * delivered). No network.
 *
 *   node tests/consent/guard-hosts.mjs
 *   CONSENT_GATE_FILE=/path/to/older/consent.js node tests/consent/guard-hosts.mjs   # RED on an older gate
 *
 * H1  the review's probes (www.google.co.uk / .de / .com.au /ads/ga-audiences, px.ads.linkedin.com. with a trailing dot)
 *     and further spellings (mixed case, explicit port, IDNA full-width, trailing dot + case) send ZERO requests through
 *     fetch (a real Request), sendBeacon, XMLHttpRequest and image .src while denied: no choice, GPC over a stored
 *     accept, a stored accept whose referrer could not be narrowed, a private path, and a withdrawal (inside the
 *     reject event, before the reload, and after it). Control: after a valid accept every one reaches the sink.
 * H2  first-party and ordinary third-party traffic is untouched in every denied state: site /api calls (assessment
 *     POST, visitor chat), Next /_next and RSC fetches, /_vercel/insights-help (not the analytics segment), Google
 *     Fonts, an ordinary third-party host. The analytics segment /_vercel/insights/view is refused.
 * H3  a request to an UNLISTED off-origin host made from a vendor's own script (served at a LinkedIn / gtag.js /
 *     Vercel loader URL) is refused while denied; the same code from a first-party script is not; after accept it is
 *     sent.
 * H4  property test: generated spellings of every vendor family (case, trailing dot, port, sub-domain, IDNA) and
 *     lookalikes. The gate's refusal (observed in the browser) must equal the expected class AND the harness
 *     classifier (tests/consent/vendor-hosts.mjs), so runtime and harnesses cannot drift apart.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { vendorUrl as harnessVendorUrl } from './vendor-hosts.mjs';

const ROOT = new URL('../../', import.meta.url);
const GATE = readFileSync(process.env.CONSENT_GATE_FILE || new URL(process.env.CONSENT_GATE_PATH || 'consent/consent.js', ROOT), 'utf8');
const OUT = process.env.CONSENT_OUT || '';
const SITE = 'http://guard-hosts.test';
const REF = 'http://guard-hosts-ref.test';
const KEY = 'guard-consent';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

let failures = 0; const results = [];
function ok(cond, label, detail) { results.push({ ok: !!cond, label, detail }); if (cond) console.log(`  ok   ${label}`); else { failures += 1; console.error(`  FAIL ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 600) : ''}`); } }

const page = () => `<!doctype html><html><head><meta charset="utf-8"><title>guard</title>
<script>window.CONSENT_CONFIG=${JSON.stringify({ storageKey: KEY, privatePaths: '^/(api|chat)(/|$)', autoBar: false })};</script>
<script src="/consent/consent.js"></script></head><body><main><button type="button" data-consent-withdraw onclick="SiteConsent.set('reject')">Withdraw</button></main></body></html>`;
// A script whose body sends to an UNLISTED host through all four transports; served at a vendor URL or a first-party one.
const unlistedSender = (tag) => `(function(){var u='https://unlisted-sink.test/x?probe=${tag}';
try{fetch(new Request(u+'&t=fetch',{method:'POST',body:'p',mode:'no-cors'})).catch(function(){});}catch(e){}
try{navigator.sendBeacon(u+'&t=beacon','p');}catch(e){}
try{var x=new XMLHttpRequest();x.open('GET',u+'&t=xhr');x.send();}catch(e){}
try{new Image().src=u+'&t=image';}catch(e){}})();`;

// H1 probes: [id, url]. The first four are the review's, verbatim.
const H1 = [
  ['uk', 'https://www.google.co.uk/ads/ga-audiences'],
  ['de', 'https://www.google.de/ads/ga-audiences'],
  ['au', 'https://www.google.com.au/ads/ga-audiences'],
  ['li-dot', 'https://px.ads.linkedin.com./collect'],
  ['case', 'https://WWW.Google-Analytics.COM/g/collect'],
  ['port', 'https://www.google-analytics.com:8443/g/collect'],
  ['idna', 'https://www.ｇｏｏｇｌｅ.de/ads/ga-audiences'],
  ['dot-case', 'https://PX.ADS.LINKEDIN.COM./collect'],
  ['dc', 'https://stats.g.doubleclick.net/g/collect'],
  ['vercel-other-origin', 'https://elsewhere.test/_vercel/insights/view'],
];
// H2 controls: must reach the sink in every denied state.
const H2 = [
  ['assess', `${SITE}/api/assess`],
  ['chat', `${SITE}/api/visitor-chat/message`],
  ['next', `${SITE}/_next/static/probe.js`],
  ['rsc', `${SITE}/trust?_rsc=probe`],
  ['insights-help', `${SITE}/_vercel/insights-help`],
  ['relative', '/api/evaluate/site'],
  ['fonts', 'https://fonts.googleapis.com/css2'],
  ['gstatic', 'https://fonts.gstatic.com/font.woff2'],
  ['third-party', 'https://ordinary-host.test/brand/image.svg'],
];
const TRANSPORTS = ['fetch', 'beacon', 'xhr', 'image'];

async function fresh(browser, { seed = null, gpc = false, lock = false } = {}) {
  const context = await browser.newContext({ userAgent: UA, serviceWorkers: 'block' });
  await context.addInitScript(({ site, seed, gpc, lock, key }) => {
    if (location.origin !== site) return;
    if (seed && !sessionStorage.getItem('seeded')) { localStorage.setItem(key, seed); sessionStorage.setItem('seeded', '1'); }
    if (gpc) Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true });
    if (lock) Object.defineProperty(document, 'referrer', { value: document.referrer, configurable: false });
  }, { site: SITE, seed, gpc, lock, key: KEY });
  const seen = [];
  await context.route('**/*', async (route) => {
    const q = route.request(); const u = new URL(q.url());
    if (u.origin === REF) return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'referrer-policy': 'unsafe-url' }, body: `<a id="go" href="${SITE}/p">go</a>` });
    if (u.origin === SITE && (u.pathname === '/p' || u.pathname.startsWith('/chat/')) && q.isNavigationRequest()) return route.fulfill({ status: 200, contentType: 'text/html', body: page() });
    if (u.origin === SITE && u.pathname === '/consent/consent.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: GATE });
    const probeScript = u.searchParams.get('guard-script');
    if (probeScript) return route.fulfill({ status: 200, contentType: 'text/javascript', body: unlistedSender(probeScript) });
    seen.push({ url: q.url(), host: u.host, probe: u.searchParams.get('probe'), t: u.searchParams.get('t') });
    return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
  const p = await context.newPage();
  return { context, page: p, seen };
}
// Fires every probe through every transport, tagging each request ?probe=<tag>&t=<transport>.
const fire = (p, list, tag) => p.evaluate(({ list, tag, transports }) => {
  const add = (url, id, t) => url + (url.includes('?') ? '&' : '?') + 'probe=' + encodeURIComponent(tag + ':' + id) + '&t=' + t;
  for (const [id, url] of list) {
    for (const t of transports) {
      const u = add(url, id, t);
      try {
        if (t === 'fetch') fetch(new Request(u, { method: 'POST', body: 'probe', mode: 'no-cors' })).catch(() => {});
        if (t === 'beacon') navigator.sendBeacon(u, 'probe');
        if (t === 'xhr') { const x = new XMLHttpRequest(); x.open('GET', u); x.send(); }
        if (t === 'image') { const im = new Image(); im.src = u; }
      } catch (e) { /* a refusal may throw */ }
    }
  }
}, { list, tag, transports: TRANSPORTS });
const reached = (seen, tag, id) => seen.filter((s) => s.probe === `${tag}:${id}`);
const loadScript = (p, src) => p.evaluate((src) => new Promise((r) => { const s = document.createElement('script'); s.src = src; s.onload = s.onerror = () => r(); document.head.appendChild(s); }), src);
const VENDOR_SCRIPTS = [
  ['linkedin-loader', 'https://snap.licdn.com/li.lms-analytics/insight.min.js?guard-script=vendor-li'],
  ['gtag-loader', 'https://www.googletagmanager.com/gtag/js?id=G-GUARD&guard-script=vendor-gtag'],
  ['vercel-loader', `${SITE}/_vercel/insights/script.js?guard-script=vendor-vercel`],
];
const FIRST_PARTY_SCRIPT = `${SITE}/site-probe.js?guard-script=first-party`;

async function checkDenied(name, p, seen, { checkScripts = true } = {}) {
  const st = await p.evaluate(() => ({ allowed: SiteConsent.allowed(), state: SiteConsent.state() }));
  ok(st.allowed === false, `${name}: denied (allowed() false, state ${st.state})`, st);
  await fire(p, H1, name); await fire(p, H2, name);
  await p.waitForTimeout(700);
  const leaks = H1.flatMap(([id]) => reached(seen, name, id).map((s) => `${id}/${s.t}`));
  ok(leaks.length === 0, `${name}: H1 zero requests from ${H1.length} vendor spellings x 4 transports`, leaks);
  const missing = H2.flatMap(([id]) => TRANSPORTS.filter((t) => !reached(seen, name, id).some((s) => s.t === t)).map((t) => `${id}/${t}`));
  ok(missing.length === 0, `${name}: H2 every first-party / ordinary third-party control reached the sink (${H2.length} x 4)`, missing);
  if (!checkScripts) return;
  for (const [id, src] of VENDOR_SCRIPTS) await loadScript(p, src);
  await loadScript(p, FIRST_PARTY_SCRIPT);
  await p.waitForTimeout(700);
  const fromVendor = seen.filter((s) => /^vendor-/.test(s.probe || '') && !s.done);
  const fromSite = seen.filter((s) => s.probe === 'first-party' && !s.done);
  ok(fromVendor.length === 0, `${name}: H3 an unlisted host sent to from a vendor's own script is refused (LinkedIn, gtag.js and Vercel loader URLs)`, fromVendor.map((s) => s.probe + '/' + s.t));
  ok(fromSite.length === 4, `${name}: H3 control, the same code from a first-party script reaches the sink through all 4 transports (${fromSite.length})`);
  for (const s of seen) s.done = true;
}

async function main() {
  const browser = await chromium.launch();
  try {
    const accept = () => `1.accept.${Date.now()}`;
    // Denied 1: no choice.
    { const { context, page: p, seen } = await fresh(browser);
      await p.goto(`${SITE}/p`); await checkDenied('no-choice', p, seen); await context.close(); }
    // Denied 2: GPC over a stored accept.
    { const { context, page: p, seen } = await fresh(browser, { seed: accept(), gpc: true });
      await p.goto(`${SITE}/p`); await checkDenied('gpc', p, seen); await context.close(); }
    // Denied 3: a stored accept whose query-bearing referrer could not be narrowed (real link, unsafe-url).
    { const { context, page: p, seen } = await fresh(browser, { seed: accept(), lock: true });
      await p.goto(`${REF}/source?ref-secret=1`);
      await Promise.all([p.waitForURL(`${SITE}/**`), p.locator('#go').click()]);
      const ref = await p.evaluate(() => document.referrer);
      ok(ref.includes('ref-secret'), `locked-referrer: control fires, the referrer is still the full one (${ref})`);
      await checkDenied('locked-referrer', p, seen); await context.close(); }
    // Denied 4: a private path with a stored accept.
    { const { context, page: p, seen } = await fresh(browser, { seed: accept() });
      await p.goto(`${SITE}/chat/x`); await checkDenied('private-path', p, seen); await context.close(); }
    // Denied 5: withdrawal. Probes fire inside the reject event, before the reload, then again after it.
    { const { context, page: p, seen } = await fresh(browser, { seed: accept() });
      await p.goto(`${SITE}/p`);
      ok(await p.evaluate(() => SiteConsent.allowed()), 'withdraw: control, allowed() is true before the press');
      await p.evaluate(({ h1 }) => {
        addEventListener('siteconsent', (e) => {
          if (e.detail !== 'reject') return;
          for (const [id, url] of h1) {
            const u = url + (url.includes('?') ? '&' : '?') + 'probe=' + encodeURIComponent('withdraw-event:' + id);
            try { fetch(new Request(u + '&t=fetch', { method: 'POST', body: 'p', mode: 'no-cors' })).catch(() => {}); } catch (x) { /* none */ }
            try { navigator.sendBeacon(u + '&t=beacon', 'p'); } catch (x) { /* none */ }
            try { const r = new XMLHttpRequest(); r.open('GET', u + '&t=xhr'); r.send(); } catch (x) { /* none */ }
            try { new Image().src = u + '&t=image'; } catch (x) { /* none */ }
          }
        });
      }, { h1: H1 });
      const reloaded = await Promise.all([p.waitForEvent('load', { timeout: 8000 }).then(() => true).catch(() => false), p.locator('[data-consent-withdraw]').click()]).then((r) => r[0]);
      const inEvent = H1.flatMap(([id]) => reached(seen, 'withdraw-event', id).map((s) => `${id}/${s.t}`));
      ok(reloaded && inEvent.length === 0, `withdraw: zero requests from the H1 spellings fired inside the reject event, before the reload (reloaded ${reloaded})`, inEvent);
      await checkDenied('withdrawn', p, seen); await context.close(); }
    // Allowed control: a valid accept; every H1 spelling and the vendor-script sends reach the sink.
    { const { context, page: p, seen } = await fresh(browser, { seed: accept() });
      await p.goto(`${SITE}/p`);
      ok(await p.evaluate(() => SiteConsent.allowed()), 'allowed: allowed() true after a valid accept');
      await fire(p, H1, 'allowed'); await p.waitForTimeout(700);
      const missing = H1.flatMap(([id]) => TRANSPORTS.filter((t) => !reached(seen, 'allowed', id).some((s) => s.t === t)).map((t) => `${id}/${t}`));
      ok(missing.length === 0, `allowed: control fires, all ${H1.length} vendor spellings x 4 transports reached the sink`, missing);
      for (const [, src] of VENDOR_SCRIPTS) await loadScript(p, src);
      await p.waitForTimeout(700);
      const vend = seen.filter((s) => /^vendor-/.test(s.probe || ''));
      ok(vend.length === 12, `allowed: H3 control, vendor scripts' sends to an unlisted host pass once allowed (${vend.length} of 12)`);
      await context.close(); }

    // H4 property test.
    const FAMILIES = ['google-analytics.com', 'region1.google-analytics.com', 'www.googletagmanager.com', 'analytics.google.com',
      'www.google.com', 'www.google.co.uk', 'google.de', 'www.google.com.au', 'www.google.com.br', 'www.google.co.jp', 'google.fr',
      'stats.g.doubleclick.net', 'www.googleadservices.com', 'pagead2.googlesyndication.com', 'www.googletagservices.com',
      'app-measurement.com', 'px.ads.linkedin.com', 'www.linkedin.com', 'snap.licdn.com', 'vitals.vercel-insights.com', 'va.vercel-scripts.com'];
    const LOOKALIKES = ['google-analytics.com.evil.invalid', 'notgoogle.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'evil-licdn.com',
      'linkedin.com.evil.test', 'xgoogle.co.uk', 'google.co.uk.evil.test', 'googlelinkedin.test', 'ordinary-host.test', 'vercel.app', 'mygoogle.de'];
    const fullwidth = (h) => h.replace(/[a-z]/, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
    const spell = (h) => [h, h.toUpperCase(), h.split('').map((c, i) => (i % 2 ? c.toUpperCase() : c)).join(''), h + '.', h.toUpperCase() + '.',
      `${h}:8443`, `${h}.:444`, `a.b.${h}`, fullwidth(h)];
    const cases = [];
    for (const h of FAMILIES) for (const s of spell(h)) cases.push({ url: `https://${s}/collect`, expect: true });
    for (const h of LOOKALIKES) for (const s of spell(h)) cases.push({ url: `https://${s}/collect`, expect: false });
    cases.push({ url: `${SITE}/_vercel/insights/event`, expect: true }, { url: `${SITE}/_vercel/insights`, expect: true },
      { url: `${SITE}/_vercel/insightsX`, expect: false }, { url: `${SITE}/api/assess`, expect: false }, { url: 'https://other.test/_vercel/insights/view', expect: true });
    const { context, page: p, seen } = await fresh(browser);
    await p.goto(`${SITE}/p`);
    await p.evaluate((cases) => { cases.forEach((c, i) => { const u = c.url + (c.url.includes('?') ? '&' : '?') + 'probe=prop:' + i + '&t=fetch'; fetch(u, { mode: 'no-cors' }).catch(() => {}); }); }, cases);
    await p.waitForTimeout(1500);
    const wrong = []; const drift = [];
    cases.forEach((c, i) => {
      const refusedInBrowser = !seen.some((s) => s.probe === `prop:${i}`);
      if (refusedInBrowser !== c.expect) wrong.push({ url: c.url, expect: c.expect, refused: refusedInBrowser });
      if (harnessVendorUrl(c.url, SITE) !== c.expect) drift.push({ url: c.url, expect: c.expect, harness: !c.expect });
    });
    ok(wrong.length === 0, `H4 property: ${cases.length} generated spellings (${FAMILIES.length} vendor families, ${LOOKALIKES.length} lookalikes, 9 spellings each), the gate refuses exactly the vendor ones while denied`, wrong);
    ok(drift.length === 0, 'H4 property: the harness classifier (vendor-hosts.mjs) agrees with the gate on every generated spelling', drift);
    await context.close();
  } finally {
    await browser.close();
  }
  if (OUT) writeFileSync(OUT, JSON.stringify({ measured_at: new Date().toISOString(), failures, results }, null, 2) + '\n');
  console.log(`guard-hosts: ${results.length - failures} of ${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
