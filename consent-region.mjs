// Which consent region a request is in (RULED by Mark 2026-10-14, shared memory 77550c45, superseding his 10-12
// "consent-gate it" for US visitors): ask-first analytics consent ONLY for EU/EEA, UK and Swiss visitors; everyone
// else gets analytics on by default, with Global Privacy Control honoured and a "Your privacy choices" link.
//
// The answer is decided at the edge from Vercel's own request header `x-vercel-ip-country` (no third-party lookup)
// and handed to the page as the first-party host-only cookie `__Host-consent_region` (`ask` | `default`), which
// public/consent/consent.js reads. consent.js treats anything but an unambiguous `default` as ask-first, so a page
// with no middleware, a missing cookie or a forged/garbled one is asked first. This file decides the SAME way: the
// region is `default` only for a well-formed, known country code outside the ask-first list. A missing header, an
// empty or malformed value, or a reserved/unknown code (Vercel and GeoIP use XX, T1, A1, A2, O1, AP, EU, ZZ) asks.
//
// Shared by every site that copies public/consent/consent.js. Copy this file byte-for-byte too; only the place that
// calls it (Next proxy.js / middleware.js, or Vercel Edge Middleware on a static site) differs per site.

// A __Host- cookie (review F2, 2026-10-14): the browser accepts it only from this exact host over a secure origin,
// with Path=/ and no Domain, so another subdomain of the same registrable domain cannot set it (an ordinary cookie
// set with Domain=<parent> would be visible here and could otherwise mint a default-on grant).
export const REGION_COOKIE = '__Host-consent_region';

// EU 27, EEA (Iceland, Liechtenstein, Norway), the United Kingdom and Switzerland, as Mark ruled; plus, in the
// safe direction (asked first), territories that carry their own ISO code but sit inside the EU or under GDPR-style
// law: Åland (AX) and the French outermost regions (GF, GP, MQ, RE, YT, MF) are EU territory; Gibraltar (GI) and the
// Crown Dependencies (GG, JE, IM) have UK-GDPR-equivalent laws.
export const ASK_FIRST_COUNTRIES = Object.freeze([
  // EU 27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EEA
  'IS', 'LI', 'NO',
  // UK and Switzerland
  'GB', 'CH',
  // EU territories with their own code
  'AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF',
  // UK-linked territories with GDPR-equivalent law
  'GI', 'GG', 'JE', 'IM',
]);
const ASK = new Set(ASK_FIRST_COUNTRIES);
// Not a country: unknown, anonymous proxy, satellite, Tor, Asia/Pacific or Europe-wide blocks. (Already outside
// ISO_3166_1 below; kept as an explicit list of what Vercel and GeoIP are known to send.)
const UNKNOWN = new Set(['XX', 'ZZ', 'T1', 'A1', 'A2', 'O1', 'AP', 'EU']);
// Every officially assigned ISO 3166-1 alpha-2 code (249). Only these can be default-on (review F4, 2026-10-14): an
// unassigned, user-assigned (e.g. XK) or reserved code is not a known country, so it asks first.
export const ISO_3166_1 = Object.freeze(`
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT
MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG
UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.trim().split(/\s+/));
const KNOWN = new Set(ISO_3166_1);

// The cookie value carries the time the edge decided it (review round 3, 2026-10-14): "<ask|default>.<epoch seconds>".
// consent.js honours "default" only when that time is at most 10 s old and at most 2 s ahead at its own start,
// so any document that did not get this refresh asks first, whatever its path.
export function regionCookieValue(region, nowMs = Date.now()) {
  return `${region === 'default' ? 'default' : 'ask'}.${Math.floor(nowMs / 1000)}`;
}

export function consentRegion(country) {
  const c = typeof country === 'string' ? country.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(c) || UNKNOWN.has(c) || !KNOWN.has(c) || ASK.has(c)) return 'ask';
  return 'default';
}

// Is this request a document navigation, i.e. a response that can run the gate (review F1, 2026-10-14)? Path shape
// cannot tell: a dotted path such as /review.missing renders the 404 document, layout and gate included. Browsers say
// what they are fetching in Sec-Fetch-Dest; an older browser without it asks for text/html on a navigation.
export function isDocumentRequest(headers) {
  const dest = headers.get('sec-fetch-dest');
  if (dest) return dest === 'document' || dest === 'iframe' || dest === 'frame';
  return /text\/html/i.test(headers.get('accept') || '');
}

// The Set-Cookie attributes every site uses: readable by consent.js (not HttpOnly), whole site, one day, re-set on
// every document response so a visitor who travels is re-classified on their next page load. Secure and Path=/ with
// no Domain are what the __Host- prefix requires; the browser drops the cookie otherwise (and then the page asks).
export const REGION_COOKIE_OPTIONS = Object.freeze({ path: '/', maxAge: 60 * 60 * 24, sameSite: 'lax', secure: true });
