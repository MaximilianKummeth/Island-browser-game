import type { Buildings, ResourceKey } from './types';

export type Difficulty = 'easy' | 'medium' | 'hard';

// The ONLY thing difficulty changes is how long you get. Hard is the base
// time; medium and easy simply give you more of it.
export const DIFFICULTY_TIME_MULT: Record<Difficulty, number> = {
  hard: 1.0,
  medium: 1.5,
  easy: 2.0,
};

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export type ObjectiveKind = 'have' | 'total' | 'colonies' | 'ships' | 'building';

export interface Objective {
  kind: ObjectiveKind;
  amount: number;
  /** For 'have' (hold at once) and 'total' (gather cumulatively) objectives. */
  resource?: ResourceKey;
  /** For 'building' objectives — the level to reach. */
  building?: keyof Buildings;
}

export interface Mission {
  id: number;
  title: string;
  description: string;
  objective: Objective;
  /** Seconds allowed on HARD; easier difficulties scale this up. */
  baseSeconds: number;
}

export function missionDuration(m: Mission, d: Difficulty): number {
  return Math.round(m.baseSeconds * DIFFICULTY_TIME_MULT[d]);
}

const RES_NAME: Record<ResourceKey, string> = {
  wood: 'Wood',
  stone: 'Stone',
  fish: 'Fish',
  fur: 'Fur',
  coins: 'Coins',
};

const BLD_NAME: Record<keyof Buildings, string> = {
  fishermen: 'Fishermen',
  workshop: 'Workshop',
  market: 'Market',
  shipyard: 'Shipyard',
  fortress: 'Fortress',
};

export function objectiveText(o: Objective): string {
  switch (o.kind) {
    case 'have':
      return `Hold ${o.amount} ${RES_NAME[o.resource!]} at once`;
    case 'total':
      return `Gather ${o.amount} ${RES_NAME[o.resource!]} in total`;
    case 'colonies':
      return `Colonise ${o.amount} island${o.amount === 1 ? '' : 's'}`;
    case 'ships':
      return `Build ${o.amount} ship${o.amount === 1 ? '' : 's'}`;
    case 'building':
      return `Raise the ${BLD_NAME[o.building!]} to level ${o.amount}`;
  }
}

// 28 missions across every kind of objective. baseSeconds (the HARD time) was
// tuned with the simulation playtest in scripts/playtest.ts so each one is
// winnable on hard with a margin, and progressively easier on medium/easy.
export const MISSIONS: Mission[] = [
  // --- Hold a resource at once -------------------------------------------
  { id: 1, title: 'First Timber', description: 'A fresh colony needs lumber. Stack up a healthy woodpile.', objective: { kind: 'have', resource: 'wood', amount: 150 }, baseSeconds: 45 },
  { id: 2, title: 'Stone Stockpile', description: 'The masons are waiting. Keep a good store of stone on hand.', objective: { kind: 'have', resource: 'stone', amount: 120 }, baseSeconds: 40 },
  { id: 3, title: 'Full Larder', description: 'Winter is long — fill the larder with fish.', objective: { kind: 'have', resource: 'fish', amount: 160 }, baseSeconds: 40 },
  { id: 4, title: 'First Coins', description: 'Set up a market and mint your first coins.', objective: { kind: 'have', resource: 'coins', amount: 80 }, baseSeconds: 35 },
  { id: 5, title: 'War Chest', description: 'Build a treasury fit for an expanding realm.', objective: { kind: 'have', resource: 'coins', amount: 220 }, baseSeconds: 70 },

  // --- Gather cumulatively ----------------------------------------------
  { id: 6, title: 'Lumber Baron', description: 'Run the sawmills and harvest routes hard.', objective: { kind: 'total', resource: 'wood', amount: 450 }, baseSeconds: 90 },
  { id: 7, title: 'Quarry Master', description: 'Draw stone from the quarries and the special stone isle.', objective: { kind: 'total', resource: 'stone', amount: 350 }, baseSeconds: 95 },
  { id: 8, title: 'Great Catch', description: 'Net a season’s worth of fish from the shoals.', objective: { kind: 'total', resource: 'fish', amount: 550 }, baseSeconds: 95 },
  { id: 9, title: 'Rich Merchant', description: 'Keep the market busy and rake in the coins.', objective: { kind: 'total', resource: 'coins', amount: 350 }, baseSeconds: 100 },
  { id: 10, title: 'Fur Trader', description: 'Send ships to the fur isle and bring back pelts.', objective: { kind: 'total', resource: 'fur', amount: 70 }, baseSeconds: 45 },
  { id: 11, title: 'Fur Empire', description: 'Build the pelt trade into a fortune.', objective: { kind: 'total', resource: 'fur', amount: 160 }, baseSeconds: 75 },

  // --- Colonise islands --------------------------------------------------
  { id: 12, title: 'First Colony', description: 'Build a galleon and plant your first colony.', objective: { kind: 'colonies', amount: 1 }, baseSeconds: 100 },
  { id: 13, title: 'Twin Colonies', description: 'Claim a second island before the rivals do.', objective: { kind: 'colonies', amount: 2 }, baseSeconds: 120 },
  { id: 14, title: 'Island Chain', description: 'Stretch your banner across three isles.', objective: { kind: 'colonies', amount: 3 }, baseSeconds: 140 },
  { id: 15, title: 'Archipelago Lord', description: 'Four colonies make a proper little empire.', objective: { kind: 'colonies', amount: 4 }, baseSeconds: 160 },
  { id: 16, title: 'Empire of Isles', description: 'Out-colonise both rivals and take five islands.', objective: { kind: 'colonies', amount: 5 }, baseSeconds: 185 },

  // --- Build ships -------------------------------------------------------
  { id: 17, title: 'Set Sail', description: 'Get a couple of hulls into the water.', objective: { kind: 'ships', amount: 2 }, baseSeconds: 30 },
  { id: 18, title: 'Small Fleet', description: 'A fleet of four to work the seas.', objective: { kind: 'ships', amount: 4 }, baseSeconds: 55 },
  { id: 19, title: 'Grand Armada', description: 'Lay down six ships before time runs out.', objective: { kind: 'ships', amount: 6 }, baseSeconds: 80 },

  // --- Raise buildings ---------------------------------------------------
  { id: 20, title: 'Shipwright', description: 'Expand the shipyard to launch bigger hulls.', objective: { kind: 'building', building: 'shipyard', amount: 2 }, baseSeconds: 40 },
  { id: 21, title: 'Coastal Power', description: 'A third-tier shipyard for a serious fleet.', objective: { kind: 'building', building: 'shipyard', amount: 3 }, baseSeconds: 60 },
  { id: 22, title: 'Master Shipwright', description: 'Push the shipyard to its highest tier.', objective: { kind: 'building', building: 'shipyard', amount: 4 }, baseSeconds: 90 },
  { id: 23, title: 'Marketplace', description: 'Grow the market into a bustling trade hub.', objective: { kind: 'building', building: 'market', amount: 3 }, baseSeconds: 35 },
  { id: 24, title: 'Booming Trade', description: 'Max out the market for a river of coins.', objective: { kind: 'building', building: 'market', amount: 5 }, baseSeconds: 70 },
  { id: 25, title: 'Workshop Foreman', description: 'Upgrade the workshop to boost all production.', objective: { kind: 'building', building: 'workshop', amount: 3 }, baseSeconds: 40 },
  { id: 26, title: 'Master Fisherman', description: 'Grow the fishermen’s huts for a bigger haul.', objective: { kind: 'building', building: 'fishermen', amount: 3 }, baseSeconds: 40 },
  { id: 27, title: 'Raise the Walls', description: 'Found the fortress and ring the town with walls.', objective: { kind: 'building', building: 'fortress', amount: 1 }, baseSeconds: 30 },
  { id: 28, title: 'Mighty Fortress', description: 'Build the fortress to its full, towering height.', objective: { kind: 'building', building: 'fortress', amount: 3 }, baseSeconds: 70 },
];
