/**
 * Offline check of vercel.json (compliance P1-1h sync round, 2026-10-13). Uses the Vercel CLI's OWN validator and
 * route compiler as libraries, from an already-present package (VERCEL_CLI_DIST, default: the npx cache copy of
 * vercel@59.11.7). It makes no network call and runs no CLI command. What it proves: the config passes Vercel's JSON
 * schema, every header source compiles the way Vercel compiles it, and each rule's source regex matches the paths
 * it should. What it CANNOT prove: what Vercel's edge actually returns. That needs a preview deployment.
 *
 *   node tests/consent/vercel-config-check.mjs
 */
import { readFileSync } from 'node:fs';

const DIST = process.env.VERCEL_CLI_DIST || '/Users/marklord/.npm/_npx/c5e9bca3acff8f7b/node_modules/vercel/dist/chunks';
const { validateConfig } = await import(DIST + '/chunk-UARGTFCT.js');
const { require_dist } = await import(DIST + '/chunk-332LMJLZ.js'); // ../routing-utils/dist/index.js
const ru = require_dist();
const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

let failures = 0; const out = [];
const ok = (c, l) => { out.push(l); if (c) console.log(`  ok   ${l}`); else { failures += 1; console.error(`  FAIL ${l}`); } };

const err = validateConfig(config);
ok(err === null, `validateConfig (vercel@59.11.7 schema): ${err ? (err.message || JSON.stringify(err)) : 'valid'}`);
const t = ru.getTransformedRoutes(config);
ok(!t.error, `getTransformedRoutes compiles rewrites/redirects/headers: ${t.error ? (t.error.message || JSON.stringify(t.error)) : 'ok'}`);

const html = ['/', '/whitepaper', '/privacy', '/index.html', '/whitepaper.html', '/privacy.html'];
const assets = ['/styles.css', '/consent/consent.js', '/favicon.ico', '/icons/pwa/icon-192.png', '/DominusOS_White_Paper_v3.pdf', '/sitemap.xml'];
const rules = config.headers || [];
const matches = (rule, p) => new RegExp(ru.sourceToRegex(rule.source).src).test(p);
const setRules = rules.filter((r) => r.headers.some((h) => /^consent_gpc=1;/.test(h.value)));
const clrRules = rules.filter((r) => r.headers.some((h) => /^consent_gpc=;.*Max-Age=0/.test(h.value)));
ok(setRules.length === 2 && clrRules.length === 2, `2 set rules and 2 clear rules (${setRules.length}/${clrRules.length})`);
for (const p of html) ok(setRules.some((r) => matches(r, p)) && clrRules.some((r) => matches(r, p)), `HTML route ${p} is covered by a set rule and a clear rule`);
for (const p of assets) ok(!rules.some((r) => matches(r, p)), `asset ${p} is NOT touched by any cookie rule`);
for (const r of setRules) ok(r.has.some((h) => h.type === 'header' && h.key === 'sec-gpc' && h.value === '1') && !r.missing, `set rule ${r.source}: only when Sec-GPC: 1`);
for (const r of clrRules) ok(r.has.some((h) => h.type === 'cookie' && h.key === 'consent_gpc') && r.missing.some((h) => h.type === 'header' && h.key === 'sec-gpc' && h.value === '1'), `clear rule ${r.source}: only when the cookie exists and Sec-GPC: 1 is missing`);
for (const r of rules) for (const h of r.headers) ok(/; Path=\//.test(h.value) && /SameSite=Lax/.test(h.value) && /; Secure$/.test(h.value), `${h.key} on ${r.source} carries Path=/, SameSite=Lax, Secure`);
console.log(`vercel.json: ${out.length - failures} of ${out.length} checks passed`);
process.exit(failures ? 1 : 0);
