// Dev-server API for the prototype. Runs inside Vite as middleware, so the browser
// never calls the public map services or Anthropic directly. That lets us:
//  - send a proper User-Agent (Nominatim and Overpass ask for one; browsers can't set it),
//  - cache every answer on disk so repeat plans cost nothing,
//  - queue calls per service so we never burst (Nominatim: max 1 req/s),
//  - run the Claude chat through the locally signed-in Claude Code CLI (see claude-cli.ts).
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns';
import path from 'node:path';
import { claudePlanChange, claudeStatus } from './claude-cli';

// Node gives each address only 250 ms to connect. On networks where IPv6 doesn't work and IPv4 takes ~1 s
// (as here, to the OSM servers), every call failed with "fetch failed". Prefer IPv4 and allow more time.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamilyAttemptTimeout(2500);

const USER_AGENT = 'camp-trip-planner/0.1 (prototype; +https://github.com/Shaunf1/camp-trip-planner)';

// ---------- cache ----------
const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'api-cache.json');
let cache: Record<string, { at: number; value: unknown }> = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
} catch {
  cache = {};
}
let saveTimer: NodeJS.Timeout | null = null;
function saveCacheSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  }, 1000);
}
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache[key];
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fn()
    .then((value) => {
      cache[key] = { at: Date.now(), value };
      saveCacheSoon();
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ---------- polite per-service queue ----------
function makeQueue(minGapMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  let last = 0;
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(async () => {
      const wait = last + minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        last = Date.now();
      }
    });
    chain = next.catch(() => undefined);
    return next;
  };
}
const nominatimQueue = makeQueue(1100); // policy: absolute max 1 request per second
const osrmQueue = makeQueue(1000); // demo server: max 1 request per second
const overpassQueue = makeQueue(1500); // one query at a time, with a gap

async function fetchJson(url: string, init: RequestInit = {}) {
  const doFetch = () =>
    fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(init.headers || {}) },
    });
  let res: Response;
  try {
    res = await doFetch();
  } catch (e: any) {
    // a dropped connection ("fetch failed") gets one more try after a short pause; timeouts don't
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw e;
    await new Promise((r) => setTimeout(r, 2000));
    res = await doFetch();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(res.status, `${new URL(url).host} said ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- Nominatim ----------
async function geocode(q: string) {
  const key = `geocode2:${q.trim().toLowerCase()}`;
  const search = (extra: string) =>
    nominatimQueue(
      async () =>
        (await fetchJson(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=au&limit=1&addressdetails=1${extra}&q=${encodeURIComponent(q)}`,
        )) as any[],
    );
  return cached(key, async () => {
      // towns first (so "Kempsey" is the town, not the shire council), then anything
      let rows = await search('&featureType=settlement');
      if (!rows.length) rows = await search('');
      if (!rows.length) return null;
      const r = rows[0];
      const a = r.address || {};
      const short = a.city || a.town || a.village || a.suburb || a.hamlet || a.locality || r.name || q;
      const region = a.state ? `, ${abbrState(a.state)}` : '';
      return { name: `${short.replace(/ (Shire|Regional|City)? ?Council$/, '')}${region}`, lat: Number(r.lat), lng: Number(r.lon), display: r.display_name };
  });
}

async function reverse(lat: number, lng: number) {
  const key = `reverse14:${lat.toFixed(3)},${lng.toFixed(3)}`;
  return cached(key, () =>
    nominatimQueue(async () => {
      // zoom 14 lands on the nearest suburb/village, which reads better than a council or state name
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${lat}&lon=${lng}`;
      const r = (await fetchJson(url)) as any;
      const a = r.address || {};
      const short =
        a.town || a.city || a.village || a.hamlet || a.suburb || a.locality || a.isolated_dwelling || a.municipality || a.county || 'Somewhere on the route';
      const region = a.state ? `, ${abbrState(a.state)}` : '';
      return { name: `${short}${region}` };
    }),
  );
}

function abbrState(s: string) {
  const m: Record<string, string> = {
    'New South Wales': 'NSW',
    Queensland: 'QLD',
    Victoria: 'VIC',
    Tasmania: 'TAS',
    'South Australia': 'SA',
    'Western Australia': 'WA',
    'Northern Territory': 'NT',
    'Australian Capital Territory': 'ACT',
  };
  return m[s] || s;
}

// ---------- OSRM ----------
async function route(points: [number, number][]) {
  // points are [lat, lng]
  const coordStr = points.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
  return cached(`route:${coordStr}`, () =>
    osrmQueue(async () => {
      const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&annotations=duration`;
      const r = (await fetchJson(url)) as any;
      if (r.code !== 'Ok' || !r.routes?.length) throw new HttpError(422, `No driving route found (${r.code})`);
      const rt = r.routes[0];
      const geometry: [number, number][] = rt.geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng]);
      // cumulative seconds along the geometry, from the per-segment annotations
      const segDur: number[] = rt.legs.flatMap((l: any) => l.annotation?.duration || []);
      let cumTime: number[] | null = null;
      if (segDur.length === geometry.length - 1) {
        cumTime = [0];
        for (const d of segDur) cumTime.push(cumTime[cumTime.length - 1] + d);
        // annotations exclude turn penalties, so scale to the reported total
        const scale = rt.duration / (cumTime[cumTime.length - 1] || 1);
        cumTime = cumTime.map((t) => t * scale);
      }
      return {
        durationS: rt.duration,
        distanceM: rt.distance,
        geometry: simplify(geometry, cumTime),
        legs: rt.legs.map((l: any) => ({ durationS: l.duration, distanceM: l.distance })),
        waypoints: r.waypoints.map((w: any) => [w.location[1], w.location[0]]),
      };
    }),
  );
}

// keep roughly one point per ~500 m so responses and the cache stay small
function simplify(geom: [number, number][], cumTime: number[] | null) {
  const out: [number, number][] = [];
  const times: number[] = [];
  let lastKept: [number, number] | null = null;
  geom.forEach((p, i) => {
    const isEnd = i === 0 || i === geom.length - 1;
    if (isEnd || !lastKept || haversine(lastKept, p) > 500) {
      out.push(p);
      if (cumTime) times.push(cumTime[i]);
      lastKept = p;
    }
  });
  return { points: out, cumTime: cumTime ? times : null };
}

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ---------- Overpass ----------
const KIND_FILTERS: Record<string, string[]> = {
  beaches: ['nw["natural"="beach"]["name"]'],
  walks: ['nw["highway"="trailhead"]["name"]'],
  lookouts: ['nw["tourism"="viewpoint"]["name"]'],
  swimming: ['nw["leisure"="swimming_area"]["name"]'],
  waterfalls: ['nw["waterway"="waterfall"]["name"]'],
  towns: ['node["place"="town"]["name"]'],
  // 2WD, park-at-site tent camping: drop sites tagged 4WD-only, walk-in/backcountry, or no tents
  camp: ['nw["tourism"="camp_site"]["4wd_only"!="yes"]["backcountry"!="yes"]["tents"!="no"]["access"!~"^(private|no)$"]'],
};

function kindOf(tags: Record<string, string>): string {
  if (tags.tourism === 'camp_site') return 'camp';
  if (tags.natural === 'beach') return 'beaches';
  if (tags.tourism === 'viewpoint') return 'lookouts';
  if (tags.waterway === 'waterfall') return 'waterfalls';
  if (tags.leisure === 'swimming_area' || tags.swimming === 'yes') return 'swimming';
  if (tags.place === 'town') return 'towns';
  return 'walks';
}

async function pois(body: { mode: 'around' | 'line'; points?: [number, number][]; coords?: [number, number][]; radiusM: number; kinds: string[] }) {
  const kinds = [...new Set(body.kinds)].filter((k) => KIND_FILTERS[k]).sort();
  if (!kinds.length) return [];
  // one query covers every stop (or the whole route line), so each plan change costs one Overpass call
  const r = Math.round(body.radiusM);
  const arounds =
    body.mode === 'line'
      ? [`(around:${r},${(body.coords || []).slice(0, 80).map(([la, ln]) => `${la.toFixed(3)},${ln.toFixed(3)}`).join(',')})`]
      : (body.points || []).slice(0, 12).map(([la, ln]) => `(around:${r},${la.toFixed(3)},${ln.toFixed(3)})`);
  if (!arounds.length) return [];
  const parts = arounds.flatMap((around) => kinds.flatMap((k) => KIND_FILTERS[k].map((f) => `${f}${around};`)));
  const q = `[out:json][timeout:80];(${parts.join('')});out center tags 1500;`;
  return cached(`overpass2:${q}`, () =>
    overpassQueue(async () => {
      const r = await overpassQuery(q);
      return (r.elements || [])
        .map((e: any) => {
          const lat = e.lat ?? e.center?.lat;
          const lng = e.lon ?? e.center?.lon;
          const tags = e.tags || {};
          if (lat == null || tags['4wd_only'] === 'yes') return null;
          return {
            id: `${e.type}/${e.id}`,
            name: tags.name || 'Unnamed campsite',
            kind: kindOf(tags),
            lat,
            lng,
            tags: pick(tags, ['website', 'fee', 'operator', 'description', 'ele', 'surface', 'tents', 'reservation', 'wikipedia']),
          };
        })
        .filter(Boolean);
    }),
  );
}

// The main public instance first; if it's down or busy, try a listed public mirror (one at a time, never in parallel).
const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
let preferredOverpass = 0;
async function overpassQuery(q: string): Promise<any> {
  let lastErr: unknown;
  for (let n = 0; n < OVERPASS_ENDPOINTS.length; n++) {
    const i = (preferredOverpass + n) % OVERPASS_ENDPOINTS.length;
    // a busy server (429 / 502 / 503 / 504) gets retried with exponential backoff (5 s, then 10 s) before moving on
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetchJson(OVERPASS_ENDPOINTS[i], {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(q)}`,
          signal: AbortSignal.timeout(90000),
        });
        // a query that ran out of time or memory still comes back 200, with a remark and no (or partial) data
        if (typeof r?.remark === 'string' && /error|timed out|timeout|out of memory/i.test(r.remark)) {
          throw new HttpError(504, `Overpass gave up: ${r.remark.slice(0, 120)}`);
        }
        preferredOverpass = i;
        return r;
      } catch (e) {
        lastErr = e;
        const status = e instanceof HttpError ? e.status : 0;
        console.warn('[api] overpass', OVERPASS_ENDPOINTS[i], `attempt ${attempt + 1}:`, (e as Error).message.slice(0, 80));
        if (![429, 502, 503, 504].includes(status) || attempt === 2) break;
        await new Promise((res) => setTimeout(res, 5000 * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}

function pick(o: Record<string, string>, keys: string[]) {
  const out: Record<string, string> = {};
  for (const k of keys) if (o[k]) out[k] = o[k];
  return out;
}

// ---------- plumbing ----------
function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new HttpError(400, 'Bad JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(value));
}

export function apiPlugin(): Plugin {
  return {
    name: 'trip-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        try {
          switch (url.pathname) {
            case '/api/geocode': {
              const q = url.searchParams.get('q') || '';
              if (!q.trim()) return send(res, 400, { error: 'Missing q' });
              const r = await geocode(q);
              return r ? send(res, 200, r) : send(res, 404, { error: `Couldn't find "${q}" in Australia` });
            }
            case '/api/reverse':
              return send(res, 200, await reverse(Number(url.searchParams.get('lat')), Number(url.searchParams.get('lng'))));
            case '/api/route': {
              const b = await readBody(req);
              return send(res, 200, await route(b.points));
            }
            case '/api/pois': {
              const b = await readBody(req);
              return send(res, 200, await pois(b));
            }
            case '/api/chat/status':
              return send(res, 200, await claudeStatus());
            case '/api/chat': {
              const status = await claudeStatus();
              if (!status.configured) return send(res, 503, { error: 'Claude Code is not signed in, so the chat is off.' });
              const b = await readBody(req);
              return send(res, 200, await claudePlanChange(b.messages, b.plan));
            }
            default:
              return send(res, 404, { error: 'Unknown API route' });
          }
        } catch (e: any) {
          console.error('[api]', url.pathname, e?.message || e);
          return send(res, e instanceof HttpError ? e.status : 500, { error: e?.message || String(e) });
        }
      });
    },
  };
}
