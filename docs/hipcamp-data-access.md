# Getting Hipcamp campsite data

Research for [#2](https://github.com/Shaunf1/camp-trip-planner/issues/2), carried out on 9 November 2026.
This used web search and Hipcamp's public pages only. Nothing on Hipcamp was scraped and no account was used.

## Recommendation

**Don't pull data out of Hipcamp. Link to it.**

1. For each night, the planner picks the area to stay in. It does this from the route, the daily driving limit
   and open campsite data. It then gives a **Hipcamp search link for that area** and we choose and book the
   site on Hipcamp ourselves.
2. To check that an area has campsites a 2WD car can reach, and to offer a backup when Hipcamp has nothing
   suitable, the planner uses **open data**:
   - **OpenStreetMap** for campsites anywhere, plus the road tags that show 2WD access.
   - **Recreation.gov (RIDB)** and the **NPS API** for US federal and national park campgrounds.
   - Australian state park sites are a gap. See [Open campsite data](#open-campsite-data).
3. Hipcamp listings show whether a site is 2WD accessible, 4WD recommended or 4WD required. Because we can't
   read that label automatically, the planner tells us to check it before we book.

Why: Hipcamp has no public API and no data partnership open to apply for. Its Terms of Use ban scraping and
automated downloading outright. Its own `llms.txt` asks agents to link to Hipcamp pages and not to call its
internal endpoints. A link-out design keeps us within those rules. It also leaves booking and live
availability with Hipcamp, which can do both properly.

## 1. Does Hipcamp offer an API, partner or affiliate access, or a data export?

The short answer is no, not for a project like this.

| Route | What exists | Usable here? |
|---|---|---|
| Public API | None. Hipcamp's own [`llms.txt`](https://www.hipcamp.com/llms.txt) says: *"This file does not document a public booking API."* It also tells agents not to work out or call undocumented endpoints from the site's network traffic. A third-party report card agrees: *"No public developer API"* ([Supergood](https://supergood.ai/api-report-card/hipcamp), checked Nov 2026). | No |
| Partner integrations | These are private. Hipcamp connects campground channel managers such as Cloudbeds, Newbook and Channex by email, through campgrounds@hipcamp.com. Those integrations are for hosts syncing their inventory into Hipcamp, not for reading Hipcamp's listings ([Supergood](https://supergood.ai/api-report-card/hipcamp)). Hipcamp has also built one-off API deals, such as consuming [Recreation.gov availability](https://www.hipcamp.com/journal/camping/product-announcement-hipcamp-now-shares-real-time-federal-campsite-availability) and [Campflare alerts](https://www.businesswire.com/news/home/20230828317407/en). | No |
| Partnership enquiries | Hipcamp's help centre has a page on [how to enquire about partnering](https://support.hipcamp.com/hc/en-us/articles/360052569451-How-do-I-inquire-about-partnering-with-Hipcamp). Search snippets of that page say Hipcamp *isn't exploring new partnerships at the moment* but keeps a form for future consideration. The page itself blocks automated fetches (HTTP 403), so open it in a browser to confirm. | Unlikely |
| Affiliate program | The [Ambassador program](https://campaigns.hipcamp.com/ambassadors) is for content creators who apply with an Instagram, TikTok or YouTube handle. It pays Hipcash stipends, referral credit and affiliate commissions. It offers no data feed. | No data. Links only. |
| Data export | Hosts can only export a one-way iCal calendar for their own listings ([Supergood](https://supergood.ai/api-report-card/hipcamp)). There is no listings export. Hipcamp publishes a [sitemap](https://www.hipcamp.com/sitemaps/v2/main.xml.gz), which is an index of page URLs and not site data. Its Terms still forbid automated downloading of those pages. | No |

## 2. What the Terms of Use say about automated access and scraping

Source: [Hipcamp Terms of Use](https://www.hipcamp.com/en-US/terms), last updated 26 March 2026. The same terms
are published at [en-AU](https://www.hipcamp.com/en-AU/terms), [en-GB](https://hipcamp.com/en-GB/terms) and
[en-CA](https://www.hipcamp.com/en-CA/terms).

- **Section 1.6 "Certain Restrictions", (e):** you shall not use *"any manual or automated software, devices or
  other processes (including but not limited to spiders, robots, scrapers, crawlers, avatars, data mining tools
  or the like) to "scrape" or download data from any web pages contained in the Website"*. The only exception
  is for *public search engines* building *"publicly available searchable indices … but not caches or archives"*.
- **1.6 (f):** you may not access Hipcamp Materials *"in order to build a similar or competitive website,
  application or service"*.
- **1.6 (g):** *"no part of the Hipcamp Materials may be copied, reproduced, distributed, republished"* except
  as the Terms allow.
- **1.6 (b):** no framing of Hipcamp content.
- **Section 5 "User Conduct", (vii):** no *"using manual or automated software or other means to access,
  "scrape," "crawl" or "spider" any pages"*.
- **Section 1.3:** the only licence granted is a limited licence to use the materials for *"your personal or
  internal business purposes"* while using the Services. Unauthorised use ends that licence.

[robots.txt](https://www.hipcamp.com/robots.txt) lets named search and AI crawlers index public pages. It blocks
`/api`, `/graphql`, `*.json`, calendar pages and filtered search URLs for everyone. robots.txt only gives crawler
hints, though. It doesn't override the Terms, which forbid scraping for anyone who isn't a public search engine.

**Conclusion:** scraping Hipcamp, calling its internal API or caching its listings would breach the Terms. Linking
to Hipcamp pages is fine, and Hipcamp's `llms.txt` asks for it: *"Link to the canonical Hipcamp listing or
destination page used for each recommendation."*

## 3. Can we tell if a 2WD car can reach a site?

**On Hipcamp, yes, but only by reading the listing.** In March 2026, Hipcamp
[improved the access details on listings](https://www.ovrmag.com/news/hipcamp-adds-car-camping-and-rooftop-tent-filters/946.article)
*"making it clearer whether a site is 2WD accessible, 4WD recommended, or 4WD required"*. The same update added
search filters for car camping, rooftop tents and truck campers, and renamed "RV type" to "Rig type". Listings
show the label under parking. Some hosts also put it in the listing name, for example
[this 4x4-only site](https://www.hipcamp.com/en-US/land/california-el-captain-s-view-4x4-only-yosemite-1xmhqyq5).
None of the press coverage mentions a 2WD **search filter**. Hipcamp's
[search filters help page](https://support.hipcamp.com/hc/en-us/articles/7924872522260-How-to-use-search-filters)
blocks automated reads, so check it in a browser. If a filter exists, the search link should include it.

**In open data, roughly, from the roads.** OpenStreetMap campsites don't record 2WD access, but the roads leading
to them can be tagged:

- [`4wd_only=yes`](https://wiki.openstreetmap.org/wiki/Key:4wd_only) marks a road signed as 4WD only. This tag
  is common in Australia.
- [`smoothness`](https://wiki.openstreetmap.org/wiki/Key:smoothness) describes the vehicle a road needs. A value
  of `bad` or better suits a normal car. `very_bad` needs a high-clearance vehicle, and anything worse needs 4WD.
- [`tracktype`](https://wiki.openstreetmap.org/wiki/Key:tracktype) runs from `grade1` (sealed) to `grade5` (soft
  and unimproved). Treat `grade4` and `grade5` as unsafe for 2WD.
- `highway=track` with none of those tags is unknown. Flag it rather than assuming either way.

Tag coverage varies a lot between areas. The planner should treat a road with no tags as "unknown, check" and
never as "2WD OK".

Recreation.gov campsites carry attributes such as *Driveway Surface* (for example "Paved") and site access
([PostHog RIDB schema notes](https://posthog.com/docs/cdp/sources/recreation)). Those describe the site's pad,
not the road in, but they help.

## 4. The fallback: a Hipcamp search link per night plus open data

### Hipcamp search links

Hipcamp doesn't document its URL format. Two link styles appear in public pages:

- **Destination pages**, listed in `llms.txt`, for example
  `https://www.hipcamp.com/en-AU/d/australia/new-south-wales/camping/all`. These are stable, but only cover
  named places.
- **Map search**, which centres on a point, as seen in a
  [public example](https://apify.com/lexis-solutions/hipcamp-scraper):
  `https://www.hipcamp.com/en-AU/search?lat=<lat>&lng=<lng>&q=<place name>`.
  The parameter names come from that example, not from Hipcamp. Date parameters aren't documented, so before
  building this, run a dated search in a browser and copy the parameter names from the address bar. If
  Hipcamp changes the format, fall back to a destination page.

A link is just a link. The planner never fetches it, so this stays within the Terms.

### Open campsite data

| Source | Covers | Access | Terms | Notes |
|---|---|---|---|---|
| [OpenStreetMap](https://wiki.openstreetmap.org/wiki/Tag:tourism%3Dcamp_site) via [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) | Campsites worldwide (`tourism=camp_site`), plus `fee`, `reservation`, `website` and capacity tags, and road tags for 2WD | Free. The public Overpass server asks for under 10,000 queries and 1 GB a day, a User-Agent, no parallel queries, and caching. Use a paid or self-hosted server for heavy or commercial use. | [ODbL](https://www.openstreetmap.org/copyright): credit "© OpenStreetMap contributors", and share alike if we publish a derived database | Best single source for 2WD checks and places to see. Quality varies by area. |
| [Recreation.gov RIDB](https://www.recreation.gov/use-our-data) | US federal campgrounds and campsites (Forest Service, BLM, NPS, Army Corps and others), with campsite attributes | Free key, sent in an `apikey` header, base URL `https://ridb.recreation.gov/api/v1`. About 50 requests a minute, according to [third-party docs](https://docs.airbyte.com/integrations/sources/recreation). | Free for anyone. Credit "Data Source: Recreation.gov". | US only |
| [NPS API](https://www.nps.gov/subjects/developer/get-started.htm) | US national park campgrounds (`/campgrounds`), with amenities, accessibility, reservations and coordinates | Free 40-character key. 1,000 requests an hour. | Generally public domain. Credit the NPS ([disclaimer](https://www.nps.gov/aboutus/disclaimer.htm)). | US only |
| Australian state parks | No open campground inventory with 2WD fields turned up. Queensland's [camping and vehicle permits](https://data.qld.gov.au/dataset/camping-and-vehicle-permits) dataset (CC BY 4.0) holds booking records, not sites. [NSW Rest Areas](https://opendata.transport.nsw.gov.au/data/dataset/nsw-rest-areas) has an API and includes some NPWS sites. | — | — | Use OSM for Australian parks. Link to the state parks booking sites, and check park alert pages for road closures. |

## Open questions

- **Country.** The README doesn't say where we'll be camping. RIDB and NPS only help in the US. For Australia,
  OSM is the main open source.
- **Partnership.** Asking Hipcamp directly costs nothing, but its help centre suggests it isn't taking new
  partners. Worth a later try if the project grows.
- **Confirm in a browser:** whether Hipcamp has a 2WD search filter, and the date parameter names for search
  links. Both help pages block automated reads.

## Sources

- Hipcamp Terms of Use: https://www.hipcamp.com/en-US/terms (en-AU: https://www.hipcamp.com/en-AU/terms)
- Hipcamp robots.txt: https://www.hipcamp.com/robots.txt
- Hipcamp llms.txt: https://www.hipcamp.com/llms.txt
- Hipcamp partnering help page: https://support.hipcamp.com/hc/en-us/articles/360052569451-How-do-I-inquire-about-partnering-with-Hipcamp
- Hipcamp search filters help page: https://support.hipcamp.com/hc/en-us/articles/7924872522260-How-to-use-search-filters
- Hipcamp Ambassador program: https://campaigns.hipcamp.com/ambassadors
- Hipcamp and Recreation.gov integration: https://www.hipcamp.com/journal/camping/product-announcement-hipcamp-now-shares-real-time-federal-campsite-availability
- Hipcamp and Campflare: https://www.businesswire.com/news/home/20230828317407/en
- Supergood API report card for Hipcamp: https://supergood.ai/api-report-card/hipcamp
- OVR Mag, Hipcamp car-camping filters and 2WD/4WD labels (14 Mar 2026): https://www.ovrmag.com/news/hipcamp-adds-car-camping-and-rooftop-tent-filters/946.article
- OSM: https://wiki.openstreetmap.org/wiki/Tag:tourism%3Dcamp_site, https://wiki.openstreetmap.org/wiki/Key:4wd_only,
  https://wiki.openstreetmap.org/wiki/Key:smoothness, https://wiki.openstreetmap.org/wiki/Key:tracktype,
  https://www.openstreetmap.org/copyright, https://wiki.openstreetmap.org/wiki/Overpass_API
- Recreation.gov data: https://www.recreation.gov/use-our-data
- NPS API: https://www.nps.gov/subjects/developer/get-started.htm, https://www.nps.gov/aboutus/disclaimer.htm
- Queensland camping permits data: https://data.qld.gov.au/dataset/camping-and-vehicle-permits
- NSW Rest Areas: https://opendata.transport.nsw.gov.au/data/dataset/nsw-rest-areas
