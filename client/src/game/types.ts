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
  cargoFood: number;
  buildTimeLeft: number;
}

export interface Buildings {
  sawmill: number;
  mine: number;
  farm: number;
  shipyard: number;
}

export interface Resources {
  wood: number;
  iron: number;
  food: number;
  fur: number;
}

export interface RunSummary {
  score: number;
  islandsClaimed: number;
  shipsBuilt: number;
  furGathered: number;
  goldEarned: number;
  durationSeconds: number;
}
