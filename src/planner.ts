import * as api from './api';
import type { Activity, Day, Leg, Place, Plan, PlanOperation, Poi, Stop, TripInput } from './types';

// ---------- dates ----------
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function nightsBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
export function fmtDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
export function fmtDuration(s: number): string {
  const m = Math.round(s / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
export const fmtKm = (m: number) => `${Math.round(m / 1000)} km`;

export function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

let idCounter = 0;
const newId = () => `s${Date.now().toString(36).slice(-4)}${(idCounter++).toString(36)}`;

// ---------- route splitting ----------
/** cumulative seconds for each geometry point; falls back to distance share of the total */
function timeline(r: api.RouteResult): number[] {
  if (r.geometry.cumTime) return r.geometry.cumTime;
  const pts = r.geometry.points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + distKm({ lat: pts[i - 1][0], lng: pts[i - 1][1] }, { lat: pts[i][0], lng: pts[i][1] }));
  }
  const total = cum[cum.length - 1] || 1;
  return cum.map((d) => (d / total) * r.durationS);
}

function nearestIndex(pts: [number, number][], p: [number, number], from = 0) {
  let best = from;
  let bestD = Infinity;
  for (let i = from; i < pts.length; i++) {
    const d = (pts[i][0] - p[0]) ** 2 + (pts[i][1] - p[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function pointAtTime(pts: [number, number][], times: number[], t: number): [number, number] {
  let i = times.findIndex((x) => x >= t);
  if (i <= 0) return pts[Math.max(0, i)];
  return pts[i];
}

export interface PlanResult {
  plan: Plan;
  warnings: string[];
}

/** Turn the form into a first plan: geocode, route, split into days under the limit, share out the nights. */
export async function generatePlan(input: TripInput, onStatus: (s: string) => void): Promise<PlanResult> {
  const warnings: string[] = [];
  onStatus('Finding your start…');
  const start = await api.geocode(input.startQuery);
  let finish: Place = start;
  if (!input.roundTrip) {
    onStatus('Finding your finish…');
    finish = await api.geocode(input.finishQuery);
  }
  let via: Place | null = null;
  if (input.viaQuery.trim()) {
    onStatus(`Finding ${input.viaQuery}…`);
    via = await api.geocode(input.viaQuery);
  }
  const waypoints: Place[] = [start, ...(via ? [via] : []), finish];

  onStatus('Working out the drive…');
  const r = await api.route(waypoints.map((p) => [p.lat, p.lng]));
  const pts = r.geometry.points;
  const times = timeline(r);
  const limitS = input.maxDriveHours * 3600;

  // where each waypoint sits on the route
  const wpIdx: number[] = [];
  let from = 0;
  for (const w of r.waypoints) {
    const i = nearestIndex(pts, w, from);
    wpIdx.push(i);
    from = i;
  }

  type Draft = { lat: number; lng: number; name?: string; anchor: boolean };
  const drafts: Draft[] = [];
  for (let j = 0; j < waypoints.length - 1; j++) {
    const t0 = times[wpIdx[j]];
    const t1 = times[wpIdx[j + 1]];
    const legs = Math.max(1, Math.ceil((t1 - t0) / (limitS * 1.03)));
    for (let k = 1; k < legs; k++) {
      const p = pointAtTime(pts, times, t0 + ((t1 - t0) * k) / legs);
      drafts.push({ lat: p[0], lng: p[1], anchor: false });
    }
    const isLast = j === waypoints.length - 2;
    if (!(isLast && input.roundTrip)) {
      const w = waypoints[j + 1];
      drafts.push({ lat: w.lat, lng: w.lng, name: w.name, anchor: true });
    }
  }

  for (const d of drafts) {
    if (!d.name) {
      onStatus('Naming the overnight areas…');
      d.name = (await api.reverseName(d.lat, d.lng)).name;
    }
  }

  // share out the nights: one each, then the rest to the named places (park and explore)
  const total = Math.max(1, nightsBetween(input.startDate, input.endDate));
  const stops: Stop[] = drafts.map((d) => ({ id: newId(), name: d.name!, lat: d.lat, lng: d.lng, nights: 1, anchor: d.anchor }));
  if (stops.length > total) {
    warnings.push(
      `Keeping every drive under ${input.maxDriveHours}h needs ${stops.length} nights, but your dates give ${total}. The trip has been stretched to fit; trim it with the chat or raise the daily limit.`,
    );
  } else {
    const anchors = stops.filter((s) => s.anchor);
    const pool = anchors.length ? anchors : stops;
    for (let extra = total - stops.length, i = 0; extra > 0; extra--, i++) pool[i % pool.length].nights++;
  }

  return { plan: { input, start, finish, stops, activities: [] }, warnings };
}

// ---------- legs + days ----------
export interface RouteInfo {
  legs: Leg[];
  geometry: [number, number][];
}

export function routePoints(plan: Plan): [number, number][] {
  const pts: [number, number][] = [[plan.start.lat, plan.start.lng], ...plan.stops.map((s) => [s.lat, s.lng] as [number, number])];
  if (plan.input.roundTrip) pts.push([plan.start.lat, plan.start.lng]);
  return pts;
}

export async function computeRoute(plan: Plan): Promise<RouteInfo> {
  const r = await api.route(routePoints(plan));
  return { legs: r.legs, geometry: r.geometry.points };
}

export function buildDays(plan: Plan, legs: Leg[] | null): Day[] {
  const days: Day[] = [];
  let date = plan.input.startDate;
  let prevName = plan.start.name;
  plan.stops.forEach((stop, i) => {
    for (let k = 0; k < stop.nights; k++) {
      const leg = k === 0 && legs?.[i] ? { ...legs[i], from: prevName, to: stop.name } : undefined;
      days.push({
        index: days.length,
        date,
        title: k === 0 ? `Drive to ${stop.name}` : `Explore around ${stop.name}`,
        stopId: stop.id,
        dayOffset: k,
        leg,
        activities: plan.activities.filter((a) => a.stopId === stop.id && a.dayOffset === k),
      });
      date = addDays(date, 1);
    }
    prevName = stop.name;
  });
  const last = plan.stops[plan.stops.length - 1];
  if (plan.input.roundTrip) {
    const leg = legs?.[plan.stops.length];
    days.push({
      index: days.length,
      date,
      title: `Pack up and drive home to ${plan.start.name}`,
      stopId: null,
      dayOffset: 0,
      leg: leg ? { ...leg, from: prevName, to: plan.start.name } : undefined,
      activities: [],
    });
  } else {
    days.push({
      index: days.length,
      date,
      title: `Pack up at ${last?.name ?? plan.finish.name}. Trip ends`,
      stopId: null,
      dayOffset: 0,
      activities: [],
    });
  }
  return days;
}

export function arrivalDate(plan: Plan, stopId: string): string {
  let date = plan.input.startDate;
  for (const s of plan.stops) {
    if (s.id === stopId) return date;
    date = addDays(date, s.nights);
  }
  return date;
}

// ---------- applying Claude's (or the UI's) operations ----------
export async function applyOperations(
  plan: Plan,
  ops: PlanOperation[],
  allPois: Poi[],
  onStatus: (s: string) => void,
): Promise<{ plan: Plan; notes: string[] }> {
  let p: Plan = structuredClone(plan);
  const notes: string[] = [];
  const findStop = (id: string) => p.stops.find((s) => s.id === id);

  for (const op of ops) {
    try {
      switch (op.type) {
        case 'set_nights': {
          const s = findStop(op.stop_id);
          if (!s) throw new Error(`no stop ${op.stop_id}`);
          s.nights = Math.max(1, Math.round(op.nights));
          break;
        }
        case 'add_stop': {
          onStatus(`Finding ${op.place}…`);
          const place = await api.geocode(op.place);
          const after = op.after_stop_id === 'start' ? -1 : p.stops.findIndex((s) => s.id === op.after_stop_id);
          if (op.after_stop_id !== 'start' && after < 0) throw new Error(`no stop ${op.after_stop_id}`);
          p.stops.splice(after + 1, 0, { id: newId(), ...place, nights: Math.max(1, op.nights || 1), anchor: true });
          break;
        }
        case 'remove_stop': {
          if (p.stops.length <= 1) throw new Error('a trip needs at least one stop');
          p.stops = p.stops.filter((s) => s.id !== op.stop_id);
          p.activities = p.activities.filter((a) => a.stopId !== op.stop_id);
          break;
        }
        case 'move_stop': {
          const s = findStop(op.stop_id);
          if (!s) throw new Error(`no stop ${op.stop_id}`);
          onStatus(`Finding ${op.place}…`);
          const place = await api.geocode(op.place);
          Object.assign(s, { name: place.name, lat: place.lat, lng: place.lng, anchor: true });
          p.activities = p.activities.filter((a) => a.stopId !== s.id);
          break;
        }
        case 'split_leg': {
          const idx = p.stops.findIndex((s) => s.id === op.to_stop_id);
          if (idx < 0) throw new Error(`no stop ${op.to_stop_id}`);
          const prev = idx === 0 ? p.start : p.stops[idx - 1];
          const to = p.stops[idx];
          if (op.place) {
            // Claude named a town to break the drive at
            onStatus(`Finding ${op.place}…`);
            const place = await api.geocode(op.place);
            p.stops.splice(idx, 0, { id: newId(), ...place, nights: Math.max(1, op.nights || 1), anchor: true });
            break;
          }
          onStatus('Finding a halfway stop…');
          const r = await api.route([
            [prev.lat, prev.lng],
            [to.lat, to.lng],
          ]);
          const times = timeline(r);
          const mid = pointAtTime(r.geometry.points, times, r.durationS / 2);
          const { name } = await api.reverseName(mid[0], mid[1]);
          p.stops.splice(idx, 0, { id: newId(), name, lat: mid[0], lng: mid[1], nights: Math.max(1, op.nights || 1), anchor: false });
          break;
        }
        case 'set_max_drive_hours':
          p.input = { ...p.input, maxDriveHours: Math.max(0.5, op.hours) };
          break;
        case 'set_start_date':
          if (!/^\d{4}-\d{2}-\d{2}$/.test(op.date)) throw new Error(`bad date ${op.date}`);
          p.input = { ...p.input, startDate: op.date };
          break;
        case 'set_interests':
          p.input = { ...p.input, interests: op.interests };
          break;
        case 'add_activity': {
          const poi = allPois.find((x) => x.id === op.poi_id);
          const s = findStop(op.stop_id);
          if (!poi || !s) throw new Error(`unknown place or stop`);
          p.activities = p.activities.filter((a) => a.poi.id !== poi.id);
          p.activities.push({ poi, stopId: s.id, dayOffset: Math.min(Math.max(0, op.day_offset), s.nights - 1) });
          break;
        }
        case 'remove_activity':
          p.activities = p.activities.filter((a) => a.poi.id !== op.poi_id);
          break;
        default:
          throw new Error(`unknown operation ${(op as any).type}`);
      }
    } catch (e: any) {
      notes.push(`Skipped ${op.type}: ${e.message || e}`);
    }
  }
  // keep activities inside each stop's nights
  p.activities = p.activities
    .map((a: Activity) => {
      const s = p.stops.find((x) => x.id === a.stopId);
      return s ? { ...a, dayOffset: Math.min(a.dayOffset, s.nights - 1) } : null;
    })
    .filter(Boolean) as Activity[];
  return { plan: p, notes };
}

export function totalNights(plan: Plan) {
  return plan.stops.reduce((n, s) => n + s.nights, 0);
}
