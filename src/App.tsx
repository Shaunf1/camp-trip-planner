import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';
import { applyOperations, buildDays, computeRoute, distKm, fmtDuration, fmtKm, generatePlan, arrivalDate, routePoints, type RouteInfo } from './planner';
import type { ChatMessage, HipcampSpot, Plan, PlanOperation, Poi, TripInput } from './types';
import { PlanForm } from './components/PlanForm';
import { MapView } from './components/MapView';
import { StopsPanel, dayNumber } from './components/StopsPanel';
import { ChatPanel } from './components/ChatPanel';
import { TripSummary } from './components/TripSummary';
import type { SpotResult } from './components/HipcampSpots';

type Step = 'plan' | 'route' | 'trip';
type PoiResult = Poi[] | 'loading' | { error: string };

const STORE_KEY = 'camp-trip-planner:v1';
const DEFAULT_INPUT: TripInput = {
  startQuery: 'Brisbane',
  finishQuery: 'Sydney',
  viaQuery: '',
  roundTrip: false,
  startDate: '2026-11-20',
  endDate: '2026-11-26',
  maxDriveHours: 4,
  interests: ['beaches', 'walks', 'lookouts', 'swimming'],
};
const STOP_RADIUS_M = 15000;
const ROUTE_RADIUS_M = 3000;
const HIPCAMP_RADIUS_KM = 40;
const spotKey = (s: { lat: number; lng: number; name: string }) => `hc:${s.lat.toFixed(3)},${s.lng.toFixed(3)}|${s.name}`;

function loadSaved(): { plan: Plan | null; messages: ChatMessage[]; step: Step; input: TripInput } {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (s?.plan) return { plan: s.plan, messages: s.messages || [], step: s.step || 'route', input: s.plan.input };
  } catch {
    /* ignore */
  }
  return { plan: null, messages: [], step: 'plan', input: DEFAULT_INPUT };
}

const stopKey = (s: { lat: number; lng: number }, kinds: string[]) => `stop:${s.lat.toFixed(3)},${s.lng.toFixed(3)}|${kinds.join(',')}`;

function sampleLine(pts: [number, number][], max: number): [number, number][] {
  if (pts.length <= max) return pts;
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (max - 1))]);
  return out;
}

export default function App() {
  const saved = useMemo(loadSaved, []);
  const [step, setStep] = useState<Step>(saved.step);
  const [input, setInput] = useState<TripInput>(saved.input);
  const [plan, setPlan] = useState<Plan | null>(saved.plan);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [poiResults, setPoiResults] = useState<Record<string, PoiResult>>({});
  const [messages, setMessages] = useState<ChatMessage[]>(saved.messages);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatStatus, setChatStatus] = useState<{ configured: boolean; model: string; reason?: string } | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    api.chatStatus().then(setChatStatus).catch(() => setChatStatus({ configured: false, model: '' }));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ plan, messages, step }));
    } catch {
      /* ignore */
    }
  }, [plan, messages, step]);

  // ----- route for the current stops -----
  const routeKey = plan ? JSON.stringify(routePoints(plan)) : '';
  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    setRouteError(null);
    computeRoute(plan)
      .then((r) => !cancelled && setRouteInfo(r))
      .catch((e) => !cancelled && setRouteError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  // ----- things to see, one Overpass query at a time -----
  const kinds = plan ? [...plan.input.interests].sort() : [];
  const stopKinds = [...kinds, 'camp'];
  const lineKey = routeInfo ? `line:${JSON.stringify(sampleLine(routeInfo.geometry, 80))}|${kinds.join(',')}` : '';
  const wantedKeys = useMemo(() => {
    if (!plan) return [];
    const keys = plan.stops.map((s) => stopKey(s, stopKinds));
    if (lineKey && kinds.length) keys.push(lineKey);
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.stops, lineKey, kinds.join(',')]);

  const [poiRetry, setPoiRetry] = useState(0);
  useEffect(() => {
    if (!plan) return;
    const todo = wantedKeys.filter((k) => !poiResults[k] && !inflight.current.has(k));
    if (!todo.length) return;
    const stopTodo = todo.filter((k) => k.startsWith('stop:'));
    const lineTodo = todo.filter((k) => k.startsWith('line:'));
    todo.forEach((k) => inflight.current.add(k));
    setPoiResults((r) => ({ ...r, ...Object.fromEntries(todo.map((k) => [k, 'loading' as const])) }));
    const done = (entries: [string, PoiResult][]) => {
      entries.forEach(([k]) => inflight.current.delete(k));
      setPoiResults((r) => ({ ...r, ...Object.fromEntries(entries) }));
    };
    (async () => {
      // one small query per stop, one at a time, so results show up stop by stop even when Overpass is busy
      for (const k of stopTodo) {
        const [lat, lng] = k.slice(5).split('|')[0].split(',').map(Number);
        try {
          done([[k, await api.poisAround([[lat, lng]], STOP_RADIUS_M, stopKinds)]]);
        } catch (e: any) {
          done([[k, { error: e.message }]]);
        }
      }
      if (lineTodo.length && routeInfo) {
        try {
          const res = await api.poisAlong(sampleLine(routeInfo.geometry, 80), ROUTE_RADIUS_M, kinds);
          done(lineTodo.map((k) => [k, res]));
        } catch (e: any) {
          done(lineTodo.map((k) => [k, { error: e.message }]));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKeys.join('#'), poiRetry]);
  const poiErrors = wantedKeys.filter((k) => {
    const r = poiResults[k];
    return r && r !== 'loading' && !Array.isArray(r);
  });
  const retryPois = () => {
    setPoiResults((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !poiErrors.includes(k))));
    setPoiRetry((n) => n + 1);
  };

  const stopPois = useMemo(() => {
    const out: Record<string, PoiResult> = {};
    plan?.stops.forEach((s) => (out[s.id] = poiResults[stopKey(s, stopKinds)] ?? 'loading'));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.stops, poiResults, kinds.join(',')]);
  const routePois: PoiResult | null = lineKey ? poiResults[lineKey] ?? 'loading' : null;

  // ----- Hipcamp listings near each stop (read from Hipcamp's public location pages by the dev server) -----
  const [spotResults, setSpotResults] = useState<Record<string, SpotResult>>({});
  const [hipcampWarnings, setHipcampWarnings] = useState<string[]>([]);
  const spotKeys = plan ? plan.stops.map(spotKey) : [];
  useEffect(() => {
    if (!plan) return;
    const todo = plan.stops.filter((s) => !spotResults[spotKey(s)] && !inflight.current.has(spotKey(s)));
    if (!todo.length) return;
    todo.forEach((s) => inflight.current.add(spotKey(s)));
    setSpotResults((r) => ({ ...r, ...Object.fromEntries(todo.map((s) => [spotKey(s), 'loading' as const])) }));
    api
      .hipcampNear(todo.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name })), HIPCAMP_RADIUS_KM)
      .then((res) => {
        setHipcampWarnings(res.warnings);
        setSpotResults((r) => ({ ...r, ...Object.fromEntries(todo.map((s, i) => [spotKey(s), res.results[i] ?? []])) }));
      })
      .catch((e) => setSpotResults((r) => ({ ...r, ...Object.fromEntries(todo.map((s) => [spotKey(s), { error: e.message }])) })))
      .finally(() => todo.forEach((s) => inflight.current.delete(spotKey(s))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotKeys.join('#')]);
  const stopSpots = useMemo(() => {
    const out: Record<string, SpotResult> = {};
    plan?.stops.forEach((s) => (out[s.id] = spotResults[spotKey(s)] ?? 'loading'));
    return out;
  }, [plan?.stops, spotResults]);
  const allSpots = useMemo(() => {
    const m = new Map<string, HipcampSpot>();
    Object.values(stopSpots).forEach((r) => Array.isArray(r) && r.forEach((x) => m.set(x.id, x)));
    return [...m.values()];
  }, [stopSpots]);
  const retryHipcamp = () => setSpotResults((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => Array.isArray(v))));
  const hipcampFailed = Object.values(stopSpots).some((v) => v !== 'loading' && !Array.isArray(v));

  const allPois = useMemo(() => {
    const m = new Map<string, Poi>();
    Object.values(stopPois).forEach((r) => Array.isArray(r) && r.forEach((p) => m.set(p.id, p)));
    if (Array.isArray(routePois)) routePois.forEach((p) => m.set(p.id, p));
    return [...m.values()];
  }, [stopPois, routePois]);

  const mapPois = useMemo(() => {
    if (!plan) return [];
    return allPois.filter((p) => p.kind === 'camp' || plan.input.interests.includes(p.kind as any));
  }, [allPois, plan]);

  const days = useMemo(() => (plan ? buildDays(plan, routeInfo?.legs.length === routePoints(plan).length - 1 ? routeInfo.legs : null) : []), [plan, routeInfo]);

  // ----- actions -----
  const startPlanning = async (inp: TripInput) => {
    setInput(inp);
    setFormError(null);
    setBusy('Planning…');
    try {
      const { plan: p, warnings: w } = await generatePlan(inp, setBusy);
      setPlan(p);
      setRouteInfo(null);
      setWarnings(w);
      setMessages([]);
      setSelectedStopId(null);
      setStep('route');
    } catch (e: any) {
      setFormError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const applyOps = useCallback(
    async (ops: PlanOperation[]) => {
      if (!plan) return [];
      setBusy('Updating the plan…');
      try {
        const { plan: next, notes } = await applyOperations(plan, ops, allPois, setBusy, allSpots);
        setPlan(next);
        return notes;
      } finally {
        setBusy(null);
      }
    },
    [plan, allPois, allSpots],
  );

  const describeOp = useCallback(
    (op: PlanOperation): string => {
      const name = (id: string) => plan?.stops.find((s) => s.id === id)?.name ?? 'a stop';
      switch (op.type) {
        case 'set_nights':
          return `${name(op.stop_id)}: ${op.nights} night${op.nights > 1 ? 's' : ''}`;
        case 'add_stop':
          return `Added ${op.place} (${op.nights} night${op.nights > 1 ? 's' : ''})`;
        case 'remove_stop':
          return `Removed a stop`;
        case 'move_stop':
          return `Moved a stop to ${op.place}`;
        case 'split_leg':
          return `Broke up the drive to ${name(op.to_stop_id)}`;
        case 'set_max_drive_hours':
          return `Daily driving limit: ${op.hours}h`;
        case 'set_start_date':
          return `Leaving ${op.date}`;
        case 'set_interests':
          return `Interests: ${op.interests.join(', ')}`;
        case 'add_activity':
          return `Added ${allPois.find((p) => p.id === op.poi_id)?.name ?? 'a place'} to a day`;
        case 'remove_activity':
          return `Removed a place from a day`;
        case 'set_campsite':
          return `${name(op.stop_id)}: staying at ${allSpots.find((x) => x.id === op.hipcamp_id)?.name ?? 'a Hipcamp listing'}`;
        case 'clear_campsite':
          return `${name(op.stop_id)}: campsite cleared`;
      }
    },
    [plan, allPois, allSpots],
  );

  const planContext = () => {
    if (!plan) return null;
    const near = (r: PoiResult | undefined, origin: { lat: number; lng: number }) =>
      Array.isArray(r)
        ? r
            .filter((p) => plan.input.interests.includes(p.kind as any))
            .map((p) => ({ id: p.id, name: p.name, kind: p.kind, km: Math.round(distKm(origin, p)) }))
            .sort((a, b) => a.km - b.km)
            // the nearest few of each kind, so a city's many lookouts don't crowd out its beaches
            .filter((p, _i, all) => all.filter((q) => q.kind === p.kind).indexOf(p) < 4)
        : [];
    return {
      start: plan.start.name,
      finish: plan.input.roundTrip ? `${plan.start.name} (round trip)` : plan.finish.name,
      start_date: plan.input.startDate,
      max_drive_hours: plan.input.maxDriveHours,
      interests: plan.input.interests,
      stops: plan.stops.map((s, i) => {
        const leg = routeInfo?.legs[i];
        return {
          id: s.id,
          name: s.name,
          nights: s.nights,
          arrive: arrivalDate(plan, s.id),
          drive_in: leg ? `${fmtDuration(leg.durationS)} (${fmtKm(leg.distanceM)})` : 'unknown',
          over_limit: leg ? leg.durationS > plan.input.maxDriveHours * 3600 : false,
          campsites_mapped_nearby: Array.isArray(stopPois[s.id]) ? (stopPois[s.id] as Poi[]).filter((p) => p.kind === 'camp').length : 'unknown',
        };
      }),
      drive_home: plan.input.roundTrip && routeInfo?.legs[plan.stops.length] ? fmtDuration(routeInfo.legs[plan.stops.length].durationS) : undefined,
      days: days.map((d) => ({ day: d.index + 1, date: d.date, title: d.title, drive: d.leg ? fmtDuration(d.leg.durationS) : undefined })),
      things_to_see: Object.fromEntries(plan.stops.map((s) => [s.id, near(stopPois[s.id], s)])),
      along_route: Array.isArray(routePois)
        ? routePois.filter((p) => plan.input.interests.includes(p.kind as any)).slice(0, 15).map((p) => ({ id: p.id, name: p.name, kind: p.kind }))
        : [],
      hipcamp_nearby: Object.fromEntries(
        plan.stops.map((s) => {
          const r = stopSpots[s.id];
          if (!Array.isArray(r)) return [s.id, r === 'loading' ? 'still loading' : 'unavailable'];
          return [
            s.id,
            r
              .filter((x) => x.accommodations.includes('tent'))
              .sort((a, b) => (b.recommendsPct ?? 0) - (a.recommendsPct ?? 0) || b.recommendsCount - a.recommendsCount)
              .slice(0, 8)
              .map((x) => ({
                id: x.id,
                name: x.name,
                km: x.km,
                recommends: x.recommendsPct === null ? 'too few reviews' : `${x.recommendsPct}% of ${x.recommendsCount}`,
                price_from: x.price,
                amenities: x.features.map((f) => f.name),
              })),
          ];
        }),
      ),
      campsites_chosen: Object.fromEntries(plan.stops.filter((s) => s.camp).map((s) => [s.id, s.camp!.name])),
      activities: plan.activities.map((a) => ({ poi_id: a.poi.id, name: a.poi.name, stop_id: a.stopId, day_offset: a.dayOffset, day: dayNumber(plan, a.stopId, a.dayOffset) })),
    };
  };

  const sendChat = async (text: string) => {
    if (!plan) return;
    const history = [...messages, { role: 'user' as const, content: text }];
    setMessages(history);
    setChatBusy(true);
    try {
      const res = await api.chat(
        history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        planContext(),
      );
      const notes = res.operations.length ? await applyOps(res.operations) : [];
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: [res.reply, ...notes].filter(Boolean).join('\n'), operations: res.operations },
      ]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Couldn't reach Claude: ${e.message}`, error: true }]);
    } finally {
      setChatBusy(false);
    }
  };

  const reset = () => {
    setPlan(null);
    setRouteInfo(null);
    setMessages([]);
    setWarnings([]);
    setStep('plan');
  };

  const steps: { id: Step; label: string }[] = [
    { id: 'plan', label: '1 · Plan' },
    { id: 'route', label: '2 · Route & stops' },
    { id: 'trip', label: '3 · The trip' },
  ];

  return (
    <div className={`app step-${step}`}>
      <header className="topbar no-print">
        <div className="brand">⛺ Camp trip planner</div>
        <nav className="steps">
          {steps.map((s) => (
            <button key={s.id} className={step === s.id ? 'active' : ''} disabled={s.id !== 'plan' && !plan} onClick={() => setStep(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="status">
          {busy ?? (routeError ? `⚠ ${routeError}` : '')}
          {!busy && poiErrors.length > 0 && (
            <>
              {' '}
              ⚠ OpenStreetMap places didn't load (the public Overpass server is busy).{' '}
              <button className="small" onClick={retryPois}>
                Try again
              </button>
            </>
          )}
          {!busy && hipcampFailed && (
            <>
              {' '}
              ⚠ Couldn't read Hipcamp.{' '}
              <button className="small" onClick={retryHipcamp}>
                Try again
              </button>
            </>
          )}
        </div>
        {plan && (
          <button className="ghost small" onClick={reset}>
            New trip
          </button>
        )}
      </header>

      {step === 'plan' && (
        <main className="layout two">
          <PlanForm initial={input} busy={busy} error={formError} onSubmit={startPlanning} />
          <MapView
            start={plan?.start ?? { name: '', lat: -27.47, lng: 153.03 }}
            finish={plan?.finish ?? { name: '', lat: -27.47, lng: 153.03 }}
            roundTrip={plan?.input.roundTrip ?? true}
            stops={plan?.stops ?? []}
            geometry={plan ? routeInfo?.geometry ?? null : null}
            pois={[]}
            focus={null}
            onSelectStop={() => setStep('route')}
          />
        </main>
      )}

      {step === 'route' && plan && (
        <main className="layout three">
          <div className="side">
            {warnings.map((w) => (
              <p key={w} className="warning">
                {w}
              </p>
            ))}
            <StopsPanel
              plan={plan}
              days={days}
              legs={routeInfo && routeInfo.legs.length === routePoints(plan).length - 1 ? routeInfo.legs : null}
              stopPois={stopPois}
              stopSpots={stopSpots}
              hipcampWarnings={hipcampWarnings}
              routePois={routePois}
              selectedStopId={selectedStopId}
              onSelectStop={setSelectedStopId}
              onOps={applyOps}
              onFocus={setFocus}
            />
            <button className="primary wide" onClick={() => setStep('trip')}>
              See the day-by-day trip →
            </button>
          </div>
          <MapView
            start={plan.start}
            finish={plan.finish}
            roundTrip={plan.input.roundTrip}
            stops={plan.stops}
            geometry={routeInfo?.geometry ?? null}
            pois={mapPois}
            spots={selectedStopId && Array.isArray(stopSpots[selectedStopId]) ? (stopSpots[selectedStopId] as HipcampSpot[]) : []}
            focus={focus}
            onSelectStop={setSelectedStopId}
          />
          <ChatPanel status={chatStatus} messages={messages} busy={chatBusy} onSend={sendChat} describeOp={describeOp} />
        </main>
      )}

      {step === 'trip' && plan && (
        <main className="layout trip">
          <TripSummary plan={plan} days={days} />
          <div className="no-print">
            <ChatPanel status={chatStatus} messages={messages} busy={chatBusy} onSend={sendChat} describeOp={describeOp} />
          </div>
        </main>
      )}
    </div>
  );
}
