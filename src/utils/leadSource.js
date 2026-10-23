/**
 * Lead channel for the Acquisition tab: 'meta' | 'referral' | 'organic'.
 *
 * Order of precedence:
 *   1. ghl_lead_links.kind — leads added from the dashboard are what the
 *      button said (Mindbody sign-up → organic, referral → referral),
 *      whatever GHL's own source field ends up as.
 *   2. Referral — a 'referral' tag or source.
 *   3. Meta — Facebook/Instagram anywhere in the source, first/last-touch
 *      attribution (utm source/medium, referrer, session source), or a
 *      Facebook click/lead id (fbclid / fbc).
 *   4. Everything else is organic (walk-ins, website, Google, unknown).
 *
 * `detail` is a short human label of what decided it, shown on the card.
 */
const META_RE = /facebook|instagram|\bmeta\b|\bfb\b|\big\b|fb[ _-]?ads?|paid[ _-]?social|lead[ _-]?form/i;
const REFERRAL_RE = /refer/i;

function attributionText(a) {
  if (!a || typeof a !== 'object') return '';
  return [a.utmSource, a.utmMedium, a.medium, a.campaign, a.referrer, a.sessionSource, a.adSource, a.url]
    .filter(Boolean).join(' ');
}

export const CHANNELS = {
  meta:     { label: 'Meta',     chip: 'bg-blue-100 text-blue-800 border-blue-200',       bar: '#3b82f6' },
  organic:  { label: 'Organic',  chip: 'bg-emerald-100 text-emerald-800 border-emerald-200', bar: '#10b981' },
  referral: { label: 'Referral', chip: 'bg-amber-100 text-amber-800 border-amber-200',     bar: '#f59e0b' },
};

export function leadChannel({ opportunity, contact, link }) {
  if (link?.kind === 'referral') return { channel: 'referral', detail: link.referred_by ? `Referred by ${link.referred_by}` : 'Referral (added in dashboard)' };
  if (link?.kind === 'mindbody') return { channel: 'organic', detail: 'Mindbody sign-up' };

  const tags = (contact?.tags || []).map((t) => String(t).toLowerCase());
  const source = [opportunity?.source, contact?.source].filter(Boolean).join(' ');
  if (tags.some((t) => REFERRAL_RE.test(t)) || REFERRAL_RE.test(source)) return { channel: 'referral', detail: contact?.source || 'Referral tag' };

  const first = attributionText(contact?.attribution);
  const last  = attributionText(contact?.last_attribution);
  const fbIds = contact?.attribution?.fbclid || contact?.attribution?.fbc || contact?.last_attribution?.fbclid || contact?.last_attribution?.fbc;
  if (META_RE.test(source) || META_RE.test(first) || META_RE.test(last) || fbIds || tags.some((t) => META_RE.test(t))) {
    return { channel: 'meta', detail: contact?.source || contact?.attribution?.utmSource || contact?.attribution?.medium || 'Facebook / Instagram' };
  }
  return { channel: 'organic', detail: contact?.source || opportunity?.source || contact?.attribution?.medium || 'No source recorded' };
}
