export type Owner = 'player' | 'rival' | 'neutral';

export type IslandSize = 'small' | 'medium' | 'large';

export type IslandTerrain = 'temperate' | 'snowy' | 'rocky';

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

export interface Island {
  id: number;
  x: number;
  y: number;
  radius: number;
  size: IslandSize;
  terrain: IslandTerrain;
  owner: Owner;
  isHome: boolean;
  isFurIsland: boolean;
  allianceNeeded: number;
  allianceProgress: number;
  shape: number[];
  trees: Decor[];
  buildingSpots: BuildingSpot[];
  rivalId?: number;
  /** Stockpile that uninhabited (neutral) islands accumulate on their own, capped at 150. */
  stock: number;
}

export interface FishSource {
  id: number;
  x: number;
  y: number;
  radius: number;
  amount: number;
  capacity: number;
  fish: Decor[];
}

export interface Rival {
  id: number;
  homeIslandId: number;
  color: string;
  influenceTimer: number;
  influenceInterval: number;
}

export type ShipState = 'docked' | 'outbound' | 'returning' | 'building';

export type ShipClass = 'skiff' | 'galley' | 'galleon';

export interface ShipTarget {
  kind: 'island' | 'fish';
  id: number;
}

export interface Ship {
  id: number;
  shipClass: ShipClass;
  state: ShipState;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  heading: number;
  target: ShipTarget | null;
  cargoFish: number;
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
