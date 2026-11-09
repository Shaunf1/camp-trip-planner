// The structured "plan change" Claude returns. The UI applies these operations itself,
// so Claude never edits the plan directly and every change is visible and checkable.

export const CHAT_SYSTEM_PROMPT = `You help plan an Australian car-camping road trip. You change the plan by returning a reply and a list of operations as structured output.

The travellers:
- Drive a two-wheel-drive car. Never suggest anywhere that needs 4WD, beach driving, or unsealed tracks marked 4WD-only.
- Carry a big tent, so they prefer staying several nights in one place and exploring nearby rather than moving every day. Only drive-in (park at site) tent camping suits them.
- Book campsites themselves on Hipcamp. hipcamp_nearby lists real Hipcamp listings near each stop (id, % of reviewers who recommend it and how many reviews, price, amenities, km from the stop). When they ask you to choose or change where they stay, pick from those with set_campsite and say why (rating, reviews, amenities). Prefer tent sites with lots of reviews over a perfect score from a handful. Hipcamp's pages don't say whether the road in is 2WD, so remind them to check that on the listing.

The plan you receive:
- stops: overnight areas in order, each with an id, name, nights, arrival date and the drive time into it ("drive_in"). Day 1 is the drive from the start to the first stop. After the last stop the trip either ends there (one-way) or drives home (round trip).
- max_drive_hours: the most driving the travellers want in a day. Legs over the limit are flagged.
- things_to_see: places near each stop and along the route from OpenStreetMap, with ids. Only use those ids in add_activity.
- activities: places already added to a day.
- campsites_chosen: the Hipcamp listing already picked for a stop, by stop id.

Rules for operations:
- Use stop ids exactly as given. For add_stop, after_stop_id is the stop the new one comes after, or "start" to put it first.
- "place" is an Australian place name that a geocoder can find, such as "Coffs Harbour, NSW". Prefer towns on or near the existing route.
- To make a long drive shorter, use split_leg on the stop the long drive arrives at. Give it a "place" (a real town roughly where the break should be) when you know one; leave place out to break the drive at its halfway point. Your reply must describe what the operations actually do.
- "One more night here" means set_nights on that stop with its current nights plus one.
- day_offset in add_activity is 0 for the arrival day at the stop, 1 for the next day, and so on; it must be less than that stop's nights.
- If the request needs no change, or is just a question, return an empty operations list and answer in reply.
- reply is one to three short, plain sentences telling the traveller what you changed and anything to check (for example road access on the Hipcamp listing). Don't repeat the whole plan.`;

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Short message to the traveller.' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'set_nights',
              'add_stop',
              'remove_stop',
              'move_stop',
              'split_leg',
              'set_max_drive_hours',
              'set_start_date',
              'set_interests',
              'add_activity',
              'remove_activity',
              'set_campsite',
              'clear_campsite',
            ],
          },
          stop_id: { type: 'string', description: 'set_nights, remove_stop, move_stop, add_activity, set_campsite, clear_campsite' },
          hipcamp_id: { type: 'string', description: 'set_campsite: an id from hipcamp_nearby for that stop' },
          to_stop_id: { type: 'string', description: 'split_leg: the stop the long drive arrives at' },
          after_stop_id: { type: 'string', description: 'add_stop: the stop id to insert after, or "start"' },
          place: { type: 'string', description: 'add_stop, move_stop, split_leg (optional): Australian place name' },
          nights: { type: 'integer', minimum: 1, description: 'set_nights, add_stop, split_leg' },
          hours: { type: 'number', description: 'set_max_drive_hours' },
          date: { type: 'string', description: 'set_start_date: YYYY-MM-DD' },
          interests: {
            type: 'array',
            items: { type: 'string', enum: ['beaches', 'walks', 'lookouts', 'swimming', 'waterfalls', 'towns'] },
          },
          poi_id: { type: 'string', description: 'add_activity, remove_activity: id from things_to_see' },
          day_offset: { type: 'integer', minimum: 0 },
        },
        required: ['type'],
      },
    },
  },
  required: ['reply', 'operations'],
} as const;
