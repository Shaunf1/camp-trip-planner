import { useState } from 'react';
import type { HipcampSpot, PlanOperation, Stop } from '../types';

export type SpotResult = HipcampSpot[] | 'loading' | { error: string };

export interface SpotFilters {
  minPct: number;
  features: string[];
  tentsOnly: boolean;
  sort: 'rating' | 'distance' | 'price';
}
export const DEFAULT_FILTERS: SpotFilters = { minPct: 0, features: [], tentsOnly: true, sort: 'rating' };

export const FEATURES: { slug: string; label: string; emoji: string }[] = [
  { slug: 'toilet', label: 'Toilets', emoji: '🚻' },
  { slug: 'shower', label: 'Showers', emoji: '🚿' },
  { slug: 'fire', label: 'Campfires', emoji: '🔥' },
  { slug: 'pets', label: 'Pets', emoji: '🐕' },
  { slug: 'water', label: 'Drinking water', emoji: '🚰' },
  { slug: 'electricity-hookup', label: 'Power', emoji: '🔌' },
];
// RV-only hookups aren't useful for a tent, so they aren't shown
const EXTRA_EMOJI: Record<string, string> = { wifi: '📶', 'hot-tub': '♨️', 'picnic-table': '🪑', 'cooking-equipment': '🍳' };
const HIDDEN = new Set(['water-hookup', 'sewage-hookup']);

/** % recommended, pulled towards 90% when there are only a few reviews, so 100% of 3 doesn't beat 99% of 900 */
const score = (x: HipcampSpot) => (x.recommendsPct === null ? 0 : (x.recommendsPct * x.recommendsCount + 90 * 10) / (x.recommendsCount + 10));

export function filterSpots(spots: HipcampSpot[], f: SpotFilters) {
  const out = spots.filter(
    (x) =>
      (!f.tentsOnly || x.accommodations.includes('tent')) &&
      (f.minPct === 0 || (x.recommendsPct ?? 0) >= f.minPct) &&
      f.features.every((slug) => x.features.some((y) => y.slug === slug)),
  );
  if (f.sort === 'rating') out.sort((a, b) => score(b) - score(a));
  if (f.sort === 'distance') out.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  if (f.sort === 'price') out.sort((a, b) => (a.priceAud ?? 1e9) - (b.priceAud ?? 1e9));
  return out;
}

export function FilterBar({ filters, onChange }: { filters: SpotFilters; onChange: (f: SpotFilters) => void }) {
  const toggle = (slug: string) =>
    onChange({ ...filters, features: filters.features.includes(slug) ? filters.features.filter((x) => x !== slug) : [...filters.features, slug] });
  return (
    <section className="card filters">
      <h3>Hipcamp spots: what you want</h3>
      <div className="filter-row">
        <label>
          Rating{' '}
          <select value={filters.minPct} onChange={(e) => onChange({ ...filters, minPct: Number(e.target.value) })} name="minPct">
            <option value={0}>Any</option>
            <option value={90}>90%+ recommend</option>
            <option value={95}>95%+ recommend</option>
            <option value={98}>98%+ recommend</option>
          </select>
        </label>
        <label>
          Sort{' '}
          <select value={filters.sort} onChange={(e) => onChange({ ...filters, sort: e.target.value as SpotFilters['sort'] })} name="sort">
            <option value="rating">Best rated</option>
            <option value="distance">Closest</option>
            <option value="price">Cheapest</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.tentsOnly} onChange={(e) => onChange({ ...filters, tentsOnly: e.target.checked })} name="tentsOnly" />
          Tent sites only
        </label>
      </div>
      <div className="chips">
        {FEATURES.map((x) => (
          <button
            key={x.slug}
            type="button"
            className={`chip small ${filters.features.includes(x.slug) ? 'on' : ''}`}
            aria-pressed={filters.features.includes(x.slug)}
            onClick={() => toggle(x.slug)}
          >
            {x.emoji} {x.label}
          </button>
        ))}
      </div>
    </section>
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="ghost small"
      title={url}
      onClick={async () => {
        if (await copy(url)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      {done ? '✓ Copied' : 'Copy link'}
    </button>
  );
}

export function SpotList(props: {
  stop: Stop;
  result: SpotResult | undefined;
  filters: SpotFilters;
  onOps: (ops: PlanOperation[]) => void;
  onFocus: (p: { lat: number; lng: number; zoom?: number }) => void;
}) {
  const { stop, result, filters, onOps, onFocus } = props;
  const [showAll, setShowAll] = useState(false);
  if (!result || result === 'loading')
    return <p className="muted small">Reading Hipcamp… The first look at an area takes up to a minute, then it's saved.</p>;
  if (!Array.isArray(result)) return <p className="error small">Couldn't read Hipcamp: {result.error}</p>;
  const shown = filterSpots(result, filters);
  if (!result.length) return <p className="muted small">Hipcamp's public pages list nothing within 40 km. Try the search link.</p>;
  if (!shown.length) return <p className="muted small">{result.length} Hipcamp spots within 40 km, but none match your filters.</p>;
  const list = showAll ? shown : shown.slice(0, 4);
  return (
    <>
      <ul className="spots">
        {list.map((x) => {
          const chosen = stop.camp?.id === x.id;
          return (
            <li key={x.id} className={chosen ? 'chosen' : ''}>
              {x.photo ? <img src={x.photo} alt="" loading="lazy" /> : <div className="no-photo">⛺</div>}
              <div className="grow">
                <a href={x.url} target="_blank" rel="noreferrer" className="spot-name">
                  {x.name}
                </a>
                <div className="small">
                  {x.recommendsPct === null ? (
                    <span className="muted">New, few reviews</span>
                  ) : (
                    <strong>
                      👍 {x.recommendsPct}% <span className="muted">of {x.recommendsCount}</span>
                    </strong>
                  )}
                  {x.price && <> · from {x.price}/night</>} · {x.km} km
                </div>
                <div className="features" aria-label="Amenities">
                  {x.features.filter((f) => !HIDDEN.has(f.slug)).map((f) => (
                    <span key={f.slug} title={f.name}>
                      {FEATURES.find((y) => y.slug === f.slug)?.emoji ?? EXTRA_EMOJI[f.slug] ?? '•'}
                    </span>
                  ))}
                  {!x.accommodations.includes('tent') && <span className="badge warn">no tent sites</span>}
                </div>
                <div className="spot-actions">
                  {chosen ? (
                    <button className="ghost small added" onClick={() => onOps([{ type: 'clear_campsite', stop_id: stop.id }])}>
                      ✓ Staying here
                    </button>
                  ) : (
                    <button className="small" onClick={() => onOps([{ type: 'set_campsite', stop_id: stop.id, hipcamp_id: x.id }])}>
                      Stay here
                    </button>
                  )}
                  <CopyLink url={x.url} />
                  <button className="link small" onClick={() => onFocus({ lat: x.lat, lng: x.lng, zoom: 13 })}>
                    Map
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length > 4 && (
        <button className="link small" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${shown.length}`}
        </button>
      )}
    </>
  );
}
