export type Owner = 'player' | 'rival' | 'neutral';

export type IslandSize = 'small' | 'medium' | 'large';

export type IslandTerrain = 'temperate' | 'snowy' | 'rocky';

export type ResourceKey = 'stone' | 'wood' | 'fish' | 'fur' | 'coins';

/** Special resource islands can never be colonised — only harvested. */
export type SpecialKind = 'fur' | 'stone' | 'wood';

export interface Decor {
  dx: number;
  dy: number;
  r: number;
}

export interface BuildingSpot {
  dx: number;
  dy: number;
  scale: number;
}

/**
 * A single producer living on an island — an animal herd or a work crew.
 * Each one makes a specific resource at a steady rate, shown in the island
 * menu so the player can read exactly what an isle is worth.
 */
export interface Producer {
  kind: string;
  icon: string;
  label: string;
  resource: ResourceKey;
  ratePerSec: number;
  dx: number;
  dy: number;
}

export interface Island {
  id: number;
  x: number;
  y: number;
  radius: number;
  size: IslandSize;
  terrain: IslandTerrain;
  owner: Owner;
  isHome: boolean;
  /** A special resource isle (fur/stone/wood) — harvest-only, never colonised. */
  special: SpecialKind | null;
  /** Whether any player can ever take this island. False for home + special isles. */
  colonizable: boolean;
  /** Coins it costs to colonise this isle with a galleon. */
  colonizeCost: number;
  /** The resource this island's producers make and stockpile. */
  resource: ResourceKey;
  producers: Producer[];
  shape: number[];
  trees: Decor[];
  buildingSpots: BuildingSpot[];
  rivalId?: number;
  /** Resources the isle has stockpiled, up to stockCap. Stops at the cap. */
  stock: number;
  stockCap: number;
}

export interface FishSource {
  id: number;
  x: number;
  y: number;
  radius: number;
  amount: number;
  capacity: number;
  ratePerSec: number;
  fish: Decor[];
}

export interface Rival {
  id: number;
  homeIslandId: number;
  color: string;
  /** Seconds until this rival dispatches its next colonising galleon. */
  launchTimer: number;
  launchInterval: number;
  coins: number;
}

export type ShipState = 'docked' | 'outbound' | 'returning' | 'building';

export type ShipClass = 'skiff' | 'galley' | 'galleon';

/** Trade routes harvest resources; colonise missions claim an island. */
export type ShipPurpose = 'trade' | 'colonize';

export interface ShipTarget {
  kind: 'island' | 'fish';
  id: number;
}

export interface Ship {
  id: number;
  owner: Owner;
  rivalId?: number;
  shipClass: ShipClass;
  state: ShipState;
  purpose: ShipPurpose;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  heading: number;
  target: ShipTarget | null;
  cargo: number;
  cargoResource: ResourceKey | null;
  buildTimeLeft: number;
  /** Set when the player recalls a ship — it sails home and docks instead of looping again. */
  recalled: boolean;
}

export interface Buildings {
  fishermen: number;
  workshop: number;
  market: number;
  shipyard: number;
  fortress: number;
}

export interface Resources {
  stone: number;
  wood: number;
  fish: number;
  fur: number;
  coins: number;
}

export interface RunSummary {
  score: number;
  islandsClaimed: number;
  shipsBuilt: number;
  furGathered: number;
  goldEarned: number;
  durationSeconds: number;
}
