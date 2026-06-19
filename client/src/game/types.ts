export type Owner = 'player' | 'rival' | 'neutral';

export type IslandSize = 'small' | 'medium' | 'large';

export interface Island {
  id: number;
  x: number;
  y: number;
  radius: number;
  size: IslandSize;
  owner: Owner;
  isHome: boolean;
  allianceNeeded: number;
  allianceProgress: number;
  shape: number[];
  rivalId?: number;
}

export interface Rival {
  id: number;
  homeIslandId: number;
  color: string;
  influenceTimer: number;
  influenceInterval: number;
}

export type ShipState = 'docked' | 'outbound' | 'returning' | 'building';

export interface Ship {
  id: number;
  state: ShipState;
  x: number;
  y: number;
  targetIslandId: number | null;
  progress: number;
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
}

export interface RunSummary {
  score: number;
  islandsClaimed: number;
  shipsBuilt: number;
  goldEarned: number;
  durationSeconds: number;
}
