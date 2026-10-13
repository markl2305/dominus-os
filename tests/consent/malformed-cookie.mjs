/**
 * Malformed consent cookies (anvil gate-v2 R3 F4). Offline: a browser route serves a page and
 * consent/consent.js (CONSENT_GATE_PATH); every other request is answered by a local sink (recorded, never delivered).
 *
 *   node tests/consent/malformed-cookie.mjs
 *   CONSENT_GATE_FILE=/path/to/older/consent.js node tests/consent/malformed-cookie.mjs   # RED on an older gate
 *
 * M1  For each malformed value (a lone "%", truncated escapes, invalid encoded UTF-8, a valid choice prefix with a
 *     malformed tail) in the configured consent cookie AND in consent_gpc, with no valid choice anywhere: the gate
 *     loads without a page error, state() is null, allowed() is false; listed-family vendor requests stay refused;
 *     the site's own chat POST (fetch), assessment POST (XHR), a first-party beacon and image, and off-origin
 *     font / badge requests all work through fetch, sendBeacon, XHR and image .src with no exception.
 * M2  Precedence and GPC are preserved: a valid local-storage Accept still wins over a malformed cookie; a valid
 *     cookie Accept still counts; consent_gpc=1 (header-derived, as the server sets it) and the navigator signal
 *     still mean GPC even with a malformed consent cookie; a percent-encoded valid value still decodes.
 * VERSION stays 1 and a fresh choice is still saved as 1.<choice>.<timestamp>.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ROOT = new URL('../../', import.meta.url);
const GATE = readFileSync(process.env.CONSENT_GATE_FILE || new URL(process.env.CONSENT_GATE_PATH || 'consent/consent.js', ROOT), 'utf8');
const OUT = process.env.CONSENT_OUT || '';
const SITE = 'http://malformed-cookie.test';
const KEY = 'mc-consent';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const BAD = ['%', '%E0%A4', '%E0%A4%A', '%C3%28', '%FF%FE', '1.accept.%'];
const TRANSPORTS = ['fetch', 'beacon', 'xhr', 'image'];
const VENDOR = [['ga', 'https://region1.google-analytics.com/g/collect'], ['aud', 'https://www.google.de/ads/ga-audiences'], ['li', 'https://px.ads.linkedin.com/collect']];
const OTHER = [['fonts', 'https://fonts.googleapis.com/css2'], ['badge', 'https://locatefaith.com/brand/badge.svg']];

let failures = 0; const results = [];
function ok(cond, label, detail) { results.push({ ok: !!cond, label, detail }); if (cond) console.log(`  ok   ${label}`); else { failures += 1; console.error(`  FAIL ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 500) : ''}`); } }

const page = () => `<!doctype html><html><head><meta charset="utf-8"><title>mc</title>
<script>window.CONSENT_CONFIG=${JSON.stringify({ storageKey: KEY, privatePaths: '^/(chat)(/|$)', autoBar: false })};</script>
<script src="/consent/consent.js"></script></head><body><main>mc</main></body></html>`;

async function fresh(browser, { cookies = [], local = null, gpc = false } = {}) {
  const context = await browser.newContext({ userAgent: UA, serviceWorkers: 'block' });
  if (cookies.length) await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: SITE })));
  await context.addInitScript(({ site, local, gpc, key }) => {
    if (location.origin !== site) return;
    if (local) localStorage.setItem(key, local);
    if (gpc) Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true });
  }, { site: SITE, local, gpc, key: KEY });
  const seen = []; const errors = [];
  await context.route('**/*', async (route) => {
    const q = route.request(); const u = new URL(q.url());
    if (u.origin === SITE && u.pathname === '/p' && q.isNavigationRequest()) return route.fulfill({ status: 200, contentType: 'text/html', body: page() });
    if (u.origin === SITE && u.pathname === '/consent/consent.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: GATE });
    seen.push({ url: q.url(), method: q.method(), probe: u.searchParams.get('probe'), t: u.searchParams.get('t') });
    if (u.origin === SITE && q.method() === 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(String(e.message || e)));
  await p.goto(`${SITE}/p`); await p.waitForTimeout(300);
  return { context, page: p, seen, errors };
}
// Every transport for every URL; returns what each call did (a status, true/false, 'sent', or the exception).
const fire = (p, list, tag) => p.evaluate(async ({ list, tag, transports }) => {
  const out = {};
  for (const [id, url, method] of list) {
    for (const t of transports) {
      const u = url + (url.includes('?') ? '&' : '?') + 'probe=' + encodeURIComponent(tag + ':' + id) + '&t=' + t;
      const k = id + '/' + t;
      try {
        if (t === 'fetch') out[k] = await fetch(u, { method: method || 'POST', body: method === 'GET' ? undefined : 'probe', mode: u.startsWith(location.origin) ? 'same-origin' : 'no-cors' }).then((r) => 'status ' + r.status, (e) => 'rejected ' + e.message);
        if (t === 'beacon') out[k] = navigator.sendBeacon(u, 'probe');
        if (t === 'xhr') { const x = new XMLHttpRequest(); x.open(method || 'POST', u); x.send(method === 'GET' ? null : 'probe'); out[k] = 'sent'; }
        if (t === 'image') { const im = new Image(); im.src = u; out[k] = 'sent'; }
      } catch (e) { out[k] = 'THREW ' + e.name + ': ' + e.message; }
    }
  }
  return out;
}, { list, tag, transports: TRANSPORTS });
// Never throws: on a gate that throws, the result records it and the check fails instead of aborting the run.
const read = (p) => p.evaluate(() => { try { return { state: SiteConsent.state(), allowed: SiteConsent.allowed() }; } catch (e) { return { threw: e.name + ': ' + e.message }; } }).catch((e) => ({ threw: String(e.message || e) }));
const reached = (seen, tag, id) => seen.filter((s) => s.probe === `${tag}:${id}`);
const FIRST_PARTY = [['chat', `${SITE}/api/visitor-chat/message`], ['assess', `${SITE}/api/assess`], ['relative', '/api/evaluate/site'], ['sink', `${SITE}/sink`, 'GET']];

async function main() {
  const browser = await chromium.launch();
  try {
    // M1
    for (const cookie of [KEY, 'consent_gpc']) {
      for (const bad of BAD) {
        const name = `${cookie}=${bad}`;
        const { context, page: p, seen, errors } = await fresh(browser, { cookies: [[cookie, bad]] });
        const raw = await p.evaluate(() => document.cookie);
        ok(raw.includes(bad), `${name}: control, the browser holds the malformed cookie (${raw})`);
        const st = await p.evaluate(() => { try { return { gate: !!window.SiteConsent, state: SiteConsent.state(), allowed: SiteConsent.allowed() }; } catch (e) { return { threw: e.name + ': ' + e.message }; } });
        ok(errors.length === 0 && st.gate && st.state === null && st.allowed === false, `${name}: the gate loads with no page error, state() null, allowed() false`, { st, errors });
        const fp = await fire(p, [...FIRST_PARTY, ...OTHER], name);
        const vend = await fire(p, VENDOR, name);
        await p.waitForTimeout(600);
        const threw = Object.entries({ ...fp, ...vend }).filter(([, v]) => String(v).startsWith('THREW'));
        ok(threw.length === 0, `${name}: no transport throws (${Object.keys(fp).length + Object.keys(vend).length} calls)`, threw);
        const missing = [...FIRST_PARTY, ...OTHER].flatMap(([id]) => TRANSPORTS.filter((t) => !reached(seen, name, id).some((s) => s.t === t)).map((t) => `${id}/${t}`));
        ok(missing.length === 0 && fp['chat/fetch'] === 'status 200' && fp['assess/xhr'] === 'sent' && fp['chat/beacon'] === true,
          `${name}: chat POST (fetch 200), assessment POST (XHR), first-party beacon and image, fonts and badge all reach their sinks through all 4 transports`, { missing, chat: fp['chat/fetch'], assess: fp['assess/xhr'], beacon: fp['chat/beacon'] });
        const leaked = VENDOR.flatMap(([id]) => reached(seen, name, id).map((s) => `${id}/${s.t}`));
        ok(leaked.length === 0, `${name}: listed-family vendor requests stay refused (${VENDOR.length} x 4)`, leaked);
        await context.close();
      }
    }
    // M2
    const now = Date.now();
    { const { context, page: p, seen, errors } = await fresh(browser, { cookies: [[KEY, '%']], local: `1.accept.${now}` });
      const st = await read(p);
      await fire(p, VENDOR, 'local-accept').catch(() => {}); await p.waitForTimeout(600);
      ok(errors.length === 0 && st.state === 'accept' && st.allowed === true && reached(seen, 'local-accept', 'ga').length === 4,
        'precedence: a valid local-storage Accept still wins over a malformed cookie; vendor requests then reach the sink (allowed control)', { st, errors });
      await context.close(); }
    { const { context, page: p } = await fresh(browser, { cookies: [[KEY, `1.accept.${now}`]] });
      const st = await read(p);
      ok(st.state === 'accept' && st.allowed === true, 'precedence: a valid cookie-only Accept still counts', st);
      await context.close(); }
    { const { context, page: p } = await fresh(browser, { cookies: [[KEY, encodeURIComponent(`1.accept.${now}`).replace(/\./g, '%2E')]] });
      const st = (await read(p)).state;
      ok(st === 'accept', `precedence: a percent-encoded valid cookie value still decodes (${st})`);
      await context.close(); }
    { const { context, page: p } = await fresh(browser, { cookies: [['consent_gpc', '1'], [KEY, '%E0%A4']], local: `1.accept.${now}` });
      const st = await read(p);
      ok(st.state === 'gpc' && st.allowed === false, 'GPC: consent_gpc=1 (the header-derived cookie) still overrides a stored Accept, with a malformed consent cookie', st);
      await context.close(); }
    { const { context, page: p } = await fresh(browser, { cookies: [['consent_gpc', '%']], local: `1.accept.${now}`, gpc: true });
      const st = await read(p);
      ok(st.state === 'gpc' && st.allowed === false, 'GPC: navigator.globalPrivacyControl still overrides a stored Accept, with a malformed consent_gpc', st);
      await context.close(); }
    { const { context, page: p } = await fresh(browser, { cookies: [['consent_gpc', '%']], local: `1.accept.${now}` });
      const st = await read(p);
      ok(st.state === 'accept' && st.allowed === true, 'GPC: a malformed consent_gpc is no signal (a valid stored Accept stands)', st);
      await context.close(); }
    { const { context, page: p } = await fresh(browser, { cookies: [[KEY, '%']] });
      const saved = await p.evaluate(() => { try { SiteConsent.set('reject'); } catch (e) { /* recorded below */ } return { local: localStorage.getItem('mc-consent'), version: window.SiteConsent && SiteConsent.version, cookie: document.cookie }; });
      ok(saved.version === 1 && /^1\.reject\.\d{13}$/.test(saved.local) && /mc-consent=1\.reject\.\d{13}/.test(saved.cookie), `format: a fresh choice over a malformed cookie is saved as 1.reject.<timestamp> in both stores, VERSION 1 (${saved.local})`, saved);
      await context.close(); }
  } finally {
    await browser.close();
  }
  if (OUT) writeFileSync(OUT, JSON.stringify({ measured_at: new Date().toISOString(), failures, results }, null, 2) + '\n');
  console.log(`malformed-cookie: ${results.length - failures} of ${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
