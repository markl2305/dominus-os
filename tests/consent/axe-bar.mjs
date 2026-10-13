/**
 * Accessibility pass (axe-core, serious+critical) on each page WITH the consent bar visible (no choice made yet),
 * compliance P1-1h v2 sync 2026-10-13. Offline: only same-origin requests pass; axe-core is loaded from a local file
 * (AXE_CORE_PATH), nothing is fetched.
 *
 *   CONSENT_ORIGIN=http://127.0.0.1:4493 CONSENT_OUT=axe.json node tests/consent/axe-bar.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ORIGIN = new URL(process.env.CONSENT_ORIGIN || 'http://127.0.0.1:4493').origin;
const PAGES = (process.env.CONSENT_PAGES || '/,/whitepaper,/privacy').split(',');
const AXE = process.env.AXE_CORE_PATH || '/Users/marklord/Developer/Dominus Foundry/forge-web/node_modules/axe-core/axe.min.js';
const axeSrc = readFileSync(AXE, 'utf8');
const OUT = process.env.CONSENT_OUT || '';

let failures = 0; const results = [];
const ok = (c, l) => { results.push({ ok: !!c, label: l }); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${l}`); if (!c) failures += 1; };

const browser = await chromium.launch();
const out = { origin: ORIGIN, measured_at: new Date().toISOString(), pages: {} };
try {
  for (const p of PAGES) {
    const context = await browser.newContext();
    await context.route('**/*', (r) => (new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort()));
    const page = await context.newPage();
    await page.goto(ORIGIN + p, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const bar = await page.locator('[data-consent-bar]').count();
    await page.addScriptTag({ content: axeSrc });
    const violations = await page.evaluate(async () => {
      const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] });
      return res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, nodes: v.nodes.length }));
    });
    out.pages[p] = { bar_shown: bar > 0, violations };
    ok(bar > 0, `${p}: the consent bar is shown (no choice made)`);
    ok(violations.length === 0, `${p}: axe serious+critical = 0 with the bar showing (${violations.map((v) => `${v.id}x${v.nodes}`).join(', ') || 'none'})`);
    await context.close();
  }
} finally {
  await browser.close();
}
if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`axe-bar: ${results.length - failures} of ${results.length} checks passed`);
process.exit(failures ? 1 : 0);
