import type { Island, IslandSize, Rival } from './types';

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 600;

let nextId = 1;

function makeShape(radius: number, points: number): number[] {
  const shape: number[] = [];
  for (let i = 0; i < points; i++) {
    shape.push(radius * (0.78 + Math.random() * 0.3));
  }
  return shape;
}

function sizeFor(): { size: IslandSize; radius: number; allianceNeeded: number } {
  const roll = Math.random();
  if (roll < 0.45) return { size: 'small', radius: 22, allianceNeeded: 1 };
  if (roll < 0.8) return { size: 'medium', radius: 30, allianceNeeded: 2 };
  return { size: 'large', radius: 38, allianceNeeded: 3 };
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export interface GeneratedMap {
  islands: Island[];
  rivals: Rival[];
  homeIslandId: number;
}

export function generateMap(): GeneratedMap {
  nextId = 1;
  const islands: Island[] = [];

  const home: Island = {
    id: nextId++,
    x: 110,
    y: WORLD_HEIGHT - 110,
    radius: 40,
    size: 'large',
    owner: 'player',
    isHome: true,
    allianceNeeded: 0,
    allianceProgress: 0,
    shape: makeShape(40, 10),
  };
  islands.push(home);

  const rivalHomeSpots = [
    { x: WORLD_WIDTH - 110, y: 110 },
    { x: WORLD_WIDTH - 110, y: WORLD_HEIGHT - 110 },
  ];
  const rivalColors = ['#c9533f', '#8a4fc0'];
  const rivals: Rival[] = [];

  rivalHomeSpots.forEach((spot, i) => {
    const rivalIsland: Island = {
      id: nextId++,
      x: spot.x,
      y: spot.y,
      radius: 36,
      size: 'large',
      owner: 'rival',
      isHome: true,
      allianceNeeded: 0,
      allianceProgress: 0,
      shape: makeShape(36, 10),
      rivalId: i,
    };
    islands.push(rivalIsland);
    rivals.push({
      id: i,
      homeIslandId: rivalIsland.id,
      color: rivalColors[i],
      influenceTimer: 4 + Math.random() * 3,
      influenceInterval: 7,
    });
  });

  const neutralCount = 8;
  const placed: { x: number; y: number; radius: number }[] = islands.map((isl) => ({
    x: isl.x,
    y: isl.y,
    radius: isl.radius,
  }));

  let attempts = 0;
  let created = 0;
  while (created < neutralCount && attempts < 400) {
    attempts++;
    const x = 220 + Math.random() * (WORLD_WIDTH - 440);
    const y = 90 + Math.random() * (WORLD_HEIGHT - 180);
    const { size, radius, allianceNeeded } = sizeFor();

    const tooClose = placed.some((p) => distance(x, y, p.x, p.y) < p.radius + radius + 55);
    if (tooClose) continue;

    islands.push({
      id: nextId++,
      x,
      y,
      radius,
      size,
      owner: 'neutral',
      isHome: false,
      allianceNeeded,
      allianceProgress: 0,
      shape: makeShape(radius, 9),
    });
    placed.push({ x, y, radius });
    created++;
  }

  return { islands, rivals, homeIslandId: home.id };
}
