/**
 * Simulated publish list (compliance P1-1h sync round, 2026-10-13). No Vercel call, no CLI run: it loads the Vercel
 * CLI's own .vercelignore code (vercel@59.11.7 getVercelIgnore, from VERCEL_CLI_DIST) as a library and applies it to
 * the files git tracks. Two views:
 *   - git_integration (the one asserted): the .vercelignore rules ONLY. Production deploys through the Git
 *     integration, and live /.gitignore and /README.md answer 200, so the CLI's default ignore list is NOT applied
 *     there; every tracked file the .vercelignore keeps is treated as published (the cautious reading).
 *   - cli_upload (recorded): the CLI's default ignore list plus .vercelignore, i.e. a `vercel deploy` from a checkout.
 * Fails if a published file contains a local "/Users/" path, if anything under tests/ is published, or if a file the
 * site or its buildCommand needs is filtered out.
 * (@vercel/build-utils 14.9.1's own getIgnoreFilter cannot run here: it calls .test() on a bundled ignore@4.0.6, which
 * has no such method.)
 *
 *   node tests/consent/publish-list.mjs [out.json]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const DIST = process.env.VERCEL_CLI_DIST || '/Users/marklord/.npm/_npx/c5e9bca3acff8f7b/node_modules/vercel/dist/chunks';
const client = (await import(DIST + '/chunk-G3PXSXIB.js')).require_dist();
const root = execFileSync('git', ['rev-parse', '--show-toplevel']).toString().trim();
const files = execFileSync('git', ['ls-files', '--cached'], { cwd: root }).toString().split('\n').filter(Boolean);
const { ig: cli } = await client.getVercelIgnore(root);
const rules = readFileSync(`${root}/.vercelignore`, 'utf8').replace(/(\n|^)\.\//g, '$1');
const gitOnly = new (Object.getPrototypeOf(cli).constructor)().add(rules);
const published = files.filter((f) => !gitOnly.ignores(f));
const dropped = files.filter((f) => gitOnly.ignores(f));
const cliPublished = files.filter((f) => !cli.ignores(f));
const localPaths = published.filter((f) => { try { return readFileSync(`${root}/${f}`, 'latin1').includes('/Users/'); } catch (e) { return false; } });
const needed = ['index.html', 'whitepaper.html', 'privacy.html', 'consent/consent.js', 'styles.css', 'vercel.json', 'sitemap.xml', 'robots.txt',
  'middleware.js', 'consent-region.mjs', 'package.json', 'package-lock.json', // the edge step (Vercel Routing Middleware) and its one dependency
  'scripts/check-formal-verification-receipt.mjs', 'docs/Dominus_OS_White_Paper_v1_1_Addendum.md', 'docs/formal-verification-receipt.json'];
const missing = needed.filter((f) => !published.includes(f));
const tests = published.filter((f) => f.startsWith('tests/'));
let failures = 0;
const ok = (c, l) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${l}`); if (!c) failures += 1; };
ok(localPaths.length === 0, `no published file contains a /Users/ path (${localPaths.join(', ') || 'none'})`);
ok(tests.length === 0, `nothing under tests/ is published (${tests.join(', ') || 'none'})`);
ok(missing.length === 0, `every file the site and its buildCommand need is still published (missing: ${missing.join(', ') || 'none'})`);
ok(dropped.length > 0, `the filter actually removed something (${dropped.length}: ${dropped.join(', ')})`);
const out = { view_asserted: 'git_integration (.vercelignore rules only)', tracked: files.length, published_count: published.length, published, dropped,
  cli_upload_view: { published_count: cliPublished.length, also_dropped_by_cli_defaults: published.filter((f) => !cliPublished.includes(f)) }, published_with_local_paths: localPaths, missing_needed: missing };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 2) + '\n');
console.log(`publish list: ${published.length} of ${files.length} tracked files published; ${4 - failures} of 4 checks passed`);
process.exit(failures ? 1 : 0);
