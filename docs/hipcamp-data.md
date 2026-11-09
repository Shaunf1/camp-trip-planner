# Getting Hipcamp campsite data

Research for [issue #2](https://github.com/Shaunf1/camp-trip-planner/issues/2). Checked 2026-11-09.
This assumes Australian trips, because the README talks about 2WD access. Sources are linked
at the end.

## Recommendation

**Don't pull data from Hipcamp. Link to it.**

1. The planner works out the area for each night from the route, the daily driving limit and the
   things to see.
2. For each night it gives a link to Hipcamp's camping page for that area, and you choose and book
   the site on Hipcamp.
3. To fill gaps, check routes and find public sites, use open data:
   **OpenStreetMap** for campsites and road surfaces, plus park agency pages for official
   closures and access notes.

The other options are closed. Hipcamp has no public API, its terms ban scraping, and it isn't
taking on partners.

## What Hipcamp allows

| Question | Answer |
| --- | --- |
| Public API | **No.** Hipcamp's own `llms.txt` says it "does not document a public booking API" and tells agents: "Do not infer or call undocumented endpoints from frontend network traffic." |
| Partner access | **Not right now.** Hipcamp's help centre says it isn't exploring new partnerships, though an enquiry form still exists. The integrations it does have, such as Campflare and Recreation.gov, are deals it made itself. Host channel managers are for hosts only. |
| Affiliate program | Only the **Ambassador program**: 5% commission on bookings you refer. It gives no access to data. |
| Data export | **None** for people who aren't hosts. |
| Scraping | **Banned.** Terms of Use (last updated 2026-03-26) §1.6(e) ban "spiders, robots, scrapers, crawlers ... data mining tools" used to scrape or download data, with an exception only for public search engines. §5(vii) bans using automated software to "scrape, crawl or spider" any pages. §1.6(f) bans using Hipcamp's content to build a similar or competing service. §1.6(g) bans copying or republishing it. |
| Linking | **Allowed in practice.** The terms don't restrict ordinary links, and §1.6(b) bans only framing. `llms.txt` asks agents to "link to the canonical Hipcamp listing or destination page" for each recommendation. |

### A grey area to decide on

Hipcamp's `robots.txt` allows user-triggered AI fetchers (`Claude-User`, `ChatGPT-User`) to read
most public pages. Its `llms.txt` also expects AI agents to compare live listings for a user. That
conflicts with the scraping ban in the terms. Here's where we land:

- **Never** bulk-crawl Hipcamp, store its listings, or build a database of sites from it. That's
  clearly against §1.6(e) to (g) and §5(vii).
- **Maybe.** When you're planning and ask Claude about one specific listing, Claude could open that
  page and read it for you, the way a person browsing would. Hipcamp's own agent guidance seems to
  expect this, but the terms don't carve it out. Before relying on it, ask Hipcamp Support in
  writing whether it's OK. Until then the planner should work with links alone.

## How the fallback works

**Area for each night.** The planner picks a town or park, with its coordinates, for each night.

**Hipcamp link.** Hipcamp has stable, public area pages at
`https://www.hipcamp.com/en-AU/d/australia/<state>/<place>/camping/all` (an
[example of the pattern](https://hipcamp.com/en-US/d/united-states/california/seaside/camping/all)),
plus park pages such as `/en-AU/discover/new-south-wales/<park-name>`. The planner links to the
nearest area page, and you set the dates and filters on Hipcamp. Search-page URL parameters aren't
documented, so don't build links that depend on them.

**Open campsite data.**

| Source | What it gives | Licence | Notes |
| --- | --- | --- | --- |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) via the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) | `tourism=camp_site` points across Australia, including national park and free camps, plus the road network with its surface tags | ODbL. Credit OpenStreetMap, and share any data derived from it under the same licence | The public Overpass server suits light use: an identifying User-Agent, and well under 10,000 queries a day. Cache results. Heavier or commercial use needs a self-hosted or paid server. |
| NSW NPWS, QPWS, Parks Victoria and other park agency websites | Official campground pages, closures, fire bans and access notes | Each site's own copyright | None of them publishes an open dataset of campgrounds that we could find. Data.NSW, data.sa.gov.au and data.wa.gov.au had none. QLD has only permit statistics. The Victorian dataset is an unofficial GovHack 2016 one-off. Use these pages to check sites, not as a data feed. |

## Can we tell whether a 2WD car can get there?

**Partly. No source gives a reliable yes or no.**

- **Hipcamp:** some listings have a "4WD recommended" or "2WD accessible" tag, and access details
  sit in the host's text and reviews. The tags are loose, hosts reuse them as boilerplate, and
  there's no search filter for them. In any case we can't read them in bulk (see above). So tell
  the user to check the access notes on the listing they pick.
- **OpenStreetMap:** this is the best signal we can compute. Check the last stretch of road into
  the campsite:
  - [`4wd_only=yes`](https://wiki.openstreetmap.org/wiki/Key:4wd_only) means the road is signed
    as 4WD only. **Exclude it.**
  - [`tracktype`](https://wiki.openstreetmap.org/wiki/Key:tracktype) `grade4`/`grade5`,
    [`smoothness`](https://wiki.openstreetmap.org/wiki/Key:smoothness) `very_bad` or worse, or a
    [`surface`](https://wiki.openstreetmap.org/wiki/Key:surface) such as sand or mud mean the road
    is **likely 4WD**.
  - Sealed roads, or `tracktype=grade1`/`grade2` (gravel), are **likely fine for 2WD**.
  - Many tracks have no tags, so report "unknown" rather than guessing "OK".
- **Park agencies:** park pages often state the road access in words. They're the best source for
  public sites, but someone has to read them.

The planner should show 2WD access as **OK, check, or 4WD** with the reason, and never present it
as a guarantee. Weather closures change all the time.

## Open questions

- Ask Hipcamp Support, in writing, whether a user-triggered agent may read individual listing
  pages, and whether there's any partner or data access for a small non-commercial planner.
- Pick an Overpass host (the public server, or a self-hosted one) once we know how many queries
  the planner makes.
- Check whether NSW and QLD park pages state road access in a consistent way.
- This research assumes Australia. For US trips, the federal
  [Recreation.gov RIDB API](https://ridb.recreation.gov/) is an open source of public campgrounds.

## Sources

- Hipcamp Terms of Use (AU), last updated 2026-03-26: <https://www.hipcamp.com/en-AU/terms>
- Hipcamp `llms.txt` (agent guidance): <https://www.hipcamp.com/en-AU/llms.txt>
- Hipcamp `robots.txt`: <https://www.hipcamp.com/robots.txt>
- Hipcamp partnership enquiries: <https://support.hipcamp.com/hc/en-us/articles/360052569451-How-do-I-inquire-about-partnering-with-Hipcamp>
- Hipcamp Ambassador program: <https://campaigns.hipcamp.com/ambassadors>
- Hipcamp and Campflare integration: <https://www.businesswire.com/news/home/20230828317407/en>
- OpenStreetMap copyright and licence: <https://www.openstreetmap.org/copyright>
- OSM attribution guidelines: <https://osmfoundation.org/wiki/Licence/Attribution_Guidelines>
- Overpass API and usage policy: <https://wiki.openstreetmap.org/wiki/Overpass_API>
- OSM tags: [tourism=camp_site](https://wiki.openstreetmap.org/wiki/Tag:tourism%3Dcamp_site),
  [4wd_only](https://wiki.openstreetmap.org/wiki/Key:4wd_only),
  [tracktype](https://wiki.openstreetmap.org/wiki/Key:tracktype),
  [smoothness](https://wiki.openstreetmap.org/wiki/Key:smoothness)
- Unofficial Victorian campgrounds dataset (GovHack 2016): <https://discover.data.vic.gov.au/dataset/parks-victoria-camp-grounds-and-huts>
- QLD camping and vehicle permits dataset: <https://www.data.qld.gov.au/dataset/camping-and-vehicle-permits>
