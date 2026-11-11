# Camp trip planner

Plan a car-camping road trip from a start point to a finish point. Each night's stop comes from Hipcamp,
and the planner finds places worth seeing along the way. You plan the trip by talking it through with Claude.

## What the trips look like

- Car camping. The tent is big, so most trips park at one spot and explore nearby. Some are short
  journeys with a few stops.
- Two-wheel drive only, so every campsite and stop needs to be reachable without 4WD.
- A start point and a finish point. They can be the same place, for a round trip.

## What it should do

1. Take a start, a finish, the dates and how far we're happy to drive each day.
2. Suggest a route with an overnight stop at a Hipcamp site each night, and only sites a 2WD car can reach.
3. Find places to see near the route and near each campsite: lookouts, walks, swimming spots, towns.
4. Let us change the plan by asking Claude, for example "one more night here" or "skip the long drive on day 2".

## Hipcamp data

The planner reads Hipcamp's public location pages to show real listings near each night's stop, with ratings,
reviews, prices, amenities and photos. See [docs/hipcamp-data.md](docs/hipcamp-data.md) for how it works and
what it covers.

## Open questions

- Where the places to see come from.

## Running the prototype

```sh
npm install
npm run dev          # http://localhost:5175
```

Needs Node 20 or later. The flow is: **Plan** (start, finish or round trip, dates, daily driving limit, what you like) →
**Route & stops** (map, one card per overnight area, Hipcamp link, things to see, Claude chat) → **The trip**
(day-by-day summary you can print or download as Markdown). The plan is saved in the browser, so a reload keeps it.

### The Claude chat uses your Claude login

There's no API key. The dev server runs the locally signed-in Claude Code CLI (`claude -p`, model
`claude-sonnet-5-5`, no tools) and asks it for a structured plan change: a short reply plus a list of operations
such as `set_nights`, `add_stop` or `split_leg`. The browser applies those operations to the plan, so every change
shows up on the map and in the stop list. If `ANTHROPIC_API_KEY` happens to be set, it's ignored for the chat.

If Claude Code isn't installed or isn't signed in, the chat panel says so. Run `claude auth login` and reload.
Set `CLAUDE_BIN` if `claude` isn't on your `PATH`.

### Data sources and keeping it polite

All map calls go through the dev server (`server/api.ts`), which sends a `User-Agent`, caches answers on disk in
`.cache/` for a week, and queues calls so they never burst.

| What | Service | Limits we keep to |
|---|---|---|
| Map tiles | OpenStreetMap tile server | Attribution shown, normal browser use |
| Place search | Nominatim | One request at a time, at least 1.1 s apart, Australia only |
| Driving routes | Public OSRM demo server | One request at a time, 1 s apart |
| Things to see, campsites | Overpass API | One query at a time; all stops share one query; retries with a pause when busy, then a public mirror |

The public Overpass server can be slow or busy. When it is, the top bar says so and offers **Try again**.

### Hipcamp

Each stop lists real Hipcamp listings within 40 km: photo, link, % of reviewers who recommend it, number of
reviews, price and amenities. You can filter them (rating, toilets, showers, campfires, pets, water, power, tent
sites only) and sort them (best rated, closest, cheapest). **Stay here** saves a listing as that stop's campsite,
and it then shows in the day-by-day trip and the Markdown download. You can also ask the chat, for example
"at Coffs pick the best rated tent spot with showers".

The dev server reads Hipcamp's public web pages (`server/hipcamp.ts`; the details are in
[docs/hipcamp-data.md](docs/hipcamp-data.md)). It stays polite:

- It only reads the "top spots" location pages for states, regions and towns
  (e.g. `/en-AU/d/australia/new-south-wales/coffs-harbour/camping/all`), which Hipcamp's `robots.txt` allows.
  It never calls `/api` or `/graphql`, which `robots.txt` asks bots to leave alone.
- One request at a time, 3 seconds apart, with our User-Agent, and at most 30 new pages per request.
- Each page is cached on disk for a week, so the first look at an area takes up to a minute and later ones
  are instant.

Coverage is what those pages show: about 20 to 30 top listings per town or region, so it's not every listing.
Each stop also keeps a link to the full Hipcamp search for those dates, filtered to tent sites that are 2WD
accessible and park-at-site. The location pages don't say whether the road in is 2WD, so check that on each
listing before booking.

Orca's built-in browser doesn't open links in new tabs, so every Hipcamp link has a **Copy link** button.

### 2WD and the big tent

- Campsites from OpenStreetMap tagged `4wd_only=yes`, `backcountry=yes` (walk-in), `tents=no` or private are dropped.
  Places to see tagged `4wd_only=yes` are dropped too.
- Extra nights go to the named places (your finish or "head towards" place) so you park once and explore.
- Claude is told the car is 2WD and the tent is big, and to suggest drive-in tent camping only.
