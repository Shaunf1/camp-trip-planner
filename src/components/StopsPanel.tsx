import { useState } from 'react';
import type { Day, Leg, Plan, PlanOperation, Poi, Stop } from '../types';
import { INTERESTS } from '../types';
import { addDays, arrivalDate, distKm, fmtDate, fmtDuration, fmtKm } from '../planner';
import { hipcampSearchUrl } from '../hipcamp';

interface Props {
  plan: Plan;
  days: Day[];
  legs: Leg[] | null;
  stopPois: Record<string, Poi[] | 'loading' | { error: string }>;
  routePois: Poi[] | 'loading' | { error: string } | null;
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  onOps: (ops: PlanOperation[]) => void;
  onFocus: (p: { lat: number; lng: number; zoom?: number }) => void;
}

const kindLabel = (k: string) => (k === 'camp' ? '⛺ Campsite' : INTERESTS.find((i) => i.id === k)?.emoji + ' ' + INTERESTS.find((i) => i.id === k)?.label);

export function StopsPanel({ plan, days, legs, stopPois, routePois, selectedStopId, onSelectStop, onOps, onFocus }: Props) {
  const limitS = plan.input.maxDriveHours * 3600;
  const homeLeg = plan.input.roundTrip ? legs?.[plan.stops.length] : undefined;
  return (
    <div className="stops">
      <div className="trip-head">
        <div>
          <strong>{plan.start.name}</strong> → {plan.input.roundTrip ? <>round trip</> : <strong>{plan.finish.name}</strong>}
        </div>
        <div className="muted small">
          {fmtDate(plan.input.startDate)} to {fmtDate(days[days.length - 1].date)} · {days.length - 1} nights · up to {plan.input.maxDriveHours}h driving a day
        </div>
      </div>

      {plan.stops.map((s, i) => (
        <StopCard
          key={s.id}
          stop={s}
          index={i}
          plan={plan}
          leg={legs?.[i]}
          limitS={limitS}
          pois={stopPois[s.id]}
          selected={selectedStopId === s.id}
          onSelect={() => {
            onSelectStop(s.id);
            onFocus({ lat: s.lat, lng: s.lng, zoom: 11 });
          }}
          onOps={onOps}
          onFocus={onFocus}
        />
      ))}

      {homeLeg && (
        <div className={`leg-home ${homeLeg.durationS > limitS ? 'over' : ''}`}>
          Drive home to {plan.start.name}: {fmtDuration(homeLeg.durationS)} · {fmtKm(homeLeg.distanceM)}
          {homeLeg.durationS > limitS && <span className="badge warn">over your {plan.input.maxDriveHours}h limit</span>}
        </div>
      )}

      <section className="card along">
        <h3>Along the way</h3>
        <p className="muted small">Within about 3 km of the route.</p>
        <PoiList pois={routePois} plan={plan} days={days} onOps={onOps} onFocus={onFocus} limit={12} />
      </section>
    </div>
  );
}

function StopCard(props: {
  stop: Stop;
  index: number;
  plan: Plan;
  leg?: Leg;
  limitS: number;
  pois: Poi[] | 'loading' | { error: string } | undefined;
  selected: boolean;
  onSelect: () => void;
  onOps: (ops: PlanOperation[]) => void;
  onFocus: (p: { lat: number; lng: number; zoom?: number }) => void;
}) {
  const { stop: s, index, plan, leg, limitS, pois, selected, onSelect, onOps, onFocus } = props;
  const arrive = arrivalDate(plan, s.id);
  const depart = addDays(arrive, s.nights);
  const camps = Array.isArray(pois) ? pois.filter((p) => p.kind === 'camp') : null;
  const sights = Array.isArray(pois) ? pois.filter((p) => p.kind !== 'camp') : pois;
  const over = leg && leg.durationS > limitS;
  const stopDays = Array.from({ length: s.nights }, (_, k) => ({ stopId: s.id, dayOffset: k, date: addDays(arrive, k) }));

  return (
    <section className={`card stop ${selected ? 'selected' : ''}`} data-stop-id={s.id}>
      <div className={`leg ${over ? 'over' : ''}`}>
        {leg ? (
          <>
            🚗 {fmtDuration(leg.durationS)} · {fmtKm(leg.distanceM)} from {index === 0 ? plan.start.name : plan.stops[index - 1].name}
            {over && <span className="badge warn">over your {plan.input.maxDriveHours}h limit</span>}
          </>
        ) : (
          <span className="muted">Working out the drive…</span>
        )}
      </div>
      <header onClick={onSelect}>
        <span className="num">{index + 1}</span>
        <div className="grow">
          <h3>{s.name}</h3>
          <div className="muted small">
            {fmtDate(arrive)} → {fmtDate(depart)}
          </div>
        </div>
        <div className="nights" onClick={(e) => e.stopPropagation()}>
          <button aria-label={`One fewer night at ${s.name}`} disabled={s.nights <= 1} onClick={() => onOps([{ type: 'set_nights', stop_id: s.id, nights: s.nights - 1 }])}>
            −
          </button>
          <span>
            {s.nights} night{s.nights > 1 ? 's' : ''}
          </span>
          <button aria-label={`One more night at ${s.name}`} onClick={() => onOps([{ type: 'set_nights', stop_id: s.id, nights: s.nights + 1 }])}>
            +
          </button>
        </div>
      </header>

      <div className="camp-row">
        <a
          className="hipcamp"
          href={hipcampSearchUrl({ name: s.name.split(',')[0], lat: s.lat, lng: s.lng, arrive, depart })}
          target="_blank"
          rel="noreferrer"
        >
          ⛺ Find 2WD drive-in tent sites on Hipcamp
        </a>
        <span className="muted small">
          {camps === null
            ? pois && pois !== 'loading'
              ? "Couldn't check for campsites: OpenStreetMap's server is busy."
              : 'Checking for campsites…'
            : camps.length
              ? `${camps.length} campsite${camps.length > 1 ? 's' : ''} mapped within 15 km`
              : '⚠ No campsites mapped within 15 km. Hipcamp may still have some.'}
        </span>
      </div>
      <p className="muted tiny">Check the road in on each Hipcamp listing: it should say “2WD accessible”.</p>

      <details open={selected}>
        <summary>Things to see near {s.name.split(',')[0]}</summary>
        <PoiList pois={sights} plan={plan} days={stopDays} onOps={onOps} onFocus={onFocus} origin={s} limit={10} />
        {camps && camps.length > 0 && (
          <div className="camps">
            <div className="muted small">Mapped campsites (OpenStreetMap, may not be on Hipcamp):</div>
            <ul>
              {camps.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <button className="link" onClick={() => onFocus({ lat: c.lat, lng: c.lng, zoom: 13 })}>
                    {c.name}
                  </button>{' '}
                  <span className="muted small">{distKm(s, c).toFixed(0)} km</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="stop-actions">
          {index > 0 || plan.stops.length > 1 ? (
            <button className="ghost small" onClick={() => onOps([{ type: 'remove_stop', stop_id: s.id }])}>
              Remove this stop
            </button>
          ) : null}
          {over && (
            <button className="ghost small" onClick={() => onOps([{ type: 'split_leg', to_stop_id: s.id, nights: 1 }])}>
              Break up this drive
            </button>
          )}
        </div>
      </details>
    </section>
  );
}

function PoiList(props: {
  pois: Poi[] | 'loading' | { error: string } | null | undefined;
  plan: Plan;
  days: { stopId: string | null; dayOffset: number; date: string }[];
  onOps: (ops: PlanOperation[]) => void;
  onFocus: (p: { lat: number; lng: number; zoom?: number }) => void;
  origin?: { lat: number; lng: number };
  limit: number;
}) {
  const { pois, plan, days, onOps, onFocus, origin, limit } = props;
  const [showAll, setShowAll] = useState(false);
  if (!pois || pois === 'loading') return <p className="muted small">Looking for places on OpenStreetMap…</p>;
  if (!Array.isArray(pois)) return <p className="error small">Couldn't load places: {pois.error}</p>;
  const wanted = pois.filter((p) => plan.input.interests.includes(p.kind as any));
  if (!wanted.length) return <p className="muted small">Nothing matching what you like is mapped here.</p>;
  const sorted = origin ? [...wanted].sort((a, b) => distKm(origin, a) - distKm(origin, b)) : wanted;
  const shown = showAll ? sorted : sorted.slice(0, limit);
  const options = days.filter((d) => d.stopId);
  return (
    <>
      <ul className="pois">
        {shown.map((p) => {
          const added = plan.activities.find((a) => a.poi.id === p.id);
          return (
            <li key={p.id}>
              <button className="link" onClick={() => onFocus({ lat: p.lat, lng: p.lng, zoom: 13 })} title="Show on map">
                {kindLabel(p.kind).split(' ')[0]} {p.name}
              </button>
              {origin && <span className="muted small"> {distKm(origin, p).toFixed(0)} km</span>}
              {added ? (
                <button className="ghost small added" onClick={() => onOps([{ type: 'remove_activity', poi_id: p.id }])} title="Remove from the day">
                  ✓ Day {dayNumber(plan, added.stopId, added.dayOffset)}
                </button>
              ) : (
                <select
                  className="add-day"
                  aria-label={`Add ${p.name} to a day`}
                  value=""
                  onChange={(e) => {
                    const [stopId, off] = e.target.value.split('|');
                    onOps([{ type: 'add_activity', poi_id: p.id, stop_id: stopId, day_offset: Number(off) }]);
                  }}
                >
                  <option value="">+ Add to day</option>
                  {options.map((d) => (
                    <option key={`${d.stopId}|${d.dayOffset}`} value={`${d.stopId}|${d.dayOffset}`}>
                      Day {dayNumber(plan, d.stopId!, d.dayOffset)} · {fmtDate(d.date)}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      {sorted.length > limit && (
        <button className="link small" onClick={() => setShowAll((x) => !x)}>
          {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
        </button>
      )}
    </>
  );
}

export function dayNumber(plan: Plan, stopId: string, dayOffset: number) {
  let n = 1;
  for (const s of plan.stops) {
    if (s.id === stopId) return n + dayOffset;
    n += s.nights;
  }
  return n;
}
