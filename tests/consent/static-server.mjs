/**
 * Local static server for the consent matrix (compliance P1-1h). Serves a checkout of this repo the way Vercel serves
 * it: files from the root (outputDirectory "."), the exact-match `rewrites` in vercel.json, and an EMULATION of
 * vercel.json `headers` rules (source compiled with Vercel's own routing-utils sourceToRegex; `has`/`missing` of type
 * header and cookie). The emulation shows what the page does when the configured response header arrives. It is NOT
 * proof that Vercel's edge sends it: that needs a preview deployment.
 * Routing Middleware (2026-10-15): if <root>/middleware.js exists, it is imported and run the way Vercel runs it, BEFORE
 * the filesystem (so on 404s too), for every path its `config.matcher` matches (compiled with the same sourceToRegex).
 * The test's own request headers reach it, including the `x-vercel-ip-country` a harness adds in place of Vercel's edge.
 * Its response must be a `next()` (x-middleware-next: 1); its Set-Cookie lines are added to the response, after any
 * vercel.json header rule's. Anything else from it is a 500, so a broken middleware cannot pass silently.
 *
 *   node tests/consent/static-server.mjs <root> <port>
 *   import { startServer } from './static-server.mjs'; const server = await startServer(root, port);
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST = process.env.VERCEL_CLI_DIST || '/Users/marklord/.npm/_npx/c5e9bca3acff8f7b/node_modules/vercel/dist/chunks';
const require_dist = async () => (await import(DIST + '/chunk-332LMJLZ.js')).require_dist(); // ../routing-utils/dist/index.js
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json', '.md': 'text/markdown' };

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim()).filter(Boolean).map((c) => [c.split('=')[0], c.slice(c.indexOf('=') + 1)]));
}
function cond(req, c) {
  const v = c.type === 'header' ? req.headers[c.key.toLowerCase()] : c.type === 'cookie' ? cookies(req)[c.key] : undefined;
  if (v === undefined) return false;
  return c.value === undefined || v === c.value;
}

export async function startServer(rootArg, port) {
  const root = resolve(rootArg || '.');
  let config = {};
  try { config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')); } catch (e) { /* no config */ }
  const rewrites = config.rewrites || [];
  let headerRules = [];
  let mw = null;
  const mwFile = join(root, 'middleware.js');
  if ((config.headers || []).length || existsSync(mwFile)) {
    const { sourceToRegex } = await require_dist();
    headerRules = (config.headers || []).map((r) => ({ ...r, re: new RegExp(sourceToRegex(r.source).src) }));
    if (existsSync(mwFile)) {
      const mod = await import(pathToFileURL(mwFile).href);
      const matchers = [].concat((mod.config && mod.config.matcher) || ['/:path*']).map((m) => new RegExp(sourceToRegex(m).src));
      mw = { fn: mod.default, matchers };
    }
  }
  function responseHeaders(req, path) {
    const out = [];
    for (const r of headerRules) {
      if (!r.re.test(path)) continue;
      if ((r.has || []).some((c) => !cond(req, c))) continue;
      if ((r.missing || []).some((c) => cond(req, c))) continue;
      out.push(...r.headers);
    }
    return out;
  }
  async function middlewareCookies(req, path) {
    if (!mw || !mw.matchers.some((re) => re.test(path))) return [];
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const r = await mw.fn(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers }));
    if (!r || r.headers.get('x-middleware-next') !== '1') throw new Error('middleware did not return next()');
    return r.headers.getSetCookie();
  }

  const server = createServer(async (req, res) => {
    const requested = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let mwCookies;
    try { mwCookies = await middlewareCookies(req, requested); } catch (e) { res.writeHead(500, { 'content-type': 'text/plain' }); return res.end('middleware error: ' + e.message); }
    let path = requested;
    const rw = rewrites.find((r) => r.source === path);
    if (rw) path = rw.destination;
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
    try {
      if (!statSync(file).isFile()) throw new Error('not a file');
      const extra = responseHeaders(req, requested); // Vercel matches header sources against the incoming path
      const setCookie = [...extra.filter((h) => h.key.toLowerCase() === 'set-cookie').map((h) => h.value), ...mwCookies];
      const head = { 'content-type': TYPES[extname(file)] || 'application/octet-stream' };
      for (const h of extra) if (h.key.toLowerCase() !== 'set-cookie') head[h.key] = h.value;
      if (setCookie.length) head['set-cookie'] = setCookie;
      res.writeHead(200, head);
      res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
    } catch (e) {
      const head = { 'content-type': 'text/plain' };
      if (mwCookies.length) head['set-cookie'] = mwCookies; // Vercel's middleware runs before the filesystem, 404s included
      res.writeHead(404, head); res.end('404');
    }
  });
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  console.log(`static ${root} on http://localhost:${port}; emulated header rules: ${headerRules.length}; middleware: ${mw ? 'yes' : 'none'}`);
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await startServer(process.argv[2] || '.', +(process.argv[3] || 4491));
}
