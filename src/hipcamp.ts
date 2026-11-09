// Hipcamp search links, built by hand from the format checked in PR #3.
// The planner only links to Hipcamp. It never fetches or reads Hipcamp pages.
export function hipcampSearchUrl(opts: { name: string; lat: number; lng: number; arrive: string; depart: string }) {
  const p = new URLSearchParams();
  p.set('q', opts.name);
  p.set('lat', opts.lat.toFixed(4));
  p.set('lng', opts.lng.toFixed(4));
  p.set('arrive', opts.arrive);
  p.set('depart', opts.depart);
  p.set('accommodations', 'tents');
  p.append('access', 'two-wheel-drive');
  p.append('access', 'drive-in');
  return `https://www.hipcamp.com/en-AU/search?${p.toString()}`;
}
