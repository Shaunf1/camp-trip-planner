export type Interest = 'beaches' | 'walks' | 'lookouts' | 'swimming' | 'waterfalls' | 'towns';

export const INTERESTS: { id: Interest; label: string; emoji: string }[] = [
  { id: 'beaches', label: 'Beaches', emoji: '🏖️' },
  { id: 'walks', label: 'Walks', emoji: '🥾' },
  { id: 'lookouts', label: 'Lookouts', emoji: '🔭' },
  { id: 'swimming', label: 'Swimming spots', emoji: '🏊' },
  { id: 'waterfalls', label: 'Waterfalls', emoji: '💧' },
  { id: 'towns', label: 'Towns', emoji: '🏘️' },
];

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

export interface TripInput {
  startQuery: string;
  finishQuery: string;
  viaQuery: string;
  roundTrip: boolean;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  maxDriveHours: number;
  interests: Interest[];
}

export interface Stop extends Place {
  id: string;
  nights: number;
  /** true when the stop is one of the trip's named places, false when the planner placed it on the route */
  anchor: boolean;
}

export interface Leg {
  durationS: number;
  distanceM: number;
}

export interface Poi {
  id: string; // OSM type/id
  name: string;
  kind: Interest | 'camp';
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

export interface Activity {
  poi: Poi;
  stopId: string;
  /** 0 = the day you arrive at the stop */
  dayOffset: number;
}

export interface Plan {
  input: TripInput;
  start: Place;
  finish: Place;
  stops: Stop[];
  activities: Activity[];
}

export interface Day {
  index: number;
  date: string;
  title: string;
  stopId: string | null; // where you sleep that night (null on the last day)
  dayOffset: number;
  leg?: Leg & { from: string; to: string };
  activities: Activity[];
}

export type PlanOperation =
  | { type: 'set_nights'; stop_id: string; nights: number }
  | { type: 'add_stop'; place: string; after_stop_id: string; nights: number }
  | { type: 'remove_stop'; stop_id: string }
  | { type: 'move_stop'; stop_id: string; place: string }
  | { type: 'split_leg'; to_stop_id: string; nights: number; place?: string }
  | { type: 'set_max_drive_hours'; hours: number }
  | { type: 'set_start_date'; date: string }
  | { type: 'set_interests'; interests: Interest[] }
  | { type: 'add_activity'; poi_id: string; stop_id: string; day_offset: number }
  | { type: 'remove_activity'; poi_id: string };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  operations?: PlanOperation[];
  error?: boolean;
}
