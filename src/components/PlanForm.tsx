import { useState } from 'react';
import { INTERESTS, type Interest, type TripInput } from '../types';
import { nightsBetween } from '../planner';

interface Props {
  initial: TripInput;
  busy: string | null;
  error: string | null;
  onSubmit: (input: TripInput) => void;
}

export function PlanForm({ initial, busy, error, onSubmit }: Props) {
  const [f, setF] = useState<TripInput>(initial);
  const set = <K extends keyof TripInput>(k: K, v: TripInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const nights = nightsBetween(f.startDate, f.endDate);
  const toggle = (i: Interest) =>
    set('interests', f.interests.includes(i) ? f.interests.filter((x) => x !== i) : [...f.interests, i]);
  const problem =
    !f.startQuery.trim()
      ? 'Where are you starting?'
      : f.roundTrip && !f.viaQuery.trim()
        ? 'For a round trip, say where you want to head.'
        : !f.roundTrip && !f.finishQuery.trim()
          ? 'Where does the trip finish?'
          : nights < 1
            ? 'The end date needs to be after the start date.'
            : null;

  return (
    <form
      className="plan-form card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem && !busy) onSubmit(f);
      }}
    >
      <h2>Plan a trip</h2>
      <p className="muted">Car camping in Australia, 2WD only, with a big tent. Each night ends near drive-in tent sites on Hipcamp.</p>

      <label>
        Start
        <input value={f.startQuery} onChange={(e) => set('startQuery', e.target.value)} placeholder="e.g. Brisbane" name="start" />
      </label>

      <label className="check">
        <input type="checkbox" checked={f.roundTrip} onChange={(e) => set('roundTrip', e.target.checked)} name="roundTrip" />
        Round trip (finish back at the start)
      </label>

      {!f.roundTrip && (
        <label>
          Finish
          <input value={f.finishQuery} onChange={(e) => set('finishQuery', e.target.value)} placeholder="e.g. Sydney" name="finish" />
        </label>
      )}

      <label>
        {f.roundTrip ? 'Head towards' : 'Go via (optional)'}
        <input
          value={f.viaQuery}
          onChange={(e) => set('viaQuery', e.target.value)}
          placeholder={f.roundTrip ? 'e.g. Byron Bay' : 'e.g. Port Macquarie'}
          name="via"
        />
      </label>

      <div className="row">
        <label>
          Leave
          <input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} name="startDate" />
        </label>
        <label>
          Home by
          <input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} name="endDate" />
        </label>
      </div>
      <p className="muted small">{nights > 0 ? `${nights} night${nights > 1 ? 's' : ''} away` : ''}</p>

      <label>
        Most driving in a day: <strong>{f.maxDriveHours}h</strong>
        <input
          type="range"
          min={1}
          max={8}
          step={0.5}
          value={f.maxDriveHours}
          onChange={(e) => set('maxDriveHours', Number(e.target.value))}
          name="maxDrive"
        />
      </label>

      <fieldset>
        <legend>What you like</legend>
        <div className="chips">
          {INTERESTS.map((i) => (
            <button
              type="button"
              key={i.id}
              className={`chip ${f.interests.includes(i.id) ? 'on' : ''}`}
              aria-pressed={f.interests.includes(i.id)}
              onClick={() => toggle(i.id)}
            >
              {i.emoji} {i.label}
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit" disabled={!!problem || !!busy}>
        {busy ?? 'Plan the route →'}
      </button>
      {problem && <p className="muted small">{problem}</p>}
    </form>
  );
}
