// WebKit from Playwright 1.56.1 (WK_PLAYWRIGHT, default Mark's wk directory).
const { webkit } = await import(process.env.WK_PLAYWRIGHT || '/private/tmp/claude-501/-Users-marklord-Developer/3e94b30f-65b0-4f30-94e2-f522cf246150/scratchpad/wk/node_modules/playwright/index.mjs');
// dominusos.ai port (2026-10-15) of hiresabina's wk-r4.mjs (geo-1014-r8). WebKit 1.56.1 against a local
// static-server.mjs of the checkout (middleware.js run as Vercel would), started IN THIS PROCESS and closed at the end,
// reached as https://dominusos.test: WebKit refuses a Secure (__Host-) cookie from http://localhost.
//   PORT=<port> DIR=<evidence dir> node tests/consent/webkit-geo.mjs   (ROOT defaults to this checkout; SERVE_ROOT serves another tree)
import { writeFileSync, mkdirSync } from 'node:fs';
const ROOT = process.env.ROOT || new URL('../../', import.meta.url).pathname.replace(/\/$/, ''); const PORT = +process.env.PORT; const DIR = process.env.DIR; mkdirSync(DIR, { recursive: true });
const { startServer } = await import(ROOT + '/tests/consent/static-server.mjs');
const server = await startServer(process.env.SERVE_ROOT || ROOT, PORT);
const ORIGIN = `http://localhost:${PORT}`;
const SITE = 'https://dominusos.test';
const ROUTES = ['/', '/whitepaper', '/privacy'];
// RED control for the site.js nav fix: OLD_SITEJS=<path> serves that file as /assets/site.js.
const OLD_SITEJS = process.env.OLD_SITEJS ? (await import('node:fs')).readFileSync(process.env.OLD_SITEJS, 'utf8') : null;
let fails = 0; const rows = [];
const ok = (c, m) => { rows.push({ ok: !!c, m }); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const still = (p) => p.evaluate(() => new Promise((res) => { let y = scrollY, n = 0; const t = setInterval(() => { if (scrollY === y) { if (++n >= 3) { clearInterval(t); res(); } } else { y = scrollY; n = 0; } }, 60); setTimeout(() => { clearInterval(t); res(); }, 2000); }));
const measure = (p) => p.evaluate(() => {
  const bar = document.querySelector('[data-consent-bar]');
  const nav = document.getElementById('nav');
  const out = { navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null, overflowX: document.documentElement.scrollWidth - innerWidth, vh: innerHeight, links: document.querySelectorAll('footer [data-consent-open]').length, st: window.SiteConsent ? window.SiteConsent.state() : 'no-api' };
  const cta = document.querySelector('[data-hero] .btn-solid, [data-hero] .btn'); if (cta) { const r = cta.getBoundingClientRect(); out.cta = { top: Math.round(r.top), bottom: Math.round(r.bottom) }; }
  if (!bar) return out;
  const br = bar.getBoundingClientRect(); out.bar = { top: Math.round(br.top), bottom: Math.round(br.bottom), pos: getComputedStyle(bar).position, reopened: bar.hasAttribute('data-consent-reopened') };
  const SEL = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"]),[role="button"],[role="link"]';
  const els = []; const walk = (root) => { root.querySelectorAll(SEL).forEach((e) => els.push(e)); root.querySelectorAll('*').forEach((e) => e.shadowRoot && walk(e.shadowRoot)); }; walk(document);
  const inBar = (el) => { for (let n = el; n; n = n.parentNode || n.host) if (n === bar) return true; return false; };
  const deepAt = (x, y) => { let el = document.elementFromPoint(x, y); while (el && el.shadowRoot) { const i = el.shadowRoot.elementFromPoint(x, y); if (!i || i === el) break; el = i; } return el; };
  out.under = []; // hit test: the control's centre or the intersection's centre lands on the bar
  for (const e of els) {
    if (inBar(e)) continue;
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    if (r.width < 1 || r.height < 1 || s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') continue;
    const ix = Math.max(r.left, br.left), iy = Math.max(r.top, br.top), ax = Math.min(r.right, br.right), ay = Math.min(r.bottom, br.bottom);
    if (ax - ix < 1 || ay - iy < 1) continue;
    const pts = [[(ix + ax) / 2, (iy + ay) / 2], [r.left + r.width / 2, r.top + r.height / 2]];
    if (pts.some(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && inBar(deepAt(x, y) || document.body))) out.under.push(`${e.tagName.toLowerCase()} "${(e.textContent || '').trim().slice(0, 30)}"`);
  }
  out.obscured = [...bar.querySelectorAll('button,a')].filter((b) => { const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false; const t = deepAt(x, y); return !(t === b || b.contains(t)); }).map((b) => b.textContent.trim());
  if (out.cta) out.ctaAboveBar = out.cta.bottom <= br.top;
  return out;
});
const b = await webkit.launch();
// WK_VIEWPORTS (default 390x844,1440x900); review DOS-1 asked for 320/390/768/1440.
const VIEWPORTS = (process.env.WK_VIEWPORTS || '390x844,1440x900').split(',').map((v) => { const [width, height] = v.split('x').map(Number); return { width, height }; });
for (const vp of VIEWPORTS) {
  for (const country of ['US', 'DE']) {
    for (const route of ROUTES) {
      const ctx = await b.newContext({ viewport: vp, extraHTTPHeaders: { 'x-vercel-ip-country': country } });
      await ctx.route('**/*', async (r) => {
        const u = new URL(r.request().url());
        if (u.protocol === 'blob:' || u.protocol === 'data:') return r.continue(); // in-page objects, not network
        if (u.origin !== SITE) return r.abort();
        if (r.request().method() !== 'GET') return r.fulfill({ status: 204, body: '' });
        if (OLD_SITEJS !== null && u.pathname === '/assets/site.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: OLD_SITEJS });
        try {
          const res = await r.fetch({ url: ORIGIN + u.pathname + u.search, maxRedirects: 0 });
          // Playwright's WebKit does not store Set-Cookie from a fulfilled response, nor cookies added through the context
          // API (measured 2026-10-14; document.cookie on https does work). So on a navigation the server's own Set-Cookie
          // lines are replayed through document.cookie by a script placed first in <head>, before the gate runs.
          const sc = (await res.headersArray()).filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
          const ct = (await res.headersArray()).find((h) => h.name.toLowerCase() === 'content-type');
          if (r.request().isNavigationRequest() && sc.length && ct && /text\/html/.test(ct.value)) {
            const html = await res.text();
            const inject = '<script>' + sc.map((v) => 'document.cookie=' + JSON.stringify(v.replace(/;\s*Expires=[^;]*/i, ''))).join(';') + '</script>';
            const body = html.replace(/<head([^>]*)>/i, (m) => m + inject);
            const headers = Object.fromEntries((await res.headersArray()).filter((h) => !/^(set-cookie|content-length|content-encoding)$/i.test(h.name)).map((h) => [h.name, h.value]));
            return r.fulfill({ status: res.status(), headers, body });
          }
          return r.fulfill({ response: res });
        }
        catch (e) { console.log('  route.fetch failed for', u.href, '->', String(e.message).split('\n')[0]); return r.abort(); }
      });
      const p = await ctx.newPage(); await p.goto(SITE + route, { waitUntil: 'load' });
      if (country === 'DE') await p.waitForSelector('[data-consent-bar]', { timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(700);
      const tag = `${vp.width}x${vp.height} ${country} ${route}`; const shot = `${DIR}/wk-${vp.width}-${country}-${route.replace(/\W/g, '') || 'home'}`;
      const s0 = await measure(p);
      ok(s0.overflowX <= 0, `${tag}: zero horizontal overflow on load (${s0.overflowX})`);
      ok(s0.links === 1, `${tag}: one footer "Your privacy choices" link (${s0.links})`);
      if (s0.cta) ok(s0.cta.top >= 0 && s0.cta.bottom <= s0.vh && s0.ctaAboveBar !== false, `${tag}: hero CTA on the first screen${s0.bar ? ', above the bar' : ''} (${JSON.stringify(s0.cta)})`);
      if (country === 'DE') {
        ok(s0.bar && s0.st === null, `${tag}: ask-first bar shown (state ${s0.st})`);
        ok(s0.bar && s0.under.length === 0 && s0.obscured.length === 0, `${tag}: nothing under the bar at the top (${s0.under && s0.under.join('; ')}; obscured ${s0.obscured && s0.obscured.join('; ')})`);
        await p.screenshot({ path: `${shot}-top.png` });
        await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })); await still(p);
        const s1 = await measure(p);
        ok(s1.bar && s1.under.length === 0 && s1.obscured.length === 0 && s1.overflowX <= 0, `${tag}: nothing under the bar at the bottom, no overflow (${s1.under && s1.under.join('; ')}; ${s1.overflowX})`);
      } else {
        ok(!s0.bar && s0.st === 'default', `${tag}: no bar on first load, state default (${s0.st})`);
      }
      // In the ask-first region the link focuses the first-visit bar while it is up (by design); make a choice first.
      if (country === 'DE' && s0.bar) { await p.locator('[data-consent-bar] [data-consent="reject"]').click(); await p.waitForTimeout(300); }
      // Re-open from the footer link (both regions): in the page flow, in view, nothing under it, then Close.
      const link = p.locator('footer [data-consent-open]').first(); await link.scrollIntoViewIfNeeded(); await link.click();
      await p.waitForSelector('[data-consent-reopened]', { timeout: 4000 }).catch(() => {}); await still(p);
      const s2 = await measure(p);
      const reopened = s2.bar && s2.bar.reopened;
      ok(reopened && s2.bar.top >= 0 && s2.bar.bottom <= s2.vh + 1 && p.url() === SITE + route, `${tag}: the footer link re-opens the choice in place, in view (${JSON.stringify(s2.bar)}, url ${p.url()})`);
      ok(reopened && s2.navTop === 0, `${tag}: the fixed nav stays at the top while the re-opened choice is up (nav top ${s2.navTop})`);
      ok(reopened && s2.under.length === 0 && s2.obscured.length === 0 && s2.overflowX <= 0, `${tag}: re-opened choice covers no control, is not covered, no overflow (${s2.under && s2.under.join('; ')}; obscured ${s2.obscured && s2.obscured.join('; ')}; ${s2.overflowX})`);
      // Review DOS-1: the footer's NVIDIA badge, NVIDIA trademark line must not be under the
      // re-opened choice, where it leaves the visitor and at the very bottom of the page.
      const footerItems = () => p.evaluate(() => {
        const bar = document.querySelector('[data-consent-reopened]'); if (!bar) return { bar: false };
        const br = bar.getBoundingClientRect();
        const items = { nvBadge: document.querySelector('footer .nv-badge'), nvLegal: document.querySelector('footer .nv-legal') };
        const out = { bar: true };
        for (const [k, el] of Object.entries(items)) {
          if (!el) { out[k] = 'missing'; continue; }
          const r = el.getBoundingClientRect();
          const overlap = Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top) > 0 && Math.min(r.right, br.right) - Math.max(r.left, br.left) > 0;
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const visible = cy >= 0 && cy < innerHeight && cx >= 0 && cx < innerWidth;
          const hit = visible ? document.elementFromPoint(cx, cy) : null;
          out[k] = { overlapBar: overlap, visible, hitSelf: visible ? !!(hit && (hit === el || el.contains(hit))) : null };
        }
        return out;
      });
      const fOpen = await footerItems();
      await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })); await still(p);
      const fBottom = await footerItems();
      const fine = (f) => f.bar && ['nvBadge', 'nvLegal'].every((k) => f[k] && f[k] !== 'missing' && !f[k].overlapBar && f[k].hitSelf !== false);
      ok(fine(fOpen) && fine(fBottom), `${tag}: NVIDIA badge, NVIDIA trademark line present and not under the re-opened choice (open ${JSON.stringify(fOpen)}; bottom ${JSON.stringify(fBottom)})`);
      await p.screenshot({ path: `${shot}-reopened.png` });
      if (reopened) {
        await p.locator('[data-consent-reopened] [data-consent-close]').click(); await p.waitForTimeout(250);
        const s3 = await measure(p);
        ok(!s3.bar && s3.overflowX <= 0, `${tag}: Close removes it, no overflow (${JSON.stringify(s3.bar)}; ${s3.overflowX})`);
      }
      await ctx.close();
    }
  }
}
await b.close();
await new Promise((d) => server.close(d)); server.closeAllConnections && server.closeAllConnections();
writeFileSync(`${DIR}/webkit.json`, JSON.stringify({ origin: SITE + ' -> ' + ORIGIN, engine: 'webkit 1.56.1', rows }, null, 2));
console.log(`webkit: ${rows.length - fails} of ${rows.length} checks passed`); process.exit(fails ? 1 : 0);
