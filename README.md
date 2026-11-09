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

## Open questions

- How we get Hipcamp data. Hipcamp doesn't seem to have a public API, and scraping would likely break its
  terms. The first issue is to find out what it does allow.
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

Each stop links to a Hipcamp search for that area and those dates, filtered to tent sites that are 2WD accessible
and park-at-site (`access=two-wheel-drive&access=drive-in`), using the link format from PR #3. The planner never
fetches Hipcamp pages. Check the road access on each listing before booking.

### 2WD and the big tent

- Campsites from OpenStreetMap tagged `4wd_only=yes`, `backcountry=yes` (walk-in), `tents=no` or private are dropped.
  Places to see tagged `4wd_only=yes` are dropped too.
- Extra nights go to the named places (your finish or "head towards" place) so you park once and explore.
- Claude is told the car is 2WD and the tent is big, and to suggest drive-in tent camping only.
