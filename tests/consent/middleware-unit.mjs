/**
 * Edge-step unit checks for dominusos.ai's Vercel Routing Middleware (middleware.js), offline. No browser, no network:
 * the middleware function is called directly, its matcher is compiled with the Vercel CLI's own routing-utils
 * sourceToRegex (VERCEL_CLI_DIST, as static-server.mjs does), and then the same requests go through a local
 * static-server.mjs to show the Set-Cookie lines reach a response, 404s included.
 *
 *   node tests/consent/middleware-unit.mjs
 *   CONSENT_ROOT=/path/to/base/checkout node tests/consent/middleware-unit.mjs   # RED: a checkout with no middleware.js
 *
 * M1  the matcher covers every document path (/, /whitepaper, /privacy, the *.html files, dotted and odd 404s) and
 *     exempts only /assets/, /icons/ and /consent/.
 * M2  classification: a document navigation (Sec-Fetch-Dest document/iframe/frame, or no Sec-Fetch-Dest and Accept
 *     text/html) gets the cookies; a subresource (script, style, image, font, empty, or Accept without text/html) gets
 *     none and is passed through with next().
 * M3  the region cookie: __Host-consent_region=<ask|default>.<epoch seconds now>, Path=/, Max-Age=86400, SameSite=Lax,
 *     Secure, NO Domain, not HttpOnly (what the __Host- prefix and consent.js need); US/CA default, DE/GB/CH/NO,
 *     missing, empty, XX, lower-case garbage ask.
 * M4  GPC: Sec-GPC: 1 sets consent_gpc=1 (Secure, a day); a later request without it clears an existing cookie; no
 *     header and no cookie touches nothing.
 * M5  through static-server.mjs: the cookies reach the response on /, /privacy, /whitepaper.html and on a dotted 404
 *     (/review.missing) and an odd one (/api.review); a stylesheet request carries none.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.env.CONSENT_ROOT || new URL('../../', import.meta.url).pathname);
const DIST = process.env.VERCEL_CLI_DIST || '/Users/marklord/.npm/_npx/c5e9bca3acff8f7b/node_modules/vercel/dist/chunks';
let failures = 0; const results = [];
const ok = (c, l, d) => { results.push({ ok: !!c, l }); if (c) console.log(`  ok   ${l}`); else { failures += 1; console.error(`  FAIL ${l}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`); } };

let mod;
try { mod = await import(pathToFileURL(join(ROOT, 'middleware.js')).href); } catch (e) {
  ok(false, `middleware.js loads from ${ROOT} (${String(e.message).split('\n')[0]})`);
  console.log(`middleware-unit: ${results.length - failures} of ${results.length} checks passed`); process.exit(1);
}
const { sourceToRegex } = (await import(DIST + '/chunk-332LMJLZ.js')).require_dist();
const matchers = [].concat(mod.config.matcher).map((m) => new RegExp(sourceToRegex(m).src));
const matched = (p) => matchers.some((re) => re.test(p));

// M1
for (const p of ['/', '/whitepaper', '/privacy', '/index.html', '/whitepaper.html', '/privacy.html', '/review.missing', '/api.review', '/apiculture',
  '/api/review.missing', '/_next/review.missing', '/whitepaper/', '/a/b/c.d', '/styles.css', '/favicon.ico', '/DominusOS_White_Paper_v3.pdf', '/assetsx', '/consent-region.mjs'])
  ok(matched(p), `M1 matcher covers ${p}`);
for (const p of ['/assets/site.js', '/assets/brand/dominusos-shield-96.png', '/icons/pwa/icon-192.png', '/consent/consent.js', '/assets/review.missing'])
  ok(!matched(p), `M1 matcher exempts ${p}`);

const call = async (headers = {}) => {
  const r = await mod.default(new Request('https://dominusos.ai/', { headers }));
  return { next: r.headers.get('x-middleware-next'), cookies: r.headers.getSetCookie() };
};
const NAV = { 'sec-fetch-dest': 'document', accept: 'text/html,application/xhtml+xml' };
const region = (cs) => cs.filter((c) => c.startsWith('__Host-consent_region='));
const now = () => Math.floor(Date.now() / 1000);

// M2
for (const [label, h, want] of [
  ['Sec-Fetch-Dest document', { 'sec-fetch-dest': 'document' }, true], ['Sec-Fetch-Dest iframe', { 'sec-fetch-dest': 'iframe' }, true],
  ['Sec-Fetch-Dest frame', { 'sec-fetch-dest': 'frame' }, true], ['no Sec-Fetch-Dest, Accept text/html (older browser)', { accept: 'text/html' }, true],
  ['Sec-Fetch-Dest script', { 'sec-fetch-dest': 'script', accept: 'text/html' }, false], ['Sec-Fetch-Dest style', { 'sec-fetch-dest': 'style' }, false],
  ['Sec-Fetch-Dest image', { 'sec-fetch-dest': 'image' }, false], ['Sec-Fetch-Dest empty (fetch/XHR)', { 'sec-fetch-dest': 'empty', accept: 'text/html' }, false],
  ['no Sec-Fetch-Dest, Accept */*', { accept: '*/*' }, false], ['no headers at all', {}, false],
]) {
  const r = await call({ ...h, 'x-vercel-ip-country': 'US', 'sec-gpc': '1' });
  ok(r.next === '1' && (want ? region(r.cookies).length === 1 && r.cookies.some((c) => c.startsWith('consent_gpc=1;')) : r.cookies.length === 0),
    `M2 ${label}: ${want ? 'document, region and GPC cookies set' : 'subresource, passed through with no cookie'}`, r);
}

// M3
for (const [country, want] of [['US', 'default'], ['CA', 'default'], ['JP', 'default'], ['DE', 'ask'], ['GB', 'ask'], ['CH', 'ask'], ['NO', 'ask'], ['FR', 'ask'],
  [null, 'ask'], ['', 'ask'], ['XX', 'ask'], ['T1', 'ask'], ['xk', 'ask'], ['USA', 'ask']]) {
  const t0 = now();
  const r = await call(country === null ? NAV : { ...NAV, 'x-vercel-ip-country': country });
  const rc = region(r.cookies);
  const m = rc.length === 1 && rc[0].match(/^__Host-consent_region=(ask|default)\.(\d+); (.*)$/);
  const attrs = m ? m[3].split('; ') : [];
  ok(m && m[1] === want && +m[2] >= t0 && +m[2] <= now(), `M3 country ${JSON.stringify(country)}: ${want}.<now>`, rc);
  if (country === 'US' || country === 'DE') {
    ok(m && attrs.includes('Path=/') && attrs.includes('Max-Age=86400') && attrs.includes('SameSite=Lax') && attrs.includes('Secure') &&
      !attrs.some((a) => /^domain=/i.test(a)) && !attrs.some((a) => /^httponly$/i.test(a)), `M3 ${country}: Path=/, Max-Age=86400, SameSite=Lax, Secure, no Domain, not HttpOnly`, rc);
  }
}

// M4
{ const r = await call({ ...NAV, 'sec-gpc': '1' });
  const g = r.cookies.filter((c) => c.startsWith('consent_gpc='));
  ok(g.length === 1 && g[0] === 'consent_gpc=1; Path=/; Max-Age=86400; SameSite=Lax; Secure', 'M4 Sec-GPC: 1 sets consent_gpc=1 for a day, Secure', g); }
{ const r = await call({ ...NAV, cookie: 'a=1; consent_gpc=1' });
  const g = r.cookies.filter((c) => c.startsWith('consent_gpc='));
  ok(g.length === 1 && /^consent_gpc=; Path=\/; Max-Age=0;/.test(g[0]), 'M4 no Sec-GPC with an existing consent_gpc cookie: cleared', g); }
{ const r = await call({ ...NAV, cookie: 'xconsent_gpc=1' });
  ok(!r.cookies.some((c) => c.startsWith('consent_gpc=')), 'M4 no Sec-GPC and no consent_gpc cookie (only a look-alike name): nothing set or cleared', r.cookies); }
{ const r = await call({ ...NAV, 'sec-gpc': '0' });
  ok(!r.cookies.some((c) => c.startsWith('consent_gpc=1')), 'M4 Sec-GPC: 0 is not a signal', r.cookies); }

// M5
{ const { startServer } = await import('./static-server.mjs');
  const port = 4600 + Math.floor(Math.random() * 300);
  const server = await startServer(ROOT, port);
  try {
    for (const [p, status] of [['/', 200], ['/privacy', 200], ['/whitepaper.html', 200], ['/review.missing', 404], ['/api.review', 404]]) {
      const r = await fetch(`http://localhost:${port}${p}`, { headers: { ...NAV, 'x-vercel-ip-country': 'DE', 'sec-gpc': '1' }, redirect: 'manual' });
      const sc = r.headers.getSetCookie();
      ok(r.status === status && region(sc).length === 1 && /^__Host-consent_region=ask\.\d+;/.test(region(sc)[0]) && sc.some((c) => c.startsWith('consent_gpc=1;')),
        `M5 ${p} (${r.status}): the response carries __Host-consent_region=ask.<now> and consent_gpc=1`, sc);
      await r.arrayBuffer();
    }
    const css = await fetch(`http://localhost:${port}/styles.css`, { headers: { 'sec-fetch-dest': 'style', 'x-vercel-ip-country': 'US' } });
    ok(css.status === 200 && region(css.headers.getSetCookie()).length === 0, 'M5 /styles.css as a stylesheet: no region cookie', css.headers.getSetCookie());
    await css.arrayBuffer();
  } finally { await new Promise((d) => server.close(d)); server.closeAllConnections && server.closeAllConnections(); }
}

console.log(`middleware-unit: ${results.length - failures} of ${results.length} checks passed`);
process.exit(failures ? 1 : 0);
