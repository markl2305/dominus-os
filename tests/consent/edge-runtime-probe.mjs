/**
 * Runs middleware.js the way Vercel's Edge runtime would, offline: bundled with esbuild (edge-light/worker/browser
 * conditions, one IIFE) and executed inside Vercel's own `edge-runtime` VM, which has the Edge API surface and no
 * Node globals (no `process`). Both packages come from the local Vercel CLI install (VERCEL_CLI_MODULES, default the
 * npx cache copy of vercel@59.11.7). It proves the file bundles and runs without Node; it is NOT a deployment.
 * Found 2026-10-15: importing the package root '@vercel/functions' pulls in a module that reads process.env at load,
 * which throws in this VM; middleware.js imports the '@vercel/functions/middleware' subpath instead.
 *
 *   node tests/consent/edge-runtime-probe.mjs
 */
import { createRequire } from 'node:module';
const MODS = process.env.VERCEL_CLI_MODULES || '/Users/marklord/.npm/_npx/c5e9bca3acff8f7b/node_modules/';
const require = createRequire(MODS);
const esbuild = require('esbuild');
const { EdgeRuntime } = require('edge-runtime');
const entry = new URL('../../middleware.js', import.meta.url).pathname;
const out = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', globalName: 'MW', platform: 'browser', conditions: ['edge-light', 'worker', 'browser'], logLevel: 'silent' });
const rt = new EdgeRuntime();
rt.evaluate(out.outputFiles[0].text + `
globalThis.__run = async (h) => { const r = await MW.default(new Request('https://dominusos.ai/review.missing', { headers: h })); return { next: r.headers.get('x-middleware-next'), cookies: r.headers.getSetCookie() }; };`);
let fails = 0; const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
ok(rt.evaluate('typeof process') === 'undefined', 'the VM has no Node process global (an Edge-like runtime)');
const a = await rt.evaluate(`__run({ 'sec-fetch-dest': 'document', 'x-vercel-ip-country': 'US', 'sec-gpc': '1' })`);
ok(a.next === '1' && a.cookies.some((c) => /^__Host-consent_region=default\.\d+; Path=\/; Max-Age=86400; SameSite=Lax; Secure$/.test(c)) && a.cookies.includes('consent_gpc=1; Path=/; Max-Age=86400; SameSite=Lax; Secure'), `US document + Sec-GPC on a dotted path: region default and consent_gpc set (${JSON.stringify(a.cookies)})`);
const b = await rt.evaluate(`__run({ 'sec-fetch-dest': 'document', 'x-vercel-ip-country': 'DE' })`);
ok(b.next === '1' && b.cookies.length === 1 && /^__Host-consent_region=ask\.\d+;/.test(b.cookies[0]), `DE document: region ask only (${JSON.stringify(b.cookies)})`);
const c = await rt.evaluate(`__run({ 'sec-fetch-dest': 'image', 'x-vercel-ip-country': 'US' })`);
ok(c.next === '1' && c.cookies.length === 0, 'image subresource: next(), no cookie');
console.log(`edge-runtime-probe: ${4 - fails} of 4 checks passed`); process.exit(fails ? 1 : 0);
