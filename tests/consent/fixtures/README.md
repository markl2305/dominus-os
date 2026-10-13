# Cached vendor loaders (consent tests)

Public vendor JavaScript, so the consent tests execute the real collectors with no network at test time.
Each is served by the harness in place of the live file; every collection request they make is answered locally
and never delivered.

| file | fetched from | bytes | note |
|---|---|---|---|
| `vercel-insights-script.js` | copied byte-for-byte from `hiresabina`'s cache (sha256 `b1fa9fc8…8af`), itself fetched `https://hiresabina.ai/_vercel/insights/script.js` and noted there as "byte-identical to the copy anvil cached from dominusos.ai for review 1h-R1" | 4,550 | Vercel Web Analytics loader `sv 0.1.3`. Generic across Vercel sites: not site-specific, confirmed 0 occurrences of any site/analytics id string. |
| `linkedin-insight.min.js` | copied byte-for-byte from `hiresabina`'s cache, itself `https://snap.licdn.com/li.lms-analytics/insight.min.js` | 3,337 | bootstrap; picks `beta` or `old` by partner id. **dominusos does not configure LinkedIn** (`CONSENT_CONFIG.linkedin: null`); kept here only so `gate-unit.mjs`'s generic (site-independent) W/F1 cases can exercise the shared gate file's LinkedIn support with a real script. |
| `linkedin-insight.beta.min.js` | same | 62,285 | |
| `linkedin-insight.old.min.js` | same | 62,130 | |
| `gtag-js-G-Z0BTF1J29X.js` | `https://www.googletagmanager.com/gtag/js?id=G-Z0BTF1J29X`, fetched **2026-10-13T07:58:28Z**, one GET, no collection request, gzip body decoded by curl | 466,967 | dominusos's real GA4 container. Destinations in it: `G-Z0BTF1J29X` and the linked Google tag `GT-NFRPR4MQ`; **no `AW-` (Google Ads) id** — confirmed by grep, 0 matches. sha256 `e2a2cd61…9a6` |

`SHA256SUMS` pins them (`shasum -a 256 -c tests/consent/fixtures/SHA256SUMS` from this directory). The harness serves
gtag.js only for the id it was cached for; `CONSENT_GA_FIXTURE` overrides the file. Nothing is fetched at test time.
When a vendor changes its loader, re-cache it here and re-run the matrix; a stale copy proves the behaviour of that
copy only.
