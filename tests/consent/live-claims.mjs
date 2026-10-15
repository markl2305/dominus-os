/**
 * Claims check against the LIVE site (read-only GET of https://dominusos.ai, nothing else is sent). For each page, every
 * text block the live page renders (headings, paragraphs, list items, links, buttons, table cells, summaries, figure
 * captions, img alt text) must be present, as text, in the candidate's file. Blocks this change rewrote on purpose are
 * listed in EXPECTED_CHANGED (the privacy-notice sentences in the report); each must be ABSENT from the candidate (so
 * the list cannot hide an accidental change elsewhere) and its replacement must be present. A positive control
 * requires the NVIDIA trademark line and badge alt text on every live page and in every candidate page.
 *
 *   node tests/consent/live-claims.mjs [out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const LIVE = process.env.CONSENT_LIVE_ORIGIN || 'https://dominusos.ai';
const PAGES = [['/', 'index.html'], ['/whitepaper', 'whitepaper.html'], ['/privacy', 'privacy.html']];
const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', copy: '©', hellip: '…', rarr: '→', middot: '·', times: '×', reg: '®', trade: '™' };
const decode = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ent[e.toLowerCase()] ?? m));
const norm = (t) => decode(t.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const TAGS = 'h1|h2|h3|h4|h5|h6|p|li|a|button|td|th|summary|figcaption|dt|dd|blockquote|label|span';
function blocks(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const out = new Set();
  // One scan PER TAG, so a block nested in another (a link inside a paragraph) is extracted on its own too.
  for (const tag of TAGS.split('|')) for (const m of body.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))) { const t = norm(m[1]); if (t) out.add(t); }
  for (const m of body.matchAll(/<img\b[^>]*\balt="([^"]*)"/gi)) { const t = norm(m[1]); if (t) out.add('[alt] ' + t); }
  for (const m of body.matchAll(/<title>([\s\S]*?)<\/title>/gi)) out.add('[title] ' + norm(m[1]));
  return out;
}
// Privacy-notice blocks rewritten on purpose (live text -> candidate text); see the report's numbered list.
const EXPECTED_CHANGED = {
  'privacy.html': [
    ['Published by Dominus Foundry LLC — Last updated October 13, 2026', 'Published by Dominus Foundry LLC — Last updated October 15, 2026'],
    ['Analytics: only if you allow it', 'Analytics'],
    ['The site can use two analytics services, and only after you choose “Allow analytics”.', 'Elsewhere they are on unless you turn them off with Your privacy choices'],
    ['If you allow it, your browser loads Google’s script', 'When analytics are on, your browser loads Google’s script'],
    ['If you allow it, your browser sends page views to an address on this site.', 'When analytics are on, your browser sends page views to an address on this site.'],
    ['and the site reads the storage copy first.', 'if they disagree the more recent choice is used'],
    ['Google Analytics, Vercel Web Analytics, LinkedIn', null], // never on this site; asserted absent below as a sanity line
    ['only if you allow analytics (see above)', 'only when analytics are on (see above)'],
    ['then the choice expires and you are asked again.', 'then the choice expires and is treated as if you had not chosen (see above).'],
  ],
};
const NV = ['NVIDIA, the NVIDIA logo, and NVIDIA Inception are trademarks', '[alt] Dominus Foundry is a member of NVIDIA Inception'];

let failures = 0; const results = [];
const ok = (c, l) => { results.push({ ok: !!c, l }); if (c) console.log(`  ok   ${l}`); else { failures += 1; console.error(`  FAIL ${l}`); } };
const report = {};
for (const [route, file] of PAGES) {
  const r = await fetch(LIVE + route, { headers: { 'user-agent': 'dominusos-consent-claims-check (read-only)' } });
  const liveHtml = await r.text();
  ok(r.status === 200, `${route}: live GET status ${r.status}`);
  const cand = readFileSync(new URL(file, ROOT), 'utf8');
  const candBlocks = blocks(cand); const candText = [...candBlocks].join('\n');
  const liveBlocks = [...blocks(liveHtml)];
  const changed = (EXPECTED_CHANGED[file] || []).filter(([a]) => a !== 'Google Analytics, Vercel Web Analytics, LinkedIn');
  const isChanged = (b) => changed.some(([a]) => b.includes(a));
  const missing = liveBlocks.filter((b) => !isChanged(b) && !candBlocks.has(b) && !candText.includes(b.replace(/^\[(alt|title)\] /, '')));
  const changedSeen = liveBlocks.filter(isChanged);
  ok(missing.length === 0, `${route}: all ${liveBlocks.length - changedSeen.length} unchanged live text blocks are present in the candidate (missing: ${missing.map((m) => JSON.stringify(m.slice(0, 90))).join('; ') || 'none'})`);
  for (const n of NV) ok(liveBlocks.some((b) => b.includes(n)) && [...candBlocks].some((b) => b.includes(n)), `${route}: NVIDIA control "${n.slice(0, 50)}…" on live and in the candidate`);
  ok([...candBlocks].filter((b) => b === 'Your privacy choices').length === 1 && !liveBlocks.includes('Your privacy choices'), `${route}: the candidate adds exactly one "Your privacy choices" link (not on live yet)`);
  for (const [a, b] of changed) {
    ok(changedSeen.some((x) => x.includes(a)) && !candText.includes(a) && (b === null || candText.includes(b)), `${route}: intended change, live has "${a.slice(0, 60)}", candidate replaced it${b ? ` with "${b.slice(0, 60)}"` : ''}`);
  }
  ok(!/LinkedIn/i.test(cand.replace(/linkedin: null/g, '')), `${file}: no LinkedIn claim in the candidate (this site configures none)`);
  report[route] = { live_status: r.status, live_blocks: liveBlocks.length, intended_changes_seen: changedSeen, missing };
}
console.log(`live-claims: ${results.length - failures} of ${results.length} checks passed`);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ live: LIVE, measured_at: new Date().toISOString(), report, results }, null, 2) + '\n');
process.exit(failures ? 1 : 0);
