// Reads Hipcamp's public "top spots" location pages (state and region pages, e.g.
// /en-AU/d/australia/new-south-wales/yamba/camping/all) and finds the listings near a point.
//
// This is a personal-use scraper, kept polite:
//  - it only fetches pages Hipcamp's robots.txt allows (/d/... location pages); never /api or /graphql,
//  - one request at a time, 3 s apart, with our User-Agent,
//  - every page is cached on disk for a week, and only regions near the trip are fetched.
// The listing pages themselves render in the browser, so all data comes from the location pages,
// which embed each listing's name, link, % recommended, price, amenities and a photo.

export interface HipcampSpot {
  id: string;
  name: string;
  url: string;
  lat: number;
  lng: number;
  recommendsPct: number | null;
  recommendsCount: number;
  price: string | null;
  priceAud: number | null;
  town: string;
  accommodations: string[];
  features: { slug: string; name: string }[];
  photo: string | null;
  summary: string;
  sites: number | null;
  /** km from the point asked about; filled in per request */
  km?: number;
}

const BASE = 'https://www.hipcamp.com';
const PHOTO_HOST = 'https://dxynby2r8cy0b.cloudfront.net/';
const PHOTO_SIZE = 'f_auto,c_fill,w_480,h_300,q_auto';

/** Hipcamp photo filenames come as "v123/land-photos/x.jpg" or "images/v123/campground-photos/x.jpg";
 *  the resize options go after the "images/" part when there is one. Also accepts URLs built by an
 *  older version of this code, so cached pages don't need fetching again. */
export function photoUrl(fileOrUrl: string | null): string | null {
  if (!fileOrUrl) return null;
  let file = fileOrUrl;
  if (file.startsWith(PHOTO_HOST)) file = file.slice(PHOTO_HOST.length).replace(/^(images\/)?f_auto[^/]*\//, '$1').replace(/^f_auto[^/]*\//, '');
  return file.startsWith('images/') ? `${PHOTO_HOST}images/${PHOTO_SIZE}/${file.slice(7)}` : `${PHOTO_HOST}${PHOTO_SIZE}/${file}`;
}

export function parseDiscoverPage(html: string, stateSlug: string): { spots: HipcampSpot[]; regionPaths: string[] } {
  const regionPaths = [
    ...new Set(
      [...html.matchAll(new RegExp(`/en-AU/d/australia/${stateSlug}/([a-z0-9-]+)/camping/all`, 'g'))].map((m) => m[0]),
    ),
  ];
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { spots: [], regionPaths };
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return { spots: [], regionPaths };
  }
  const found = new Map<string, HipcampSpot>();
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (o.__typename === 'DiscoverLand' && o.url && o.coordinate && !found.has(String(o.id))) {
      found.set(String(o.id), {
        id: String(o.id),
        name: o.name,
        url: BASE + o.url,
        lat: o.coordinate.latitude,
        lng: o.coordinate.longitude,
        recommendsPct: o.hasEnoughRecommends === false ? null : o.recommendsPercentage ?? null,
        recommendsCount: o.recommendsCount ?? 0,
        price: o.minPricePerNight?.format ?? null,
        priceAud: o.minPricePerNight?.amount ?? null,
        town: [o.cityName, o.stateAbbrvName].filter(Boolean).join(', '),
        accommodations: o.allAccommodationKeys ?? [],
        features: (o.campFeatures ?? []).map((f: any) => ({ slug: f.slug, name: f.name })),
        photo: o.coverPhoto?.filename ?? null, // a filename; photoUrl() turns it into a link
        summary: String(o.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 280),
        sites: o.totalCampsitesCount ?? null,
      });
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(data);
  return { spots: [...found.values()], regionPaths };
}

export const stateSlug = (stateName: string) => stateName.toLowerCase().replace(/[^a-z]+/g, '-');

/** "central-coast-1" -> "central coast" */
export const regionName = (path: string) =>
  (path.split('/').at(-3) ?? '').replace(/-\d+$/, '').replace(/-/g, ' ');

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
