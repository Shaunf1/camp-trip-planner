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

- How we get Hipcamp data. Answered in [docs/hipcamp-data.md](docs/hipcamp-data.md): there's no API and
  scraping breaks the terms, so the planner links to Hipcamp for each night and uses OpenStreetMap for
  open campsite and road data.
- Where the places to see come from.
