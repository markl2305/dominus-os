import { next } from '@vercel/functions/middleware'; // the subpath: next() only, nothing that reads process.env at load
import { consentRegion, isDocumentRequest, regionCookieValue, REGION_COOKIE, REGION_COOKIE_OPTIONS } from './consent-region.mjs';

// Vercel Routing Middleware for this static site. It mirrors hiresabina.ai's proxy.js (main f8ee005); the only
// per-site difference is the routing layer, since this site has no framework.
//
// Consent region (Mark 2026-10-14/15, shared memory 77550c45): every document response carries the host-only
// `__Host-consent_region=<ask|default>.<epoch seconds>`, decided from Vercel's `x-vercel-ip-country` by
// consent-region.mjs (copied byte-for-byte from hiresabina). EU/EEA, UK, Swiss and unknown-country visitors are `ask`
// (the ask-first bar); everyone else is `default` (analytics on unless GPC or a stored "No"). It is re-set on every
// document, so the cookie always describes THIS request, and consent/consent.js honours `default` only when it is at
// most 10 s old, so a document that skipped this refresh asks first.
//
// Global Privacy Control, header form: a document request carrying `Sec-GPC: 1` gets `consent_gpc=1`, which
// consent.js reads as a reject; when the header stops arriving the cookie is cleared. (vercel.json's header rules set
// the same cookie on undotted and *.html paths; this also covers every other document, such as a dotted 404.)
//
// "Every document" is decided by what the browser is fetching (Sec-Fetch-Dest, else Accept: text/html), not by the
// path's shape. The matcher exempts only the three directories that hold nothing but static files (/assets/, /icons/,
// /consent/). Everything else is classified here, and only document navigations get the cookies; images, scripts,
// styles and fonts pass through untouched.

const SECURE_ATTRS = '; Path=/; Max-Age=86400; SameSite=Lax; Secure';

function regionCookie(value) {
  const o = REGION_COOKIE_OPTIONS;
  return `${REGION_COOKIE}=${value}; Path=${o.path}; Max-Age=${o.maxAge}; SameSite=Lax${o.secure ? '; Secure' : ''}`;
}

function hasCookie(request, name) {
  return (request.headers.get('cookie') || '').split(';').some((c) => c.trim().split('=')[0] === name);
}

export default function middleware(request) {
  if (!isDocumentRequest(request.headers)) return next();
  const headers = new Headers();
  if (request.headers.get('sec-gpc') === '1') {
    headers.append('Set-Cookie', `consent_gpc=1${SECURE_ATTRS}`);
  } else if (hasCookie(request, 'consent_gpc')) {
    headers.append('Set-Cookie', 'consent_gpc=; Path=/; Max-Age=0; SameSite=Lax; Secure');
  }
  headers.append('Set-Cookie', regionCookie(regionCookieValue(consentRegion(request.headers.get('x-vercel-ip-country')))));
  return next({ headers });
}

export const config = {
  matcher: ['/((?!assets/|icons/|consent/).*)'],
};
