import { generateMap, WORLD_WIDTH, WORLD_HEIGHT } from './mapgen';
import type {
  Island,
  Rival,
  Ship,
  ShipClass,
  ShipTarget,
  FishSource,
  Buildings,
  Resources,
  RunSummary,
} from './types';

export const ROUND_SECONDS = 180;
const SHIP_SEND_FOOD_COST = 16;
const FUR_RATE = 0.7; // fur/sec from an allied fur island

export interface ShipClassDef {
  key: ShipClass;
  name: string;
  cost: Partial<Resources>;
  speed: number; // px/sec
  alliancePower: number; // alliance points delivered per voyage
  fishCargo: number; // food carried home from a shoal
  buildTime: number; // sec
  scale: number; // render size
  requiresShipyard: number; // min shipyard level to build
}

export const SHIP_CLASSES: Record<ShipClass, ShipClassDef> = {
  skiff: {
    key: 'skiff',
    name: 'Skiff',
    cost: { wood: 15 },
    speed: 158,
    alliancePower: 1,
    fishCargo: 18,
    buildTime: 2,
    scale: 0.8,
    requiresShipyard: 0,
  },
  galley: {
    key: 'galley',
    name: 'Galley',
    cost: { wood: 26, iron: 12 },
    speed: 126,
    alliancePower: 2,
    fishCargo: 32,
    buildTime: 4,
    scale: 1.0,
    requiresShipyard: 1,
  },
  galleon: {
    key: 'galleon',
    name: 'Galleon',
    cost: { wood: 45, iron: 30 },
    speed: 100,
    alliancePower: 3,
    fishCargo: 55,
    buildTime: 6,
    scale: 1.28,
    requiresShipyard: 2,
  },
};

const UPGRADE_COSTS = {
  sawmill: (lvl: number) => ({ wood: 10 + lvl * 8 }),
  mine: (lvl: number) => ({ wood: 8 + lvl * 6, iron: 4 + lvl * 3 }),
  farm: (lvl: number) => ({ wood: 8 + lvl * 6 }),
  shipyard: (lvl: number) => ({ wood: 20 + lvl * 15, iron: 10 + lvl * 8 }),
} as const;

const MAX_LEVEL: Record<keyof Buildings, number> = {
  sawmill: 5,
  mine: 5,
  farm: 5,
  shipyard: 4,
};

export type RoundStatus = 'playing' | 'ended';

export class GameState {
  islands: Island[];
  rivals: Rival[];
  fishSources: FishSource[];
  homeIslandId: number;
  ships: Ship[] = [];
  buildings: Buildings = { sawmill: 0, mine: 0, farm: 0, shipyard: 0 };
  resources: Resources = { wood: 45, iron: 20, food: 35, fur: 0 };
  timeLeft = ROUND_SECONDS;
  status: RoundStatus = 'playing';
  shipsBuiltCount = 0;
  furGathered = 0;
  selectedShipId: number | null = null;
  private rivalProgress = new Map<number, number[]>();
  private nextShipId = 1;
  toast: { text: string; ttl: number } | null = null;

  constructor() {
    const map = generateMap();
    this.islands = map.islands;
    this.rivals = map.rivals;
    this.fishSources = map.fishSources;
    this.homeIslandId = map.homeIslandId;
  }

  get homeIsland(): Island {
    const home = this.islands.find((i) => i.id === this.homeIslandId);
    if (!home) throw new Error('home island missing');
    return home;
  }

  maxShips(): number {
    return 1 + this.buildings.shipyard;
  }

  alliedIslands(): Island[] {
    return this.islands.filter((i) => i.owner === 'player' && !i.isHome);
  }

  islandsClaimed(): number {
    return this.alliedIslands().length;
  }

  hasAlliedFurIsland(): boolean {
    return this.islands.some((i) => i.isFurIsland && i.owner === 'player');
  }

  buildingProductionPerSec(): Resources {
    // Allied villages contribute a small steady trickle on top of the home town.
    const allied = this.alliedIslands().length;
    return {
      wood: 1 + this.buildings.sawmill * 0.9 + allied * 0.4,
      iron: 0.35 + this.buildings.mine * 0.5,
      food: 0.6 + this.buildings.farm * 0.7 + allied * 0.35,
      fur: this.hasAlliedFurIsland() ? FUR_RATE : 0,
    };
  }

  upgradeCost(key: keyof Buildings): Partial<Resources> | null {
    if (this.buildings[key] >= MAX_LEVEL[key]) return null;
    return UPGRADE_COSTS[key](this.buildings[key]);
  }

  canAfford(cost: Partial<Resources>): boolean {
    return Object.entries(cost).every(
      ([k, v]) => this.resources[k as keyof Resources] >= (v as number)
    );
  }

  private pay(cost: Partial<Resources>) {
    for (const [k, v] of Object.entries(cost)) {
      this.resources[k as keyof Resources] -= v as number;
    }
  }

  upgradeBuilding(key: keyof Buildings): boolean {
    if (this.status !== 'playing') return false;
    const cost = this.upgradeCost(key);
    if (!cost || !this.canAfford(cost)) return false;
    this.pay(cost);
    this.buildings[key] += 1;
    return true;
  }

  canBuildShip(shipClass: ShipClass): boolean {
    const def = SHIP_CLASSES[shipClass];
    return (
      this.status === 'playing' &&
      this.ships.length < this.maxShips() &&
      this.buildings.shipyard >= def.requiresShipyard &&
      this.canAfford(def.cost)
    );
  }

  buildShip(shipClass: ShipClass): boolean {
    if (!this.canBuildShip(shipClass)) return false;
    const def = SHIP_CLASSES[shipClass];
    this.pay(def.cost);
    const home = this.homeIsland;
    this.ships.push({
      id: this.nextShipId++,
      shipClass,
      state: 'building',
      x: home.x,
      y: home.y,
      fromX: home.x,
      fromY: home.y,
      toX: home.x,
      toY: home.y,
      progress: 0,
      heading: 0,
      target: null,
      cargoFood: 0,
      buildTimeLeft: def.buildTime,
    });
    this.shipsBuiltCount++;
    return true;
  }

  selectShip(shipId: number | null) {
    this.selectedShipId = shipId;
  }

  sendSelectedShip(target: ShipTarget): boolean {
    if (this.status !== 'playing' || this.selectedShipId === null) return false;
    const ship = this.ships.find((s) => s.id === this.selectedShipId);
    if (!ship || ship.state !== 'docked') return false;

    let destX: number;
    let destY: number;
    if (target.kind === 'island') {
      const island = this.islands.find((i) => i.id === target.id);
      if (!island || island.owner !== 'neutral') return false;
      if (this.resources.food < SHIP_SEND_FOOD_COST) {
        this.showToast('Not enough food for this voyage');
        return false;
      }
      this.resources.food -= SHIP_SEND_FOOD_COST;
      destX = island.x;
      destY = island.y;
    } else {
      const source = this.fishSources.find((f) => f.id === target.id);
      if (!source) return false;
      destX = source.x;
      destY = source.y;
    }

    const home = this.homeIsland;
    ship.fromX = home.x;
    ship.fromY = home.y;
    ship.toX = destX;
    ship.toY = destY;
    ship.heading = Math.atan2(destY - home.y, destX - home.x);
    ship.progress = 0;
    ship.cargoFood = 0;
    ship.target = target;
    ship.state = 'outbound';
    this.selectedShipId = null;
    return true;
  }

  private showToast(text: string) {
    this.toast = { text, ttl: 2.2 };
  }

  private startReturnLeg(ship: Ship) {
    const home = this.homeIsland;
    ship.fromX = ship.toX;
    ship.fromY = ship.toY;
    ship.toX = home.x;
    ship.toY = home.y;
    ship.heading = Math.atan2(home.y - ship.fromY, home.x - ship.fromX);
    ship.progress = 0;
    ship.state = 'returning';
  }

  private updateShips(dt: number) {
    const home = this.homeIsland;
    for (const ship of this.ships) {
      if (ship.state === 'building') {
        ship.buildTimeLeft -= dt;
        if (ship.buildTimeLeft <= 0) {
          ship.state = 'docked';
          ship.x = home.x;
          ship.y = home.y;
        }
        continue;
      }
      if (ship.state === 'docked') continue;

      const def = SHIP_CLASSES[ship.shipClass];
      const dist = Math.hypot(ship.toX - ship.fromX, ship.toY - ship.fromY) || 1;
      ship.progress += (def.speed * dt) / dist;
      ship.x = ship.fromX + (ship.toX - ship.fromX) * Math.min(ship.progress, 1);
      ship.y = ship.fromY + (ship.toY - ship.fromY) * Math.min(ship.progress, 1);

      if (ship.progress < 1) continue;

      if (ship.state === 'outbound') {
        this.resolveArrival(ship);
        this.startReturnLeg(ship);
      } else {
        if (ship.cargoFood > 0) {
          this.resources.food += ship.cargoFood;
          ship.cargoFood = 0;
        }
        ship.state = 'docked';
        ship.progress = 0;
        ship.target = null;
        ship.x = home.x;
        ship.y = home.y;
      }
    }
  }

  private resolveArrival(ship: Ship) {
    const target = ship.target;
    if (!target) return;
    const def = SHIP_CLASSES[ship.shipClass];

    if (target.kind === 'island') {
      const island = this.islands.find((i) => i.id === target.id);
      if (!island || island.owner !== 'neutral') return;
      island.allianceProgress += def.alliancePower;
      if (island.allianceProgress >= island.allianceNeeded) {
        island.owner = 'player';
        this.showToast(
          island.isFurIsland ? 'Fur island allied — the pelt trade is yours!' : `Alliance formed with a ${island.size} isle!`
        );
      } else {
        this.showToast('Goodwill delivered — alliance growing');
      }
    } else {
      const source = this.fishSources.find((f) => f.id === target.id);
      if (!source) return;
      const haul = Math.min(def.fishCargo, source.amount);
      source.amount -= haul;
      ship.cargoFood = haul;
      this.showToast(`Netted ${Math.round(haul)} fish`);
    }
  }

  private updateRivals(dt: number) {
    for (const rival of this.rivals) {
      rival.influenceTimer -= dt;
      if (rival.influenceTimer > 0) continue;
      rival.influenceTimer = rival.influenceInterval;

      const home = this.islands.find((i) => i.id === rival.homeIslandId);
      if (!home) continue;
      const candidates = this.islands.filter((i) => i.owner === 'neutral');
      if (candidates.length === 0) continue;
      candidates.sort(
        (a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y)
      );
      const target = candidates[0];
      const progressArr = this.rivalProgress.get(target.id) ?? [0, 0];
      progressArr[rival.id] = (progressArr[rival.id] ?? 0) + 1;
      this.rivalProgress.set(target.id, progressArr);
      if (progressArr[rival.id] >= target.allianceNeeded) {
        target.owner = 'rival';
        target.rivalId = rival.id;
      }
    }
  }

  private updateFishSources(dt: number) {
    for (const source of this.fishSources) {
      if (source.amount < source.capacity) {
        source.amount = Math.min(source.capacity, source.amount + 2.5 * dt);
      }
    }
  }

  private updateResources(dt: number) {
    const prod = this.buildingProductionPerSec();
    this.resources.wood += prod.wood * dt;
    this.resources.iron += prod.iron * dt;
    this.resources.food += prod.food * dt;
    if (prod.fur > 0) {
      const gain = prod.fur * dt;
      this.resources.fur += gain;
      this.furGathered += gain;
    }
  }

  computeSummary(): RunSummary {
    const islandsClaimed = this.islandsClaimed();
    const leftover = Math.floor(
      (this.resources.wood + this.resources.iron + this.resources.food) / 2
    );
    const furGathered = Math.round(this.furGathered);
    const score = islandsClaimed * 150 + furGathered * 4 + this.shipsBuiltCount * 20 + leftover;
    return {
      score,
      islandsClaimed,
      shipsBuilt: this.shipsBuiltCount,
      furGathered,
      goldEarned: Math.floor(score / 8),
      durationSeconds: Math.round(ROUND_SECONDS - this.timeLeft),
    };
  }

  tick(dt: number) {
    if (this.status !== 'playing') return;
    if (this.toast) {
      this.toast.ttl -= dt;
      if (this.toast.ttl <= 0) this.toast = null;
    }
    this.updateResources(dt);
    this.updateShips(dt);
    this.updateRivals(dt);
    this.updateFishSources(dt);

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.status = 'ended';
    }
  }
}

export { WORLD_WIDTH, WORLD_HEIGHT };
