import {
  SEED_FRANCHISES,
  SEED_TERRITORIES,
  SEED_CITIES,
  SEED_VENUES,
  SEED_PLAYING_AREAS,
  SEED_CATEGORIES,
  SEED_TEMPLATES,
  SEED_TEMPLATE_VERSIONS,
  SEED_SESSIONS,
  SEED_BOOKINGS,
  SEED_PAYMENTS,
  SEED_REFUNDS,
  SEED_CREW,
  SEED_SHIFTS,
  SEED_TOURNAMENTS,
  SEED_TRANSACTIONS,
  SEED_INCIDENTS,
  SEED_SIGNALS,
  SEED_AUDITS,
  SEED_ANALYTICS,
  SEED_PROMOS
} from "../seed";
import type { PrototypeState } from "./state";

/** Fresh deterministic seed. Every call returns an independent copy. */
export const getInitialState = (): PrototypeState => ({
  franchises: [...SEED_FRANCHISES],
  territories: [...SEED_TERRITORIES],
  cities: [...SEED_CITIES],
  venues: [...SEED_VENUES],
  playingAreas: [...SEED_PLAYING_AREAS],
  categories: [...SEED_CATEGORIES],
  templates: [...SEED_TEMPLATES],
  templateVersions: [...SEED_TEMPLATE_VERSIONS],
  sessions: [...SEED_SESSIONS],
  bookings: [...SEED_BOOKINGS],
  payments: [...SEED_PAYMENTS],
  refunds: [...SEED_REFUNDS],
  crew: [...SEED_CREW],
  shifts: [...SEED_SHIFTS],
  tournaments: [...SEED_TOURNAMENTS],
  transactions: [...SEED_TRANSACTIONS],
  incidents: [...SEED_INCIDENTS],
  signals: [...SEED_SIGNALS],
  audits: [...SEED_AUDITS],
  analytics: [...SEED_ANALYTICS],
  promoCodes: [...SEED_PROMOS]
});
