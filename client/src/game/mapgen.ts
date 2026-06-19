import type {
  Island,
  IslandSize,
  IslandTerrain,
  Rival,
  FishSource,
  Decor,
  BuildingSpot,
  Producer,
  ResourceKey,
  SpecialKind,
} from './types';
import { RIVAL_COLORS } from './palette';

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 600;

let nextId = 1;

function makeShape(radius: number, points: number): number[] {
  const shape: number[] = [];
  for (let i = 0; i < points; i++) {
    shape.push(radius * (0.8 + Math.random() * 0.28));
  }
  return shape;
}

function sizeFor(): { size: IslandSize; radius: number; colonizeCost: number } {
  const roll = Math.random();
  if (roll < 0.45) return { size: 'small', radius: 23, colonizeCost: 30 };
  if (roll < 0.8) return { size: 'medium', radius: 29, colonizeCost: 55 };
  return { size: 'large', radius: 35, colonizeCost: 85 };
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// Trees live in the outer ring, buildings cluster near the centre. Generated
// once per island so the town layout is stable across frames.
function makeTrees(radius: number, terrain: IslandTerrain, count: number): Decor[] {
  const trees: Decor[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = radius * (0.5 + Math.random() * 0.42);
    trees.push({
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist * 0.92,
      r: (terrain === 'snowy' ? 6 : 6.5) + Math.random() * 3,
    });
  }
  return trees;
}

function makeBuildingSpots(radius: number, count: number): BuildingSpot[] {
  const spots: BuildingSpot[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = count === 1 ? 0 : radius * (0.08 + Math.random() * 0.28);
    spots.push({
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist * 0.85,
      scale: 1.15 + Math.random() * 0.45,
    });
  }
  return spots;
}

function buildingCountFor(size: IslandSize): number {
  if (size === 'large') return 3;
  if (size === 'medium') return 2;
  return 1;
}

// Producer presets — the "animals" (and work crews) that live on an isle and
// the resource each one makes. The island menu lists these with their rates.
const PRODUCER_PRESETS: Record<ResourceKey, { icon: string; label: string }[]> = {
  wood: [
    { icon: '🦫', label: 'Beavers' },
    { icon: '🪓', label: 'Woodcutters' },
  ],
  stone: [
    { icon: '🐐', label: 'Mountain Goats' },
    { icon: '⛏️', label: 'Quarriers' },
  ],
  fish: [
    { icon: '🦭', label: 'Seals' },
    { icon: '🐧', label: 'Penguins' },
  ],
  fur: [
    { icon: '🦊', label: 'Arctic Foxes' },
    { icon: '🐺', label: 'Snow Wolves' },
  ],
  coins: [{ icon: '🪙', label: 'Traders' }],
};

function makeProducers(
  resource: ResourceKey,
  totalRate: number,
  count: number,
  radius: number
): Producer[] {
  const presets = PRODUCER_PRESETS[resource];
  const producers: Producer[] = [];
  const ratePer = totalRate / count;
  for (let i = 0; i < count; i++) {
    const preset = presets[i % presets.length];
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const dist = radius * (0.18 + Math.random() * 0.28);
    producers.push({
      kind: preset.label.toLowerCase(),
      icon: preset.icon,
      label: preset.label,
      resource,
      ratePerSec: Math.round(ratePer * 10) / 10,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist * 0.85,
    });
  }
  return producers;
}

function resourceForTerrain(terrain: IslandTerrain): ResourceKey {
  if (terrain === 'rocky') return 'stone';
  if (terrain === 'snowy') return 'fish';
  return 'wood';
}

export interface GeneratedMap {
  islands: Island[];
  rivals: Rival[];
  fishSources: FishSource[];
  homeIslandId: number;
}

export function generateMap(): GeneratedMap {
  nextId = 1;
  const islands: Island[] = [];

  // Player home — bottom-left, a developed temperate isle with the five
  // upgradeable buildings laid out in a stable cluster.
  const home: Island = {
    id: nextId++,
    x: 130,
    y: WORLD_HEIGHT - 130,
    radius: 58,
    size: 'large',
    terrain: 'temperate',
    owner: 'player',
    isHome: true,
    special: null,
    colonizable: false,
    colonizeCost: 0,
    resource: 'wood',
    producers: [],
    shape: makeShape(58, 12),
    trees: makeTrees(58, 'temperate', 6),
    // Order matches HOME_BUILDING_ORDER in render.ts: fishermen, workshop,
    // market, shipyard, fortress. The fortress sits in the middle so the
    // walls drawn around it ring the whole town.
    buildingSpots: [
      { dx: -34, dy: 14, scale: 1.25 },
      { dx: -8, dy: -24, scale: 1.3 },
      { dx: 20, dy: 12, scale: 1.25 },
      { dx: 34, dy: -12, scale: 1.3 },
      { dx: 0, dy: -2, scale: 1.5 },
    ],
    stock: 0,
    stockCap: 0,
  };
  islands.push(home);

  // Two rival lords on the right flank.
  const rivalHomeSpots = [
    { x: WORLD_WIDTH - 130, y: 130 },
    { x: WORLD_WIDTH - 130, y: WORLD_HEIGHT - 130 },
  ];
  const rivals: Rival[] = [];
  rivalHomeSpots.forEach((spot, i) => {
    const rivalIsland: Island = {
      id: nextId++,
      x: spot.x,
      y: spot.y,
      radius: 46,
      size: 'large',
      terrain: 'temperate',
      owner: 'rival',
      isHome: true,
      special: null,
      colonizable: false,
      colonizeCost: 0,
      resource: 'wood',
      producers: [],
      shape: makeShape(46, 12),
      trees: makeTrees(46, 'temperate', 5),
      buildingSpots: makeBuildingSpots(46, 5),
      rivalId: i,
      stock: 0,
      stockCap: 0,
    };
    islands.push(rivalIsland);
    rivals.push({
      id: i,
      homeIslandId: rivalIsland.id,
      color: RIVAL_COLORS[i],
      launchTimer: 16 + Math.random() * 6,
      launchInterval: 26,
      coins: 80,
    });
  });

  const placed: { x: number; y: number; radius: number }[] = islands.map((isl) => ({
    x: isl.x,
    y: isl.y,
    radius: isl.radius,
  }));

  function tryPlace(radius: number): { x: number; y: number } | null {
    for (let attempt = 0; attempt < 220; attempt++) {
      const x = 205 + Math.random() * (WORLD_WIDTH - 410);
      const y = 80 + Math.random() * (WORLD_HEIGHT - 160);
      const clear = placed.every((p) => distance(x, y, p.x, p.y) > p.radius + radius + 30);
      if (clear) return { x, y };
    }
    return null;
  }

  // Special resource islands — fur, stone and wood. None can ever be
  // colonised; they sit neutral forever and feed any fleet that harvests
  // them. Their output and stockpile cap are far larger than ordinary isles.
  const specials: { kind: SpecialKind; terrain: IslandTerrain; resource: ResourceKey; fallback: { x: number; y: number } }[] = [
    { kind: 'fur', terrain: 'snowy', resource: 'fur', fallback: { x: WORLD_WIDTH / 2, y: 110 } },
    { kind: 'stone', terrain: 'rocky', resource: 'stone', fallback: { x: WORLD_WIDTH / 2 - 150, y: 130 } },
    { kind: 'wood', terrain: 'temperate', resource: 'wood', fallback: { x: WORLD_WIDTH / 2 + 150, y: 130 } },
  ];
  for (const s of specials) {
    const radius = 42;
    const spot = tryPlace(radius) ?? s.fallback;
    islands.push({
      id: nextId++,
      x: spot.x,
      y: spot.y,
      radius,
      size: 'large',
      terrain: s.terrain,
      owner: 'neutral',
      isHome: false,
      special: s.kind,
      colonizable: false,
      colonizeCost: 0,
      resource: s.resource,
      // Special isles produce ~4x an ordinary large isle and bank a deep store.
      producers: makeProducers(s.resource, 12, 3, radius),
      stock: 200,
      stockCap: 600,
      shape: makeShape(radius, 13),
      trees: makeTrees(radius, s.terrain, s.kind === 'fur' ? 9 : 6),
      buildingSpots: [],
    });
    placed.push({ x: spot.x, y: spot.y, radius });
  }

  // Scatter the contested neutral isles — these are the ones players colonise.
  const neutralCount = 14;
  let created = 0;
  while (created < neutralCount) {
    const { size, radius, colonizeCost } = sizeFor();
    const spot = tryPlace(radius);
    if (!spot) break;
    const terrain: IslandTerrain = Math.random() < 0.3 ? 'rocky' : Math.random() < 0.25 ? 'snowy' : 'temperate';
    const resource = resourceForTerrain(terrain);
    const baseRate = size === 'large' ? 3 : size === 'medium' ? 2 : 1.2;
    const cap = size === 'large' ? 200 : size === 'medium' ? 140 : 90;
    islands.push({
      id: nextId++,
      x: spot.x,
      y: spot.y,
      radius,
      size,
      terrain,
      owner: 'neutral',
      isHome: false,
      special: null,
      colonizable: true,
      colonizeCost,
      resource,
      producers: makeProducers(resource, baseRate, buildingCountFor(size), radius),
      stock: 0,
      stockCap: cap,
      shape: makeShape(radius, 11),
      trees: makeTrees(radius, terrain, size === 'large' ? 6 : size === 'medium' ? 4 : 2),
      buildingSpots: makeBuildingSpots(radius, buildingCountFor(size)),
    });
    placed.push({ x: spot.x, y: spot.y, radius });
    created++;
  }

  // Fish shoals out in open water — sail to them to bring back fish. They
  // cap out and only regenerate once a fleet has drawn some down.
  const fishSources: FishSource[] = [];
  let fishMade = 0;
  let fishAttempts = 0;
  while (fishMade < 4 && fishAttempts < 200) {
    fishAttempts++;
    const x = 205 + Math.random() * (WORLD_WIDTH - 410);
    const y = 75 + Math.random() * (WORLD_HEIGHT - 150);
    const radius = 24;
    const clearOfIslands = placed.every((p) => distance(x, y, p.x, p.y) > p.radius + radius + 18);
    const clearOfFish = fishSources.every((f) => distance(x, y, f.x, f.y) > 120);
    if (!clearOfIslands || !clearOfFish) continue;
    const fish: Decor[] = [];
    const fishCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < fishCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.7;
      fish.push({ dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, r: 3 + Math.random() * 2 });
    }
    fishSources.push({ id: fishMade, x, y, radius, amount: 80, capacity: 80, ratePerSec: 3, fish });
    fishMade++;
  }

  return { islands, rivals, fishSources, homeIslandId: home.id };
}
