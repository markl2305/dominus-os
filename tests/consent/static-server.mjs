/**
 * Local static server for the consent matrix (compliance P1-1h). Serves a checkout of this repo the way Vercel serves
 * it: files from the root (outputDirectory "."), the exact-match `rewrites` in vercel.json, and an EMULATION of
 * vercel.json `headers` rules (source compiled with Vercel's own routing-utils sourceToRegex; `has`/`missing` of type
 * header and cookie). The emulation shows what the page does when the configured response header arrives. It is NOT
 * proof that Vercel's edge sends it: that needs a preview deployment.
 *
 *   node tests/consent/static-server.mjs <root> <port>
 */
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';

const DIST = process.env.VERCEL_CLI_DIST || '/Users/marklord/.npm/_npx/c5e9bca3acff8f7b/node_modules/vercel/dist/chunks';
const [root, port] = [resolve(process.argv[2] || '.'), +(process.argv[3] || 4491)];
let config = {};
try { config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')); } catch (e) { /* no config */ }
const rewrites = config.rewrites || [];
let headerRules = [];
if ((config.headers || []).length) {
  const { require_dist } = await import(DIST + '/chunk-332LMJLZ.js'); // ../routing-utils/dist/index.js
  const { sourceToRegex } = require_dist();
  headerRules = config.headers.map((r) => ({ ...r, re: new RegExp(sourceToRegex(r.source).src) }));
}
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

createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let path = requested;
  const rw = rewrites.find((r) => r.source === path);
  if (rw) path = rw.destination;
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    const extra = responseHeaders(req, requested); // Vercel matches header sources against the incoming path
    const setCookie = extra.filter((h) => h.key.toLowerCase() === 'set-cookie').map((h) => h.value);
    const head = { 'content-type': TYPES[extname(file)] || 'application/octet-stream' };
    for (const h of extra) if (h.key.toLowerCase() !== 'set-cookie') head[h.key] = h.value;
    if (setCookie.length) head['set-cookie'] = setCookie;
    res.writeHead(200, head);
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
  } catch (e) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404'); }
}).listen(port, '127.0.0.1', () => console.log(`static ${root} on http://localhost:${port}; emulated header rules: ${headerRules.length}`));
