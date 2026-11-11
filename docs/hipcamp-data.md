# How the planner gets Hipcamp data

Answers [#2](https://github.com/Shaunf1/camp-trip-planner/issues/2). Decided on 11 November 2026, after the
prototype in [#6](https://github.com/Shaunf1/camp-trip-planner/pull/6).

## What we do

**The planner reads Hipcamp's public location pages and shows real listings near each night's stop.**

Hipcamp publishes a "top spots" page for each state, region and town, for example
[Coffs Harbour](https://www.hipcamp.com/en-AU/d/australia/new-south-wales/coffs-harbour/camping/all).
Each page carries 20 to 30 listings, and for each one we get:

- name, link to the listing, and location
- % of reviewers who recommend it, and how many reviews
- price per night
- what it offers: tent, RV or cabin, and amenities (toilets, showers, campfires, pets, drinking water, power, …)
- a cover photo and short description

The dev server (`server/hipcamp.ts` and `/api/hipcamp` in `server/api.ts`) finds the pages for each stop:

1. The state's page. Its links lead to the region pages.
2. The page for the stop's own town, when Hipcamp has one. Each town page links to the towns around it.
3. The linked town and region pages whose centre is within about 65 km of a stop, nearest first.

It then keeps the listings within 40 km of each stop. In the app you filter them (rating, amenities, tent sites
only), sort them (best rated, closest, cheapest) and pick one with **Stay here**, or ask the chat to pick. The
chosen campsite goes into the day-by-day trip and the Markdown download.

### Staying polite

- Only location pages under `/d/...`, which Hipcamp's [robots.txt](https://www.hipcamp.com/robots.txt) allows.
  Nothing under `/api`, `/graphql`, `*.json`, reviews pages or filtered URLs, which it asks bots to avoid.
- One request at a time, 3 seconds apart, sent with our User-Agent.
- At most 30 new pages per planning request.
- Every page is cached on disk for a week (`.cache/api-cache.json`). The first look at an area takes up to a
  minute; after that it's instant and costs Hipcamp nothing.
- A page that comes back without listings (for example a bot check) isn't cached, so a bad answer never sticks.

### What this doesn't cover

- **Every listing.** Location pages list each area's top 20 to 30. The full "everything near this point" search
  runs through Hipcamp's `/graphql`, which we don't call. Each stop keeps a link to the full Hipcamp search for
  those dates, filtered to tents and 2WD drive-in sites.
- **2WD access.** Since March 2026, Hipcamp listings say whether a site is "2WD accessible", "4WD recommended" or
  "4WD required" ([OVR Mag](https://www.ovrmag.com/news/hipcamp-adds-car-camping-and-rooftop-tent-filters/946.article)).
  That label is only on the listing page, which loads in the browser, so we can't read it. The app and the chat
  remind you to check it before booking.
- **Availability and booking.** Those stay on Hipcamp.

### If Hipcamp changes its pages

The parser looks for the page's embedded Next.js data (`__NEXT_DATA__`) and the `DiscoverLand` objects inside
it. If Hipcamp renames those or changes its URLs, the lists come back empty and the app shows "Couldn't read
Hipcamp" with a **Try again** button. The search link on each stop keeps working either way.

## Other routes we looked at

| Route | Result |
|---|---|
| Public API | None. Hipcamp's [`llms.txt`](https://www.hipcamp.com/llms.txt) says it "does not document a public booking API". |
| Partner integrations | Private, and for hosts syncing their own inventory into Hipcamp, not for reading listings. |
| Partnership enquiries | Hipcamp's [help page](https://support.hipcamp.com/hc/en-us/articles/360052569451-How-do-I-inquire-about-partnering-with-Hipcamp) says it isn't exploring new partnerships for now. |
| Affiliate program | The [Ambassador program](https://campaigns.hipcamp.com/ambassadors) is for content creators and gives no data. |
| Data export | Only a host's own iCal calendar. |

Hipcamp's [Terms of Use](https://www.hipcamp.com/en-AU/terms) (26 March 2026, §1.6(e) and §5(vii)) don't allow
automated downloading of its pages. This is a personal project, used to plan our own trips, and we've chosen
to read the public pages anyway, gently and with caching. If it ever became a product for other people, this
would need revisiting, for example by asking Hipcamp for access.

## Open data alongside Hipcamp

- **OpenStreetMap** (via Overpass) gives campsites that may not be on Hipcamp, such as national park and council
  campgrounds, plus places to see. Campsites tagged `4wd_only=yes`, `backcountry=yes` (walk-in), `tents=no` or
  private are dropped. Credit: © OpenStreetMap contributors ([ODbL](https://www.openstreetmap.org/copyright)).
- Road tags give a rough 2WD signal where they're mapped:
  [`4wd_only`](https://wiki.openstreetmap.org/wiki/Key:4wd_only),
  [`smoothness`](https://wiki.openstreetmap.org/wiki/Key:smoothness) and
  [`tracktype`](https://wiki.openstreetmap.org/wiki/Key:tracktype) (`grade4` and `grade5` aren't 2WD roads).
  An untagged road means "unknown, check", never "2WD OK".
- Australian state parks have no open campground dataset with access details. Use OSM and the state parks'
  own booking sites.

Earlier research for this question is in PR [#3](https://github.com/Shaunf1/camp-trip-planner/pull/3) and
PR [#4](https://github.com/Shaunf1/camp-trip-planner/pull/4).
