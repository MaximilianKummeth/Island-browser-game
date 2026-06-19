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
const SHIP_SEND_FISH_COST = 16;
const FUR_RATE = 0.7; // fur/sec from an allied fur island
const NEUTRAL_STOCK_CAP = 150;
const NEUTRAL_STOCK_RATE = 20; // resources/sec a wild, uninhabited island generates

export interface ShipClassDef {
  key: ShipClass;
  name: string;
  cost: Partial<Resources>;
  speed: number; // px/sec
  alliancePower: number; // alliance points delivered per voyage
  fishCargo: number; // fish carried home from a shoal
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
    cost: { wood: 26, stone: 12 },
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
    cost: { wood: 45, stone: 30 },
    speed: 100,
    alliancePower: 3,
    fishCargo: 55,
    buildTime: 6,
    scale: 1.28,
    requiresShipyard: 2,
  },
};

const UPGRADE_COSTS = {
  fishermen: (lvl: number) => ({ wood: 10 + lvl * 8 }),
  workshop: (lvl: number) => ({ wood: 12 + lvl * 9, stone: 6 + lvl * 5 }),
  market: (lvl: number) => ({ wood: 8 + lvl * 6, stone: 8 + lvl * 6 }),
  shipyard: (lvl: number) => ({ wood: 20 + lvl * 15, stone: 10 + lvl * 8 }),
  fortress: (lvl: number) => ({ stone: 18 + lvl * 14, wood: 10 + lvl * 8 }),
} as const;

const MAX_LEVEL: Record<keyof Buildings, number> = {
  fishermen: 5,
  workshop: 5,
  market: 5,
  shipyard: 4,
  fortress: 3,
};

export type RoundStatus = 'playing' | 'ended';

// A point just off an island's shore, offset toward `towardX/Y`, so ships
// dock and sail in open water and never sit on top of the land itself.
function shorePoint(
  originX: number,
  originY: number,
  originRadius: number,
  towardX: number,
  towardY: number
): { x: number; y: number } {
  const dx = towardX - originX;
  const dy = towardY - originY;
  const len = Math.hypot(dx, dy) || 1;
  const off = originRadius * 1.2 + 14;
  return { x: originX + (dx / len) * off, y: originY + (dy / len) * off };
}

export class GameState {
  islands: Island[];
  rivals: Rival[];
  fishSources: FishSource[];
  homeIslandId: number;
  ships: Ship[] = [];
  buildings: Buildings = { fishermen: 0, workshop: 0, market: 0, shipyard: 0, fortress: 0 };
  resources: Resources = { stone: 30, wood: 45, fish: 35, fur: 0, coins: 5 };
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
    return 1 + this.buildings.shipyard + this.buildings.fortress;
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
    const workshopMult = 1 + this.buildings.workshop * 0.22;
    return {
      wood: (1 + allied * 0.4) * workshopMult,
      stone: (0.6 + allied * 0.25) * workshopMult,
      fish: (0.5 + this.buildings.fishermen * 0.9 + allied * 0.3) * workshopMult,
      fur: this.hasAlliedFurIsland() ? FUR_RATE : 0,
      coins: this.buildings.market * 0.5,
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
    const harbor = shorePoint(home.x, home.y, home.radius, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.ships.push({
      id: this.nextShipId++,
      shipClass,
      state: 'building',
      x: harbor.x,
      y: harbor.y,
      fromX: harbor.x,
      fromY: harbor.y,
      toX: harbor.x,
      toY: harbor.y,
      progress: 0,
      heading: 0,
      target: null,
      cargoFish: 0,
      buildTimeLeft: def.buildTime,
      recalled: false,
    });
    this.shipsBuiltCount++;
    return true;
  }

  selectShip(shipId: number | null) {
    this.selectedShipId = shipId;
  }

  /** Cancels a ship's standing trade route — it finishes its current leg, then docks. */
  recallShip(shipId: number): boolean {
    const ship = this.ships.find((s) => s.id === shipId);
    if (!ship || ship.state === 'docked' || ship.state === 'building') return false;
    ship.recalled = true;
    return true;
  }

  private targetAnchor(target: ShipTarget | null): { x: number; y: number; radius: number } | null {
    if (!target) return null;
    if (target.kind === 'island') {
      const island = this.islands.find((i) => i.id === target.id);
      return island ? { x: island.x, y: island.y, radius: island.radius } : null;
    }
    const source = this.fishSources.find((f) => f.id === target.id);
    return source ? { x: source.x, y: source.y, radius: 0 } : null;
  }

  private beginOutboundLeg(ship: Ship, target: ShipTarget) {
    const home = this.homeIsland;
    const anchor = this.targetAnchor(target);
    if (!anchor) return;
    const fromPoint = shorePoint(home.x, home.y, home.radius, anchor.x, anchor.y);
    const toPoint =
      anchor.radius > 0
        ? shorePoint(anchor.x, anchor.y, anchor.radius, home.x, home.y)
        : { x: anchor.x, y: anchor.y };
    ship.fromX = fromPoint.x;
    ship.fromY = fromPoint.y;
    ship.toX = toPoint.x;
    ship.toY = toPoint.y;
    ship.heading = Math.atan2(toPoint.y - fromPoint.y, toPoint.x - fromPoint.x);
    ship.progress = 0;
    ship.cargoFish = 0;
    ship.target = target;
    ship.state = 'outbound';
  }

  private beginReturnLeg(ship: Ship) {
    const home = this.homeIsland;
    const anchor = this.targetAnchor(ship.target) ?? { x: ship.toX, y: ship.toY, radius: 0 };
    const fromPoint =
      anchor.radius > 0
        ? shorePoint(anchor.x, anchor.y, anchor.radius, home.x, home.y)
        : { x: ship.toX, y: ship.toY };
    const toPoint = shorePoint(home.x, home.y, home.radius, anchor.x, anchor.y);
    ship.fromX = fromPoint.x;
    ship.fromY = fromPoint.y;
    ship.toX = toPoint.x;
    ship.toY = toPoint.y;
    ship.heading = Math.atan2(toPoint.y - fromPoint.y, toPoint.x - fromPoint.x);
    ship.progress = 0;
    ship.state = 'returning';
  }

  sendSelectedShip(target: ShipTarget): boolean {
    if (this.status !== 'playing' || this.selectedShipId === null) return false;
    const ship = this.ships.find((s) => s.id === this.selectedShipId);
    if (!ship || ship.state !== 'docked') return false;

    if (target.kind === 'island') {
      const island = this.islands.find((i) => i.id === target.id);
      if (!island || island.isHome || island.owner === 'rival') return false;
    } else if (!this.fishSources.some((f) => f.id === target.id)) {
      return false;
    }

    if (this.resources.fish < SHIP_SEND_FISH_COST) {
      this.showToast('Not enough fish stores for this voyage');
      return false;
    }
    this.resources.fish -= SHIP_SEND_FISH_COST;
    ship.recalled = false;
    this.beginOutboundLeg(ship, target);
    this.selectedShipId = null;
    return true;
  }

  private showToast(text: string) {
    this.toast = { text, ttl: 2.2 };
  }

  private isRouteValid(target: ShipTarget | null): boolean {
    if (!target) return false;
    if (target.kind === 'island') {
      const island = this.islands.find((i) => i.id === target.id);
      return !!island && island.owner !== 'rival';
    }
    return this.fishSources.some((f) => f.id === target.id);
  }

  private updateShips(dt: number) {
    const home = this.homeIsland;
    for (const ship of this.ships) {
      if (ship.state === 'building') {
        ship.buildTimeLeft -= dt;
        if (ship.buildTimeLeft <= 0) {
          ship.state = 'docked';
          const harbor = shorePoint(home.x, home.y, home.radius, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
          ship.x = harbor.x;
          ship.y = harbor.y;
        }
        continue;
      }
      if (ship.state === 'docked') continue;

      const def = SHIP_CLASSES[ship.shipClass];
      const dist = Math.hypot(ship.toX - ship.fromX, ship.toY - ship.fromY) || 1;
      ship.progress += (def.speed * dt) / dist;
      const p = Math.min(ship.progress, 1);
      ship.x = ship.fromX + (ship.toX - ship.fromX) * p;
      ship.y = ship.fromY + (ship.toY - ship.fromY) * p;

      if (ship.progress < 1) continue;

      if (ship.state === 'outbound') {
        this.resolveArrival(ship);
        this.beginReturnLeg(ship);
      } else {
        if (ship.cargoFish > 0) {
          this.resources.fish += ship.cargoFish;
          ship.cargoFish = 0;
        }
        const keepGoing = !ship.recalled && this.isRouteValid(ship.target);
        if (keepGoing && ship.target) {
          this.beginOutboundLeg(ship, ship.target);
        } else {
          ship.state = 'docked';
          ship.progress = 0;
          ship.target = null;
          ship.recalled = false;
          const harbor = shorePoint(home.x, home.y, home.radius, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
          ship.x = harbor.x;
          ship.y = harbor.y;
        }
      }
    }
  }

  private resolveArrival(ship: Ship) {
    const target = ship.target;
    if (!target) return;
    const def = SHIP_CLASSES[ship.shipClass];

    if (target.kind === 'island') {
      const island = this.islands.find((i) => i.id === target.id);
      if (!island) return;
      if (island.owner === 'rival') {
        this.showToast('A rival claimed that isle — route abandoned');
        ship.recalled = true;
        return;
      }
      if (island.owner === 'neutral') {
        island.allianceProgress += def.alliancePower;
        if (island.allianceProgress >= island.allianceNeeded) {
          island.owner = 'player';
          this.showToast(
            island.isFurIsland
              ? 'Fur island allied — the pelt trade is yours!'
              : `Alliance formed with a ${island.size} isle!`
          );
        } else {
          this.showToast('Goodwill delivered — alliance growing');
        }
      } else {
        // Already allied — the route keeps running, ferrying home whatever
        // stockpile the isle built up while it was still wild.
        const haul = Math.min(island.stock, def.alliancePower * 14);
        if (haul > 0) {
          island.stock -= haul;
          this.resources.wood += haul * 0.5;
          this.resources.stone += haul * 0.5;
          this.showToast(`Trade route delivered ${Math.round(haul)} goods`);
        }
      }
    } else {
      const source = this.fishSources.find((f) => f.id === target.id);
      if (!source) return;
      const haul = Math.min(def.fishCargo, source.amount);
      source.amount -= haul;
      ship.cargoFish = haul;
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

  // Uninhabited (neutral-owned) islands quietly stockpile goods on their
  // own, capped at 150 — capture them (or run a standing trade route there)
  // to bring that stockpile home.
  private updateIslandStock(dt: number) {
    for (const island of this.islands) {
      if (island.owner === 'neutral') {
        island.stock = Math.min(NEUTRAL_STOCK_CAP, island.stock + NEUTRAL_STOCK_RATE * dt);
      }
    }
  }

  private updateResources(dt: number) {
    const prod = this.buildingProductionPerSec();
    this.resources.wood += prod.wood * dt;
    this.resources.stone += prod.stone * dt;
    this.resources.fish += prod.fish * dt;
    this.resources.coins += prod.coins * dt;
    if (prod.fur > 0) {
      const gain = prod.fur * dt;
      this.resources.fur += gain;
      this.furGathered += gain;
    }
  }

  computeSummary(): RunSummary {
    const islandsClaimed = this.islandsClaimed();
    const leftover =
      Math.floor((this.resources.wood + this.resources.stone + this.resources.fish) / 2) +
      Math.floor(this.resources.coins);
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
    this.updateIslandStock(dt);

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.status = 'ended';
    }
  }
}

export { WORLD_WIDTH, WORLD_HEIGHT };
