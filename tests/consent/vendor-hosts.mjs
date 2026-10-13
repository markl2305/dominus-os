/**
 * The vendor classification used by the consent harnesses. It MIRRORS public/consent/consent.js rule 8 (VENDOR_DOMAIN,
 * GOOGLE_DOMAIN, VERCEL_PATH); tests/consent/guard-hosts.mjs checks that the two agree on every generated host
 * spelling, so a change to one without the other fails that test.
 */
export const VENDOR_DOMAIN = /(^|\.)(google-analytics\.com|googletagmanager\.com|googletagservices\.com|doubleclick\.net|googleadservices\.com|googlesyndication\.com|app-measurement\.com|licdn\.com|linkedin\.com|vercel-insights\.com|vercel-scripts\.com)$/;
export const GOOGLE_DOMAIN = /(^|\.)google\.([a-z]{2,3}|(co|com|org|net|ac|ad|edu|gob|gov|ne|nic|or)\.[a-z]{2})$/;
export const VERCEL_PATH = /^\/_vercel\/insights(\/|$)/;

// WHATWG URL parsing already lower-cases, applies IDNA (UTS 46) and splits off the port; a trailing dot survives it.
export const normHost = (host) => String(host || '').toLowerCase().replace(/\.+$/, '');
export const vendorHost = (host) => { const h = normHost(host); return VENDOR_DOMAIN.test(h) || GOOGLE_DOMAIN.test(h); };
/** true when `url` (string or URL, resolved against `origin`) is a vendor request for a page on `origin`. */
export function vendorUrl(url, origin) {
  let x; try { x = new URL(String(url), origin); } catch (e) { return false; }
  if (!/^https?:$/.test(x.protocol)) return false;
  if (VERCEL_PATH.test(x.pathname)) return true;
  return x.origin !== new URL(origin).origin && vendorHost(x.hostname);
}
