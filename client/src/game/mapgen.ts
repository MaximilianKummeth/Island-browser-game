import type {
  Island,
  IslandSize,
  IslandTerrain,
  Rival,
  FishSource,
  Decor,
  BuildingSpot,
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

function sizeFor(): { size: IslandSize; radius: number; allianceNeeded: number } {
  const roll = Math.random();
  if (roll < 0.45) return { size: 'small', radius: 24, allianceNeeded: 1 };
  if (roll < 0.8) return { size: 'medium', radius: 32, allianceNeeded: 2 };
  return { size: 'large', radius: 40, allianceNeeded: 3 };
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
      r: (terrain === 'snowy' ? 4.5 : 5) + Math.random() * 2.5,
    });
  }
  return trees;
}

function makeBuildingSpots(radius: number, count: number): BuildingSpot[] {
  const spots: BuildingSpot[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = count === 1 ? 0 : radius * (0.1 + Math.random() * 0.34);
    spots.push({
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist * 0.85,
      scale: 0.85 + Math.random() * 0.4,
    });
  }
  return spots;
}

function buildingCountFor(size: IslandSize): number {
  if (size === 'large') return 3;
  if (size === 'medium') return 2;
  return 1;
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

  // Player home — bottom-left, a developed temperate isle with the four
  // upgradeable buildings laid out in a stable cluster.
  const home: Island = {
    id: nextId++,
    x: 120,
    y: WORLD_HEIGHT - 120,
    radius: 46,
    size: 'large',
    terrain: 'temperate',
    owner: 'player',
    isHome: true,
    isFurIsland: false,
    allianceNeeded: 0,
    allianceProgress: 0,
    shape: makeShape(46, 12),
    trees: makeTrees(46, 'temperate', 6),
    // Order matches HOME_BUILDING_ORDER in render.ts: fishermen, workshop,
    // market, shipyard, fortress. The shipyard spot sits out toward the
    // open water (up-right, away from the home corner) so it reads as a
    // shore building rather than an inland one.
    buildingSpots: [
      { dx: -30, dy: 10, scale: 1.0 },
      { dx: -6, dy: -22, scale: 1.05 },
      { dx: 8, dy: 6, scale: 1.0 },
      { dx: 28, dy: -14, scale: 1.05 },
      { dx: -18, dy: -2, scale: 1.15 },
    ],
    stock: 0,
  };
  islands.push(home);

  // Two rival lords on the right flank.
  const rivalHomeSpots = [
    { x: WORLD_WIDTH - 120, y: 120 },
    { x: WORLD_WIDTH - 120, y: WORLD_HEIGHT - 120 },
  ];
  const rivals: Rival[] = [];
  rivalHomeSpots.forEach((spot, i) => {
    const rivalIsland: Island = {
      id: nextId++,
      x: spot.x,
      y: spot.y,
      radius: 42,
      size: 'large',
      terrain: 'temperate',
      owner: 'rival',
      isHome: true,
      isFurIsland: false,
      allianceNeeded: 0,
      allianceProgress: 0,
      shape: makeShape(42, 12),
      trees: makeTrees(42, 'temperate', 5),
      buildingSpots: makeBuildingSpots(42, 5),
      rivalId: i,
      stock: 0,
    };
    islands.push(rivalIsland);
    rivals.push({
      id: i,
      homeIslandId: rivalIsland.id,
      color: RIVAL_COLORS[i],
      influenceTimer: 5 + Math.random() * 3,
      influenceInterval: 7.5,
    });
  });

  const placed: { x: number; y: number; radius: number }[] = islands.map((isl) => ({
    x: isl.x,
    y: isl.y,
    radius: isl.radius,
  }));

  function tryPlace(radius: number): { x: number; y: number } | null {
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = 210 + Math.random() * (WORLD_WIDTH - 420);
      const y = 80 + Math.random() * (WORLD_HEIGHT - 160);
      const clear = placed.every((p) => distance(x, y, p.x, p.y) > p.radius + radius + 52);
      if (clear) return { x, y };
    }
    return null;
  }

  // The fur island — a snowy wild isle up north. It's not inhabitable (no
  // buildings/town ever generate here), but allying it opens a fur trade.
  const furSpot = tryPlace(44) ?? { x: WORLD_WIDTH / 2, y: 110 };
  const furIsland: Island = {
    id: nextId++,
    x: furSpot.x,
    y: furSpot.y,
    radius: 44,
    size: 'large',
    terrain: 'snowy',
    owner: 'neutral',
    isHome: false,
    isFurIsland: true,
    allianceNeeded: 2,
    allianceProgress: 0,
    shape: makeShape(44, 13),
    trees: makeTrees(44, 'snowy', 9),
    buildingSpots: [],
    stock: 0,
  };
  islands.push(furIsland);
  placed.push({ x: furIsland.x, y: furIsland.y, radius: furIsland.radius });

  // Scatter the contested neutral isles.
  const neutralCount = 7;
  let created = 0;
  while (created < neutralCount) {
    const { size, radius, allianceNeeded } = sizeFor();
    const spot = tryPlace(radius);
    if (!spot) break;
    const terrain: IslandTerrain = Math.random() < 0.25 ? 'rocky' : 'temperate';
    islands.push({
      id: nextId++,
      x: spot.x,
      y: spot.y,
      radius,
      size,
      terrain,
      owner: 'neutral',
      isHome: false,
      isFurIsland: false,
      allianceNeeded,
      allianceProgress: 0,
      shape: makeShape(radius, 11),
      trees: makeTrees(radius, terrain, size === 'large' ? 6 : size === 'medium' ? 4 : 2),
      buildingSpots: makeBuildingSpots(radius, buildingCountFor(size)),
      stock: 0,
    });
    placed.push({ x: spot.x, y: spot.y, radius });
    created++;
  }

  // Fish shoals out in open water — sail to them to bring back fish.
  const fishSources: FishSource[] = [];
  let fishMade = 0;
  let fishAttempts = 0;
  while (fishMade < 5 && fishAttempts < 200) {
    fishAttempts++;
    const x = 200 + Math.random() * (WORLD_WIDTH - 380);
    const y = 70 + Math.random() * (WORLD_HEIGHT - 140);
    const radius = 26;
    const clearOfIslands = placed.every((p) => distance(x, y, p.x, p.y) > p.radius + radius + 24);
    const clearOfFish = fishSources.every((f) => distance(x, y, f.x, f.y) > 130);
    if (!clearOfIslands || !clearOfFish) continue;
    const fish: Decor[] = [];
    const fishCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < fishCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.7;
      fish.push({ dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, r: 3 + Math.random() * 2 });
    }
    fishSources.push({ id: fishMade, x, y, radius, amount: 60, capacity: 60, fish });
    fishMade++;
  }

  return { islands, rivals, fishSources, homeIslandId: home.id };
}
