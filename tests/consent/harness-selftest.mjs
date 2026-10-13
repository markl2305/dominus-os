/**
 * Proves tests/consent/tracking-matrix.mjs can fail (anvil 1h-R1 F2, 1c-R2 F1/F4). Against a running build, it runs the
 * matrix on a short route list once clean (must pass) and once per injected mutant (each must FAIL, on the state and
 * for the reason named below). A harness that passes a mutant is a harness that cannot see that class.
 *
 *   CONSENT_ORIGIN=http://localhost:4472 node tests/consent/harness-selftest.mjs
 *   CONSENT_SELFTEST_ONLY=clean,shadow-overlap ...   # a subset (see ONLY below)
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const MATRIX = new URL('./tracking-matrix.mjs', import.meta.url).pathname;
const OUT = process.env.CONSENT_OUT || '';
const SHORT = {
  CONSENT_PAGES: '/', CONSENT_ALL_ROUTES: '/,/privacy', CONSENT_SEED_ROUTES: '/', CONSENT_LAYOUT_ROUTES: '/',
  CONSENT_SKIP: 'form',
};
// mutant -> a FAIL line that must appear (state + reason), proving the run failed for the injected request.
const EXPECT = {
  '': null,
  'unknown-after-accept': /FAIL accept: zero requests to unknown off-origin hosts.*review-unknown\.invalid\/probe-after-accept/,
  'vercel-path-after-accept': /FAIL accept: zero requests to unknown off-origin hosts.*review-unknown\.invalid\/_vercel\/insights\/view/,
  'unknown-after-withdraw': /FAIL withdraw: zero requests to unknown off-origin hosts.*(withdraw-click|after) https:\/\/review-unknown\.invalid\/probe-after-withdraw/,
  'unknown-before-choice': /FAIL initial: zero requests to unknown off-origin hosts.*before https:\/\/review-unknown\.invalid\/probe-before-choice/,
  'shadow-overlap': /FAIL layout_390x844 \/ top: bar covers no control and is not covered .*covered button "mutant" \(shadow\)/,
};

let failures = 0; const rows = [];
// CONSENT_SELFTEST_ONLY=<name>[,<name>] runs only those cases ('clean' is the clean control), so a long self-test can be
// split into separate foreground runs; the full set is the default.
const ONLY = (process.env.CONSENT_SELFTEST_ONLY || '').split(',').filter(Boolean);
for (const [mutant, want] of Object.entries(EXPECT)) {
  if (ONLY.length && !ONLY.includes(mutant || 'clean')) continue;
  const r = spawnSync(process.execPath, [MATRIX], { env: { ...process.env, ...SHORT, CONSENT_SELFTEST: mutant, CONSENT_OUT: '', CONSENT_LABEL: `selftest:${mutant || 'clean'}` }, encoding: 'utf8', maxBuffer: 64 << 20 });
  const out = (r.stdout || '') + (r.stderr || '');
  const failLines = out.split('\n').filter((l) => l.includes('FAIL'));
  const pass = want === null ? r.status === 0 : r.status === 1 && want.test(out);
  rows.push({ mutant: mutant || '(clean)', rc: r.status, expected: want === null ? 'rc 0' : `rc 1 and ${want}`, pass, fail_lines: failLines.map((l) => l.slice(0, 300)), summary: out.trim().split('\n').pop() });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${mutant || '(clean control)'}: rc ${r.status}${failLines.length ? ', ' + failLines.length + ' failed check(s): ' + failLines[0].trim().slice(0, 160) : ''}`);
  if (!pass) failures += 1;
}
if (OUT) writeFileSync(OUT, JSON.stringify({ measured_at: new Date().toISOString(), origin: process.env.CONSENT_ORIGIN, rows }, null, 2) + '\n');
console.log(`harness-selftest: ${rows.length - failures} of ${rows.length} passed`);
process.exit(failures ? 1 : 0);
