import type { Day, Plan } from '../types';
import { INTERESTS } from '../types';
import { addDays, arrivalDate, fmtDate, fmtDuration, fmtKm } from '../planner';
import { hipcampSearchUrl } from '../hipcamp';

const emoji = (k: string) => (k === 'camp' ? '⛺' : INTERESTS.find((i) => i.id === k)?.emoji ?? '📍');

function campLink(plan: Plan, stopId: string) {
  const s = plan.stops.find((x) => x.id === stopId)!;
  const arrive = arrivalDate(plan, s.id);
  return hipcampSearchUrl({ name: s.name.split(',')[0], lat: s.lat, lng: s.lng, arrive, depart: addDays(arrive, s.nights) });
}

export function tripMarkdown(plan: Plan, days: Day[]): string {
  const lines = [
    `# ${plan.start.name} → ${plan.input.roundTrip ? 'round trip' : plan.finish.name}`,
    '',
    `${fmtDate(plan.input.startDate)} to ${fmtDate(days[days.length - 1].date)} · ${days.length - 1} nights · 2WD, big tent`,
    '',
  ];
  for (const d of days) {
    lines.push(`## Day ${d.index + 1} · ${fmtDate(d.date)}: ${d.title}`);
    if (d.leg) lines.push(`- Drive ${d.leg.from} → ${d.leg.to}: ${fmtDuration(d.leg.durationS)}, ${fmtKm(d.leg.distanceM)}`);
    for (const a of d.activities) lines.push(`- ${emoji(a.poi.kind)} ${a.poi.name} (https://www.openstreetmap.org/${a.poi.id})`);
    if (d.stopId && d.dayOffset === 0) {
      const s = plan.stops.find((x) => x.id === d.stopId)!;
      lines.push(`- Camp: ${s.name}, ${s.nights} night${s.nights > 1 ? 's' : ''}. Hipcamp (2WD, drive-in tent sites): ${campLink(plan, s.id)}`);
    }
    lines.push('');
  }
  lines.push('Map data © OpenStreetMap contributors. Check road access on each Hipcamp listing before booking.');
  return lines.join('\n');
}

export function TripSummary({ plan, days }: { plan: Plan; days: Day[] }) {
  const download = () => {
    const blob = new Blob([tripMarkdown(plan, days)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `camp-trip-${plan.input.startDate}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const totalDrive = days.reduce((t, d) => t + (d.leg?.durationS ?? 0), 0);
  const totalKm = days.reduce((t, d) => t + (d.leg?.distanceM ?? 0), 0);

  return (
    <div className="summary">
      <div className="summary-head">
        <div>
          <h2>
            {plan.start.name} → {plan.input.roundTrip ? 'round trip' : plan.finish.name}
          </h2>
          <p className="muted">
            {fmtDate(plan.input.startDate)} to {fmtDate(days[days.length - 1].date)} · {days.length - 1} nights · {plan.stops.length} camp
            {plan.stops.length > 1 ? 's' : ''} · {fmtDuration(totalDrive)} driving, {fmtKm(totalKm)}
          </p>
        </div>
        <div className="no-print actions">
          <button onClick={() => window.print()}>Print or save as PDF</button>
          <button onClick={download}>Download as Markdown</button>
        </div>
      </div>
      <ol className="days">
        {days.map((d) => {
          const stop = d.stopId ? plan.stops.find((s) => s.id === d.stopId) : null;
          return (
            <li key={d.index} className={`day card ${d.leg ? 'drive' : 'stay'}`}>
              <div className="day-date">
                <span className="dnum">Day {d.index + 1}</span>
                <span>{fmtDate(d.date)}</span>
              </div>
              <div className="grow">
                <h3>{d.title}</h3>
                {d.leg && (
                  <p>
                    🚗 {d.leg.from} → {d.leg.to}: {fmtDuration(d.leg.durationS)}, {fmtKm(d.leg.distanceM)}
                  </p>
                )}
                {d.activities.length > 0 && (
                  <ul>
                    {d.activities.map((a) => (
                      <li key={a.poi.id}>
                        {emoji(a.poi.kind)}{' '}
                        <a href={`https://www.openstreetmap.org/${a.poi.id}`} target="_blank" rel="noreferrer">
                          {a.poi.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {!d.leg && d.activities.length === 0 && d.stopId && <p className="muted">Free day. Add things to see from the route view.</p>}
                {stop && (
                  <p className="camp">
                    ⛺ Night {d.dayOffset + 1} of {stop.nights} at {stop.name}
                    {d.dayOffset === 0 && (
                      <>
                        {' · '}
                        <a href={campLink(plan, stop.id)} target="_blank" rel="noreferrer">
                          Hipcamp: 2WD drive-in tent sites
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="muted small">Map data © OpenStreetMap contributors. Check road access on each Hipcamp listing before booking.</p>
    </div>
  );
}
