import { generateMap, WORLD_WIDTH, WORLD_HEIGHT } from './mapgen';
import type {
  Island,
  Rival,
  Ship,
  ShipClass,
  ShipPurpose,
  ShipTarget,
  FishSource,
  Buildings,
  Resources,
  ResourceKey,
  RunSummary,
} from './types';
import type { Mission, Difficulty } from './missions';
import { missionDuration } from './missions';

export const ROUND_SECONDS = 180;
const TRADE_LAUNCH_FISH_COST = 8;

export interface ShipClassDef {
  key: ShipClass;
  name: string;
  cost: Partial<Resources>;
  speed: number; // px/sec
  cargo: number; // resources carried home per harvest run
  canColonize: boolean;
  buildTime: number; // sec
  scale: number; // render size
  requiresShipyard: number; // min shipyard level to build
}

export const SHIP_CLASSES: Record<ShipClass, ShipClassDef> = {
  skiff: {
    key: 'skiff',
    name: 'Skiff',
    cost: { wood: 15 },
    speed: 162,
    cargo: 22,
    canColonize: false,
    buildTime: 2,
    scale: 1.0,
    requiresShipyard: 0,
  },
  galley: {
    key: 'galley',
    name: 'Galley',
    cost: { wood: 26, stone: 12 },
    speed: 130,
    cargo: 40,
    canColonize: false,
    buildTime: 4,
    scale: 1.2,
    requiresShipyard: 1,
  },
  galleon: {
    key: 'galleon',
    name: 'Galleon',
    cost: { wood: 45, stone: 30 },
    speed: 104,
    cargo: 64,
    canColonize: true, // only the galleon can claim islands
    buildTime: 6,
    scale: 1.5,
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
export type Outcome = 'win' | 'loss' | null;

export interface GameOptions {
  mission?: Mission;
  difficulty?: Difficulty;
}

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

export interface ActionResult {
  ok: boolean;
  message: string;
}

export class GameState {
  islands: Island[];
  rivals: Rival[];
  fishSources: FishSource[];
  homeIslandId: number;
  ships: Ship[] = [];
  buildings: Buildings = { fishermen: 0, workshop: 0, market: 0, shipyard: 0, fortress: 0 };
  resources: Resources = { stone: 55, wood: 75, fish: 50, fur: 0, coins: 35 };
  timeLeft = ROUND_SECONDS;
  status: RoundStatus = 'playing';
  outcome: Outcome = null;
  mission: Mission | null = null;
  difficulty: Difficulty | null = null;
  shipsBuiltCount = 0;
  furGathered = 0;
  /** Cumulative resources gathered (production + hauls), never reduced by spending. */
  totalGathered: Resources = { stone: 0, wood: 0, fish: 0, fur: 0, coins: 0 };
  selectedShipId: number | null = null;
  private nextShipId = 1;
  toast: { text: string; ttl: number } | null = null;

  constructor(opts: GameOptions = {}) {
    const map = generateMap();
    this.islands = map.islands;
    this.rivals = map.rivals;
    this.fishSources = map.fishSources;
    this.homeIslandId = map.homeIslandId;
    if (opts.mission) {
      this.mission = opts.mission;
      this.difficulty = opts.difficulty ?? 'medium';
      this.timeLeft = missionDuration(opts.mission, this.difficulty);
    }
  }

  // ---- Mission objective tracking -----------------------------------------

  objectiveCurrent(): number {
    const o = this.mission?.objective;
    if (!o) return 0;
    switch (o.kind) {
      case 'have':
        return Math.floor(this.resources[o.resource!]);
      case 'total':
        return Math.floor(this.totalGathered[o.resource!]);
      case 'colonies':
        return this.islandsClaimed();
      case 'ships':
        return this.shipsBuiltCount;
      case 'building':
        return this.buildings[o.building!];
    }
  }

  objectiveTarget(): number {
    return this.mission?.objective.amount ?? 0;
  }

  objectiveMet(): boolean {
    return this.mission ? this.objectiveCurrent() >= this.objectiveTarget() : false;
  }

  get homeIsland(): Island {
    const home = this.islands.find((i) => i.id === this.homeIslandId);
    if (!home) throw new Error('home island missing');
    return home;
  }

  maxShips(): number {
    return 2 + this.buildings.shipyard + this.buildings.fortress;
  }

  playerShips(): Ship[] {
    return this.ships.filter((s) => s.owner === 'player');
  }

  alliedIslands(): Island[] {
    return this.islands.filter((i) => i.owner === 'player' && !i.isHome);
  }

  islandsClaimed(): number {
    return this.alliedIslands().length;
  }

  getIsland(id: number): Island | undefined {
    return this.islands.find((i) => i.id === id);
  }

  getFish(id: number): FishSource | undefined {
    return this.fishSources.find((f) => f.id === id);
  }

  // The home town plus every island you own producing a steady stream into
  // your stores. Owned islands pay out their producers directly; you don't
  // need to keep ships running to them.
  buildingProductionPerSec(): Resources {
    const workshopMult = 1 + this.buildings.workshop * 0.22;
    const prod: Resources = {
      wood: 1.2 * workshopMult,
      stone: 0.8 * workshopMult,
      fish: (0.5 + this.buildings.fishermen * 0.9) * workshopMult,
      fur: 0,
      coins: this.buildings.market * 1.8,
    };
    for (const island of this.alliedIslands()) {
      for (const p of island.producers) {
        prod[p.resource] += p.ratePerSec * workshopMult;
      }
    }
    return prod;
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
      this.playerShips().length < this.maxShips() &&
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
      owner: 'player',
      shipClass,
      state: 'building',
      purpose: 'trade',
      x: harbor.x,
      y: harbor.y,
      fromX: harbor.x,
      fromY: harbor.y,
      toX: harbor.x,
      toY: harbor.y,
      progress: 0,
      heading: 0,
      target: null,
      cargo: 0,
      cargoResource: null,
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

  // ---- Player actions issued from the island menu --------------------------

  private dockedPlayerShips(): Ship[] {
    return this.ships.filter((s) => s.owner === 'player' && s.state === 'docked');
  }

  /** A docked galleon, preferring the currently selected ship if it qualifies. */
  private pickColonizer(): Ship | null {
    const docked = this.dockedPlayerShips().filter((s) => SHIP_CLASSES[s.shipClass].canColonize);
    if (this.selectedShipId !== null) {
      const sel = docked.find((s) => s.id === this.selectedShipId);
      if (sel) return sel;
    }
    return docked[0] ?? null;
  }

  private pickTrader(): Ship | null {
    const docked = this.dockedPlayerShips();
    if (this.selectedShipId !== null) {
      const sel = docked.find((s) => s.id === this.selectedShipId);
      if (sel) return sel;
    }
    // Save galleons for colonising when a smaller hull is free.
    const small = docked.find((s) => !SHIP_CLASSES[s.shipClass].canColonize);
    return small ?? docked[0] ?? null;
  }

  hasGalleon(): boolean {
    return this.playerShips().some((s) => SHIP_CLASSES[s.shipClass].canColonize);
  }

  /** Send a docked galleon to colonise a neutral, colonisable island. */
  colonize(islandId: number): ActionResult {
    if (this.status !== 'playing') return { ok: false, message: 'The round is over.' };
    const island = this.getIsland(islandId);
    if (!island || !island.colonizable) return { ok: false, message: 'This island cannot be colonised.' };
    if (island.owner === 'player') return { ok: false, message: 'You already hold this island.' };
    if (island.owner === 'rival') return { ok: false, message: 'A rival already controls this island.' };
    if (!this.hasGalleon()) return { ok: false, message: 'You need a Galleon to colonise islands.' };
    if (this.resources.coins < island.colonizeCost) {
      return { ok: false, message: `Need ${island.colonizeCost} coins to colonise this isle.` };
    }
    const ship = this.pickColonizer();
    if (!ship) return { ok: false, message: 'No Galleon is docked and ready.' };
    ship.recalled = false;
    this.beginOutboundLeg(ship, { kind: 'island', id: islandId }, 'colonize');
    this.selectedShipId = null;
    return { ok: true, message: 'Galleon dispatched to colonise the isle.' };
  }

  /** Send a docked ship to set up a standing harvest route. */
  gather(target: ShipTarget): ActionResult {
    if (this.status !== 'playing') return { ok: false, message: 'The round is over.' };
    if (target.kind === 'island') {
      const island = this.getIsland(target.id);
      if (!island || island.isHome) return { ok: false, message: 'Nothing to harvest there.' };
      if (island.owner === 'rival') return { ok: false, message: 'A rival controls that island.' };
      if (island.owner === 'player') return { ok: false, message: 'Owned isles pay out on their own.' };
    } else if (!this.getFish(target.id)) {
      return { ok: false, message: 'No shoal there.' };
    }
    const ship = this.pickTrader();
    if (!ship) return { ok: false, message: 'No ship is docked and ready.' };
    if (this.resources.fish < TRADE_LAUNCH_FISH_COST) {
      return { ok: false, message: 'Not enough fish stores to provision the voyage.' };
    }
    this.resources.fish -= TRADE_LAUNCH_FISH_COST;
    ship.recalled = false;
    this.beginOutboundLeg(ship, target, 'trade');
    this.selectedShipId = null;
    return { ok: true, message: 'Harvest route established — the ship will keep sailing it.' };
  }

  // ---- Ship movement -------------------------------------------------------

  private homeOf(ship: Ship): Island {
    if (ship.owner === 'rival' && ship.rivalId !== undefined) {
      const rival = this.rivals.find((r) => r.id === ship.rivalId);
      const home = rival && this.getIsland(rival.homeIslandId);
      if (home) return home;
    }
    return this.homeIsland;
  }

  private targetAnchor(target: ShipTarget | null): { x: number; y: number; radius: number } | null {
    if (!target) return null;
    if (target.kind === 'island') {
      const island = this.getIsland(target.id);
      return island ? { x: island.x, y: island.y, radius: island.radius } : null;
    }
    const source = this.getFish(target.id);
    return source ? { x: source.x, y: source.y, radius: 0 } : null;
  }

  private beginOutboundLeg(ship: Ship, target: ShipTarget, purpose: ShipPurpose) {
    const home = this.homeOf(ship);
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
    ship.cargo = 0;
    ship.cargoResource = null;
    ship.target = target;
    ship.purpose = purpose;
    ship.state = 'outbound';
  }

  private beginReturnLeg(ship: Ship) {
    const home = this.homeOf(ship);
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

  private showToast(text: string) {
    this.toast = { text, ttl: 2.4 };
  }

  private isRouteValid(target: ShipTarget | null): boolean {
    if (!target) return false;
    if (target.kind === 'island') {
      const island = this.getIsland(target.id);
      return !!island && island.owner !== 'rival' && island.owner !== 'player';
    }
    return this.fishSources.some((f) => f.id === target.id);
  }

  private updateShips(dt: number) {
    const finished: Ship[] = [];
    for (const ship of this.ships) {
      if (ship.state === 'building') {
        ship.buildTimeLeft -= dt;
        if (ship.buildTimeLeft <= 0) {
          ship.state = 'docked';
          const home = this.homeOf(ship);
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
        // Arrived home — unload cargo.
        if (ship.cargo > 0 && ship.cargoResource) {
          if (ship.owner === 'player') {
            this.resources[ship.cargoResource] += ship.cargo;
            this.totalGathered[ship.cargoResource] += ship.cargo;
            if (ship.cargoResource === 'fur') this.furGathered += ship.cargo;
          }
          ship.cargo = 0;
          ship.cargoResource = null;
        }
        const keepGoing =
          ship.owner === 'player' &&
          ship.purpose === 'trade' &&
          !ship.recalled &&
          this.isRouteValid(ship.target);
        if (keepGoing && ship.target) {
          this.beginOutboundLeg(ship, ship.target, 'trade');
        } else if (ship.owner === 'rival') {
          finished.push(ship); // rival ships despawn once home
        } else {
          ship.state = 'docked';
          ship.progress = 0;
          ship.target = null;
          ship.purpose = 'trade';
          ship.recalled = false;
          const home = this.homeOf(ship);
          const harbor = shorePoint(home.x, home.y, home.radius, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
          ship.x = harbor.x;
          ship.y = harbor.y;
        }
      }
    }
    if (finished.length) {
      this.ships = this.ships.filter((s) => !finished.includes(s));
    }
  }

  private resolveArrival(ship: Ship) {
    const target = ship.target;
    if (!target) return;
    const def = SHIP_CLASSES[ship.shipClass];

    if (target.kind === 'fish') {
      const source = this.getFish(target.id);
      if (!source) return;
      const haul = Math.min(def.cargo, source.amount);
      source.amount -= haul;
      ship.cargo = haul;
      ship.cargoResource = 'fish';
      if (ship.owner === 'player') this.showToast(`Netted ${Math.round(haul)} fish`);
      return;
    }

    const island = this.getIsland(target.id);
    if (!island) return;

    if (ship.purpose === 'colonize') {
      if (ship.owner === 'player') this.resolvePlayerColonize(island);
      else this.resolveRivalColonize(ship, island);
      return;
    }

    // Trade route: haul home the island's stockpiled resource.
    if (island.owner === 'rival' || island.owner === 'player') {
      ship.recalled = true;
      if (ship.owner === 'player') this.showToast('That isle changed hands — route abandoned.');
      return;
    }
    const haul = Math.min(def.cargo, island.stock);
    island.stock -= haul;
    ship.cargo = haul;
    ship.cargoResource = island.resource;
    if (ship.owner === 'player' && haul > 0) {
      this.showToast(`Hauled ${Math.round(haul)} ${island.resource}`);
    }
  }

  private resolvePlayerColonize(island: Island) {
    if (!island.colonizable || island.owner !== 'neutral') {
      this.showToast('Could not colonise — the isle is no longer free.');
      return;
    }
    if (this.resources.coins < island.colonizeCost) {
      this.showToast('Not enough coins to plant the colony.');
      return;
    }
    this.resources.coins -= island.colonizeCost;
    island.owner = 'player';
    this.showToast(`Colony founded on the ${island.size} isle!`);
  }

  private resolveRivalColonize(ship: Ship, island: Island) {
    const rival = this.rivals.find((r) => r.id === ship.rivalId);
    if (!rival) return;
    if (!island.colonizable || island.owner !== 'neutral' || rival.coins < island.colonizeCost) return;
    rival.coins -= island.colonizeCost;
    island.owner = 'rival';
    island.rivalId = rival.id;
  }

  private updateRivals(dt: number) {
    for (const rival of this.rivals) {
      rival.coins += 3 * dt;
      rival.launchTimer -= dt;
      if (rival.launchTimer > 0) continue;
      rival.launchTimer = rival.launchInterval;

      const home = this.getIsland(rival.homeIslandId);
      if (!home) continue;
      // Rivals compete, but won't swallow the whole map — each lord holds at
      // most three colonies, leaving plenty for the player to fight over.
      const held = this.islands.filter((i) => i.owner === 'rival' && i.rivalId === rival.id).length;
      if (held >= 2) continue;
      // Don't dispatch toward an isle a rival ship is already colonising.
      const claimed = new Set(
        this.ships
          .filter((s) => s.owner === 'rival' && s.purpose === 'colonize' && s.target?.kind === 'island')
          .map((s) => s.target!.id)
      );
      const candidates = this.islands.filter(
        (i) => i.owner === 'neutral' && i.colonizable && !claimed.has(i.id) && rival.coins >= i.colonizeCost
      );
      if (candidates.length === 0) continue;
      candidates.sort(
        (a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y)
      );
      const target = candidates[0];
      const harbor = shorePoint(home.x, home.y, home.radius, target.x, target.y);
      const ship: Ship = {
        id: this.nextShipId++,
        owner: 'rival',
        rivalId: rival.id,
        shipClass: 'galleon',
        state: 'outbound',
        purpose: 'colonize',
        x: harbor.x,
        y: harbor.y,
        fromX: harbor.x,
        fromY: harbor.y,
        toX: harbor.x,
        toY: harbor.y,
        progress: 0,
        heading: 0,
        target: { kind: 'island', id: target.id },
        cargo: 0,
        cargoResource: null,
        buildTimeLeft: 0,
        recalled: false,
      };
      this.ships.push(ship);
      this.beginOutboundLeg(ship, { kind: 'island', id: target.id }, 'colonize');
    }
  }

  // Wild islands and shoals refill their producers up to the cap, then stop.
  // Drawing them down (by harvesting) lets them regenerate again.
  private updateNeutralStock(dt: number) {
    for (const island of this.islands) {
      if (island.owner !== 'neutral' || island.producers.length === 0) continue;
      if (island.stock >= island.stockCap) continue;
      const rate = island.producers.reduce((sum, p) => sum + p.ratePerSec, 0);
      island.stock = Math.min(island.stockCap, island.stock + rate * dt);
    }
  }

  private updateFishSources(dt: number) {
    for (const source of this.fishSources) {
      if (source.amount < source.capacity) {
        source.amount = Math.min(source.capacity, source.amount + source.ratePerSec * dt);
      }
    }
  }

  private updateResources(dt: number) {
    const prod = this.buildingProductionPerSec();
    const keys: ResourceKey[] = ['wood', 'stone', 'fish', 'coins'];
    for (const k of keys) {
      const gain = prod[k] * dt;
      this.resources[k] += gain;
      this.totalGathered[k] += gain;
    }
    if (prod.fur > 0) {
      const gain = prod.fur * dt;
      this.resources.fur += gain;
      this.totalGathered.fur += gain;
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
    this.updateNeutralStock(dt);

    // Mission objectives can be cleared early — the moment you hit the target,
    // the round is won.
    if (this.mission && this.objectiveMet()) {
      this.status = 'ended';
      this.outcome = 'win';
      return;
    }

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.status = 'ended';
      if (this.mission) this.outcome = this.objectiveMet() ? 'win' : 'loss';
    }
  }
}

export type { ResourceKey };
export { WORLD_WIDTH, WORLD_HEIGHT };
