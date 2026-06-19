import { generateMap, WORLD_WIDTH, WORLD_HEIGHT } from './mapgen';
import type { Island, Rival, Ship, Buildings, Resources, RunSummary } from './types';

export const ROUND_SECONDS = 180;
const SHIP_SPEED = 120; // px/sec
const SHIP_BUILD_TIME = 4; // sec
const SHIP_BUILD_COST = { wood: 25, iron: 15 };
const SHIP_SEND_FOOD_COST = 20;

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
  homeIslandId: number;
  ships: Ship[] = [];
  buildings: Buildings = { sawmill: 0, mine: 0, farm: 0, shipyard: 0 };
  resources: Resources = { wood: 40, iron: 20, food: 30 };
  timeLeft = ROUND_SECONDS;
  status: RoundStatus = 'playing';
  shipsBuiltCount = 0;
  selectedShipId: number | null = null;
  private rivalProgress = new Map<number, number[]>();
  private nextShipId = 1;
  toast: { text: string; ttl: number } | null = null;

  constructor() {
    const map = generateMap();
    this.islands = map.islands;
    this.rivals = map.rivals;
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

  islandsClaimed(): number {
    return this.islands.filter((i) => i.owner === 'player' && !i.isHome).length;
  }

  buildingProductionPerSec(): Resources {
    return {
      wood: 1 + this.buildings.sawmill * 0.8,
      iron: 0.4 + this.buildings.mine * 0.5,
      food: 0.6 + this.buildings.farm * 0.7,
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

  buildShip(): boolean {
    if (this.status !== 'playing') return false;
    if (this.ships.length >= this.maxShips()) return false;
    if (!this.canAfford(SHIP_BUILD_COST)) return false;
    this.pay(SHIP_BUILD_COST);
    const home = this.homeIsland;
    this.ships.push({
      id: this.nextShipId++,
      state: 'building',
      x: home.x,
      y: home.y,
      targetIslandId: null,
      progress: 0,
      buildTimeLeft: SHIP_BUILD_TIME,
    });
    this.shipsBuiltCount++;
    return true;
  }

  selectShip(shipId: number | null) {
    this.selectedShipId = shipId;
  }

  sendSelectedShipTo(islandId: number): boolean {
    if (this.status !== 'playing' || this.selectedShipId === null) return false;
    const ship = this.ships.find((s) => s.id === this.selectedShipId);
    const island = this.islands.find((i) => i.id === islandId);
    if (!ship || ship.state !== 'docked' || !island || island.owner !== 'neutral') return false;
    if (this.resources.food < SHIP_SEND_FOOD_COST) {
      this.showToast('Not enough food for this voyage');
      return false;
    }
    this.resources.food -= SHIP_SEND_FOOD_COST;
    ship.state = 'outbound';
    ship.targetIslandId = islandId;
    ship.progress = 0;
    this.selectedShipId = null;
    return true;
  }

  private showToast(text: string) {
    this.toast = { text, ttl: 2.2 };
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

      const target = ship.state === 'outbound' ? this.islands.find((i) => i.id === ship.targetIslandId) : home;
      if (!target) {
        ship.state = 'docked';
        continue;
      }
      const origin = ship.state === 'outbound' ? home : target;
      const dist = Math.hypot(target.x - origin.x, target.y - origin.y) || 1;
      ship.progress += (SHIP_SPEED * dt) / dist;

      if (ship.progress >= 1) {
        if (ship.state === 'outbound') {
          this.resolveArrival(ship, target);
          ship.state = 'returning';
          ship.progress = 0;
        } else {
          ship.state = 'docked';
          ship.progress = 0;
          ship.x = home.x;
          ship.y = home.y;
          ship.targetIslandId = null;
        }
      } else {
        const a = ship.state === 'outbound' ? home : target;
        const b = ship.state === 'outbound' ? target : home;
        ship.x = a.x + (b.x - a.x) * ship.progress;
        ship.y = a.y + (b.y - a.y) * ship.progress;
      }
    }
  }

  private resolveArrival(_ship: Ship, island: Island) {
    if (island.owner !== 'neutral') return;
    island.allianceProgress += 1;
    if (island.allianceProgress >= island.allianceNeeded) {
      island.owner = 'player';
      this.showToast(`Alliance formed with ${island.size} isle!`);
    } else {
      this.showToast('Goodwill delivered — alliance growing');
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

  private updateResources(dt: number) {
    const prod = this.buildingProductionPerSec();
    this.resources.wood += prod.wood * dt;
    this.resources.iron += prod.iron * dt;
    this.resources.food += prod.food * dt;
  }

  computeSummary(): RunSummary {
    const islandsClaimed = this.islandsClaimed();
    const leftover = Math.floor(
      (this.resources.wood + this.resources.iron + this.resources.food) / 2
    );
    const score = islandsClaimed * 150 + this.shipsBuiltCount * 25 + leftover;
    return {
      score,
      islandsClaimed,
      shipsBuilt: this.shipsBuiltCount,
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

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.status = 'ended';
    }
  }
}

export { WORLD_WIDTH, WORLD_HEIGHT };
