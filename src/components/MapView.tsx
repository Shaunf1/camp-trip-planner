import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HipcampSpot, Place, Poi, Stop } from '../types';
import { INTERESTS } from '../types';

interface Props {
  start: Place;
  finish: Place;
  roundTrip: boolean;
  stops: Stop[];
  geometry: [number, number][] | null;
  pois: Poi[];
  /** Hipcamp listings to show (the selected stop's) */
  spots?: HipcampSpot[];
  focus: { lat: number; lng: number; zoom?: number } | null;
  onSelectStop: (id: string) => void;
}

const emojiFor = (kind: string) => (kind === 'camp' ? '⛺' : INTERESTS.find((i) => i.id === kind)?.emoji ?? '📍');

export function MapView({ start, finish, roundTrip, stops, geometry, pois, spots = [], focus, onSelectStop }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ route?: L.LayerGroup; stops?: L.LayerGroup; pois?: L.LayerGroup; spots?: L.LayerGroup }>({});
  const fittedFor = useRef('');

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView([-27.5, 153], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    layers.current.route = L.layerGroup().addTo(m);
    layers.current.pois = L.layerGroup().addTo(m);
    layers.current.spots = L.layerGroup().addTo(m);
    layers.current.stops = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // route + stops
  useEffect(() => {
    const m = map.current;
    const { route, stops: stopLayer } = layers.current;
    if (!m || !route || !stopLayer) return;
    route.clearLayers();
    stopLayer.clearLayers();
    if (geometry?.length) {
      L.polyline(geometry, { color: '#fff', weight: 8, opacity: 0.9 }).addTo(route);
      L.polyline(geometry, { color: '#2f6f4e', weight: 4.5 }).addTo(route);
    }
    const flag = (p: Place, label: string) =>
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: 'pin pin-end', html: `<span>${label}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
        title: p.name,
      })
        .bindTooltip(`${label === '⌂' ? 'Start' : 'Finish'}: ${p.name}`)
        .addTo(stopLayer);
    if (start.name) flag(start, '⌂');
    if (finish.name && !roundTrip && !stops.some((s) => Math.abs(s.lat - finish.lat) < 1e-4 && Math.abs(s.lng - finish.lng) < 1e-4)) flag(finish, '⚑');
    stops.forEach((s, i) => {
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: 'pin pin-stop', html: `<span>${i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
        title: s.name,
        zIndexOffset: 500,
      })
        .bindTooltip(`${i + 1}. ${s.name} · ${s.nights} night${s.nights > 1 ? 's' : ''}`)
        .on('click', () => onSelectStop(s.id))
        .addTo(stopLayer);
    });
    const key = geometry ? `${geometry.length}:${geometry[0]}:${geometry[geometry.length - 1]}` : '';
    if (geometry?.length && key !== fittedFor.current) {
      fittedFor.current = key;
      m.fitBounds(L.latLngBounds(geometry), { padding: [30, 30] });
    }
  }, [geometry, stops, start, finish, roundTrip, onSelectStop]);

  // things to see
  useEffect(() => {
    const layer = layers.current.pois;
    if (!layer) return;
    layer.clearLayers();
    pois.forEach((p) => {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: `pin pin-poi kind-${p.kind}`, html: emojiFor(p.kind), iconSize: [22, 22], iconAnchor: [11, 11] }),
        title: p.name,
      })
        .bindTooltip(p.name)
        .addTo(layer);
    });
  }, [pois]);

  // Hipcamp listings near the selected stop
  useEffect(() => {
    const layer = layers.current.spots;
    if (!layer) return;
    layer.clearLayers();
    const chosen = new Set(stops.map((s) => s.camp?.id).filter(Boolean));
    spots.forEach((x) => {
      const pct = x.recommendsPct === null ? 'new' : `${x.recommendsPct}%`;
      L.marker([x.lat, x.lng], {
        icon: L.divIcon({
          className: `pin pin-hipcamp ${chosen.has(x.id) ? 'chosen' : ''}`,
          html: `<span>${pct}</span>`,
          iconSize: [40, 20],
          iconAnchor: [20, 10],
        }),
        title: x.name,
        zIndexOffset: chosen.has(x.id) ? 400 : 100,
      })
        .bindTooltip(`⛺ ${x.name} · ${pct} recommend · ${x.price ?? ''}`)
        .addTo(layer);
    });
  }, [spots, stops]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], focus.zoom ?? 11, { duration: 0.6 });
  }, [focus]);

  return <div ref={el} className="map" data-testid="map" />;
}
