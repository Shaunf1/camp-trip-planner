import type { HipcampSpot, Place, Poi, PlanOperation } from './types';

async function req<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const geocode = (q: string) => req<Place & { display: string }>(`/api/geocode?q=${encodeURIComponent(q)}`);
export const reverseName = (lat: number, lng: number) => req<{ name: string }>(`/api/reverse?lat=${lat}&lng=${lng}`);

export interface RouteResult {
  durationS: number;
  distanceM: number;
  geometry: { points: [number, number][]; cumTime: number[] | null };
  legs: { durationS: number; distanceM: number }[];
  waypoints: [number, number][];
}
export const route = (points: [number, number][]) => req<RouteResult>('/api/route', { points });

export const poisAround = (points: [number, number][], radiusM: number, kinds: string[]) =>
  req<Poi[]>('/api/pois', { mode: 'around', points, radiusM, kinds });
export const poisAlong = (coords: [number, number][], radiusM: number, kinds: string[]) =>
  req<Poi[]>('/api/pois', { mode: 'line', coords, radiusM, kinds });

export const chatStatus = () => req<{ configured: boolean; model: string }>('/api/chat/status');
export const chat = (messages: { role: string; content: string }[], plan: unknown) =>
  req<{ reply: string; operations: PlanOperation[] }>('/api/chat', { messages, plan });

export const hipcampNear = (stops: { lat: number; lng: number; name: string }[], radiusKm: number) =>
  req<{ results: HipcampSpot[][]; warnings: string[] }>('/api/hipcamp', { stops, radiusKm });
