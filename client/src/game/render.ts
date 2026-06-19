import type { GameState } from './state';
import { SHIP_CLASSES } from './state';
import { WORLD_WIDTH, WORLD_HEIGHT } from './mapgen';
import type { Buildings, Island, Ship, FishSource } from './types';
import { levelColor, PLAYER_COLOR, NEUTRAL_COLOR, RIVAL_COLORS } from './palette';

type BuildingKind = 'house' | 'fishermen' | 'workshop' | 'market' | 'shipyard' | 'fortress';

const HOME_BUILDING_ORDER: (keyof Buildings)[] = ['fishermen', 'workshop', 'market', 'shipyard', 'fortress'];

const TERRAIN = {
  temperate: { shore: '#d8be84', land: '#69ab57', land2: '#558f48' },
  snowy: { shore: '#cddee8', land: '#f3fbff', land2: '#dcebf3' },
  rocky: { shore: '#bdb6a4', land: '#94a187', land2: '#7c8a72' },
} as const;

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ownerColor(island: Island): string {
  if (island.owner === 'rival' && island.rivalId !== undefined) return RIVAL_COLORS[island.rivalId];
  if (island.owner === 'player') return PLAYER_COLOR;
  return NEUTRAL_COLOR;
}

function polygonPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  shape: number[],
  scale = 1
) {
  ctx.beginPath();
  shape.forEach((r, i) => {
    const angle = (i / shape.length) * Math.PI * 2;
    const px = x + Math.cos(angle) * r * scale;
    const py = y + Math.sin(angle) * r * scale * 0.94;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

function drawSea(ctx: CanvasRenderingContext2D, t: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  grad.addColorStop(0, '#2a6f97');
  grad.addColorStop(1, '#114264');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const y = ((i * 90 + t * 10) % (WORLD_HEIGHT + 60)) - 30;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= WORLD_WIDTH; x += 40) {
      ctx.lineTo(x, y + Math.sin((x + t * 28) * 0.02) * 5);
    }
    ctx.stroke();
  }
}

function drawAura(ctx: CanvasRenderingContext2D, island: Island) {
  const color = ownerColor(island);
  const outer = island.radius * 1.95;
  const grad = ctx.createRadialGradient(island.x, island.y, island.radius * 0.6, island.x, island.y, outer);
  grad.addColorStop(0, hexToRgba(color, 0));
  grad.addColorStop(0.62, hexToRgba(color, 0));
  grad.addColorStop(0.82, hexToRgba(color, island.owner === 'neutral' ? 0.18 : 0.42));
  grad.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(island.x, island.y, outer, outer * 0.94, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, snowy: boolean) {
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(x - 0.8, y, 1.6, r * 0.5);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y + 1);
  ctx.lineTo(x, y - r * 1.3);
  ctx.lineTo(x + r * 0.6, y + 1);
  ctx.closePath();
  ctx.fillStyle = snowy ? '#3f7d57' : '#2f7d3f';
  ctx.fill();
  if (snowy) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.28, y - r * 0.55);
    ctx.lineTo(x, y - r * 1.3);
    ctx.lineTo(x + r * 0.28, y - r * 0.55);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}

function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, roof: string) {
  const w = 7.5 * scale;
  const h = 7 * scale;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.55, w * 0.6, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#efe6d2';
  ctx.strokeStyle = 'rgba(40,30,20,0.4)';
  ctx.lineWidth = 0.6;
  ctx.fillRect(x - w / 2, y - h * 0.15, w, h * 0.6);
  ctx.strokeRect(x - w / 2, y - h * 0.15, w, h * 0.6);

  ctx.beginPath();
  ctx.moveTo(x - w * 0.62, y - h * 0.1);
  ctx.lineTo(x, y - h * 0.85);
  ctx.lineTo(x + w * 0.62, y - h * 0.1);
  ctx.closePath();
  ctx.fillStyle = roof;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// One drawing routine for every home-island building, distinguished by
// silhouette per kind so the build panel and the map read consistently.
function drawBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  roof: string,
  kind: BuildingKind
) {
  if (kind === 'house') {
    drawHouse(ctx, x, y, scale, roof);
    return;
  }

  const w = 7.5 * scale;
  const h = 7 * scale;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.55, w * 0.62, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  if (kind === 'fortress') {
    const tw = w * 0.9;
    const th = h * 1.5;
    ctx.fillStyle = '#9099a3';
    ctx.strokeStyle = 'rgba(30,30,35,0.5)';
    ctx.lineWidth = 0.6;
    ctx.fillRect(x - tw / 2, y - th * 0.65, tw, th * 0.75);
    ctx.strokeRect(x - tw / 2, y - th * 0.65, tw, th * 0.75);
    const teeth = 4;
    for (let i = 0; i < teeth; i++) {
      const tx = x - tw / 2 + (i + 0.5) * (tw / teeth);
      ctx.fillStyle = i % 2 === 0 ? roof : '#9099a3';
      ctx.fillRect(tx - tw / (teeth * 2.6), y - th * 0.65 - th * 0.16, tw / (teeth * 1.3), th * 0.18);
    }
  } else if (kind === 'market') {
    const stallW = w * 1.15;
    ctx.fillStyle = '#cbb189';
    ctx.fillRect(x - stallW / 2, y - h * 0.05, stallW, h * 0.45);
    const stripes = 5;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? roof : '#f4ecd8';
      const sx = x - stallW / 2 + i * (stallW / stripes);
      ctx.beginPath();
      ctx.moveTo(sx, y - h * 0.05);
      ctx.lineTo(sx + stallW / stripes, y - h * 0.05);
      ctx.lineTo(sx + stallW / stripes, y - h * 0.32);
      ctx.lineTo(sx, y - h * 0.32);
      ctx.closePath();
      ctx.fill();
    }
  } else if (kind === 'shipyard') {
    ctx.strokeStyle = '#7a5a36';
    ctx.lineWidth = 1.4 * scale;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.7, y + h * 0.3);
    ctx.lineTo(x - w * 0.1, y - h * 0.75);
    ctx.lineTo(x + w * 0.5, y + h * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - w * 0.45, y + h * 0.05);
    ctx.lineTo(x + w * 0.25, y + h * 0.05);
    ctx.stroke();
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.ellipse(x - w * 0.1, y + h * 0.32, w * 0.45, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'fishermen') {
    ctx.fillStyle = '#d8cdb0';
    ctx.fillRect(x - w * 0.4, y - h * 0.05, w * 0.8, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y);
    ctx.lineTo(x, y - h * 0.6);
    ctx.lineTo(x + w * 0.5, y);
    ctx.closePath();
    ctx.fillStyle = roof;
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,240,245,0.7)';
    ctx.lineWidth = 0.5;
    const nx = x + w * 0.85;
    const ny = y + h * 0.15;
    const nr = h * 0.4;
    ctx.strokeRect(nx - nr * 0.6, ny - nr, nr * 1.2, nr * 1.4);
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(nx - nr * 0.6, ny - nr + i * nr * 0.45);
      ctx.lineTo(nx + nr * 0.6, ny - nr + i * nr * 0.45);
      ctx.stroke();
    }
  } else {
    // workshop — a house with a smoking chimney
    ctx.fillStyle = '#efe6d2';
    ctx.strokeStyle = 'rgba(40,30,20,0.4)';
    ctx.lineWidth = 0.6;
    ctx.fillRect(x - w / 2, y - h * 0.15, w, h * 0.6);
    ctx.strokeRect(x - w / 2, y - h * 0.15, w, h * 0.6);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.62, y - h * 0.1);
    ctx.lineTo(x, y - h * 0.85);
    ctx.lineTo(x + w * 0.62, y - h * 0.1);
    ctx.closePath();
    ctx.fillStyle = roof;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5b5048';
    ctx.fillRect(x + w * 0.18, y - h * 1.05, w * 0.14, h * 0.3);
  }
  ctx.restore();
}

function drawAllianceRing(ctx: CanvasRenderingContext2D, island: Island) {
  if (island.owner !== 'neutral' || island.allianceNeeded <= 0) return;
  const radius = island.radius + 9;
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.arc(island.x, island.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  if (island.allianceProgress > 0) {
    const pct = Math.min(island.allianceProgress / island.allianceNeeded, 1);
    ctx.strokeStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(island.x, island.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();
  }
  ctx.restore();
}

const NEUTRAL_STOCK_CAP = 150;

// A thin bar under wild, uninhabited islands showing the stockpile they've
// been quietly generating (capped at 150) — capture or trade-route them to
// bring it home.
function drawStockBar(ctx: CanvasRenderingContext2D, island: Island) {
  if (island.owner !== 'neutral' || island.stock <= 0) return;
  const w = island.radius * 1.3;
  const h = 4;
  const x = island.x - w / 2;
  const y = island.y + island.radius + 14;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y, w, h);
  const pct = Math.min(island.stock / NEUTRAL_STOCK_CAP, 1);
  ctx.fillStyle = '#bfa15a';
  ctx.fillRect(x, y, w * pct, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawIsland(
  ctx: CanvasRenderingContext2D,
  island: Island,
  highlighted: boolean,
  targetable: boolean,
  homeLevels: number[] | null
) {
  drawAura(ctx, island);
  const terrain = TERRAIN[island.terrain];

  // soft drop shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(island.x, island.y + island.radius * 0.32, island.radius * 1.02, island.radius * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // shore (full landmass) then the raised land plateau on top
  polygonPath(ctx, island.x, island.y, island.shape, 1);
  ctx.fillStyle = terrain.shore;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  polygonPath(ctx, island.x, island.y - island.radius * 0.06, island.shape, 0.8);
  ctx.fillStyle = terrain.land;
  ctx.fill();

  // a little tonal variation patch
  ctx.save();
  polygonPath(ctx, island.x, island.y - island.radius * 0.06, island.shape, 0.8);
  ctx.clip();
  ctx.fillStyle = terrain.land2;
  ctx.beginPath();
  ctx.ellipse(island.x - island.radius * 0.2, island.y + island.radius * 0.15, island.radius * 0.5, island.radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // decorations are drawn back-to-front by their y offset
  const trees = island.trees.map((d) => ({ x: island.x + d.dx, y: island.y + d.dy, r: d.r, kind: 'tree' as const }));
  const snowy = island.terrain === 'snowy';
  const buildings = island.buildingSpots.map((s, i) => {
    let roof: string;
    let kind: BuildingKind = 'house';
    if (island.isHome && homeLevels) {
      roof = levelColor(homeLevels[i] ?? 0);
      kind = HOME_BUILDING_ORDER[i] ?? 'house';
    } else if (island.owner === 'neutral') {
      roof = '#b5613f';
    } else {
      roof = ownerColor(island);
    }
    return { x: island.x + s.dx, y: island.y + s.dy, scale: s.scale, roof, kind };
  });
  const decor = [...trees, ...buildings].sort((a, b) => a.y - b.y);
  for (const d of decor) {
    if (d.kind === 'tree') drawTree(ctx, d.x, d.y, d.r, snowy);
    else drawBuilding(ctx, d.x, d.y, d.scale, d.roof, d.kind);
  }

  // home banner
  if (island.isHome && island.owner === 'player') {
    ctx.save();
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(island.x + island.radius * 0.5, island.y - island.radius * 0.5);
    ctx.lineTo(island.x + island.radius * 0.5, island.y - island.radius * 0.95);
    ctx.stroke();
    ctx.fillStyle = PLAYER_COLOR;
    ctx.beginPath();
    ctx.moveTo(island.x + island.radius * 0.5, island.y - island.radius * 0.95);
    ctx.lineTo(island.x + island.radius * 0.78, island.y - island.radius * 0.85);
    ctx.lineTo(island.x + island.radius * 0.5, island.y - island.radius * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawAllianceRing(ctx, island);
  drawStockBar(ctx, island);

  if (targetable) {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 226, 140, 0.85)';
    ctx.beginPath();
    ctx.arc(island.x, island.y, island.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (highlighted) {
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    polygonPath(ctx, island.x, island.y, island.shape, 1.05);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFishSource(
  ctx: CanvasRenderingContext2D,
  source: FishSource,
  t: number,
  targetable: boolean,
  highlighted: boolean
) {
  const depleted = source.amount < 6;
  ctx.save();
  ctx.globalAlpha = depleted ? 0.35 : 0.85;
  // shimmering water patch
  const grad = ctx.createRadialGradient(source.x, source.y, 2, source.x, source.y, source.radius);
  grad.addColorStop(0, 'rgba(120, 220, 200, 0.35)');
  grad.addColorStop(1, 'rgba(120, 220, 200, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(source.x, source.y, source.radius, 0, Math.PI * 2);
  ctx.fill();

  for (const f of source.fish) {
    const bob = Math.sin(t * 2 + f.dx) * 2;
    const x = source.x + f.dx;
    const y = source.y + f.dy + bob;
    ctx.fillStyle = '#cfeee4';
    ctx.beginPath();
    ctx.ellipse(x, y, f.r, f.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - f.r, y);
    ctx.lineTo(x - f.r * 1.7, y - f.r * 0.5);
    ctx.lineTo(x - f.r * 1.7, y + f.r * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  if (targetable && !depleted) {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(140, 240, 220, 0.9)';
    ctx.beginPath();
    ctx.arc(source.x, source.y, source.radius + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (highlighted) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(source.x, source.y, source.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSail(ctx: CanvasRenderingContext2D, cx: number, len: number, beam: number) {
  ctx.beginPath();
  ctx.moveTo(cx - len * 0.12, -beam * 0.5);
  ctx.quadraticCurveTo(cx + len * 0.5, 0, cx - len * 0.12, beam * 0.5);
  ctx.closePath();
  ctx.fillStyle = '#f5efe0';
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,50,40,0.4)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  // mast / cross beam
  ctx.beginPath();
  ctx.moveTo(cx - len * 0.12, -beam * 0.5);
  ctx.lineTo(cx - len * 0.12, beam * 0.5);
  ctx.strokeStyle = 'rgba(50,35,20,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawShip(ctx: CanvasRenderingContext2D, ship: Ship, selected: boolean) {
  if (ship.state === 'building') return;
  const def = SHIP_CLASSES[ship.shipClass];
  const scale = def.scale;
  const L = 24 * scale;
  const W = 10 * scale;

  ctx.save();
  ctx.translate(ship.x, ship.y);

  if (selected) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, L * 0.75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.rotate(ship.heading);

  // wake when moving
  if (ship.state === 'outbound' || ship.state === 'returning') {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-L * 0.5, -W * 0.2);
    ctx.lineTo(-L * 1.1, -W * 0.5);
    ctx.moveTo(-L * 0.5, W * 0.2);
    ctx.lineTo(-L * 1.1, W * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // hull
  ctx.beginPath();
  ctx.moveTo(L * 0.58, 0);
  ctx.quadraticCurveTo(L * 0.1, W * 0.6, -L * 0.5, W * 0.28);
  ctx.quadraticCurveTo(-L * 0.62, 0, -L * 0.5, -W * 0.28);
  ctx.quadraticCurveTo(L * 0.1, -W * 0.6, L * 0.58, 0);
  ctx.closePath();
  ctx.fillStyle = '#7a4a26';
  ctx.fill();
  ctx.strokeStyle = '#43260f';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // deck
  ctx.beginPath();
  ctx.ellipse(-L * 0.02, 0, L * 0.32, W * 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#a9743f';
  ctx.fill();

  // sails — count scales with class
  if (ship.shipClass === 'galleon') {
    drawSail(ctx, L * 0.22, L * 0.5, W * 1.1);
    drawSail(ctx, -L * 0.18, L * 0.42, W * 0.9);
  } else if (ship.shipClass === 'galley') {
    drawSail(ctx, L * 0.08, L * 0.6, W * 1.2);
  } else {
    drawSail(ctx, L * 0.05, L * 0.45, W * 1.0);
  }

  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  t: number,
  hoveredIslandId: number | null,
  hoveredFishId: number | null
) {
  ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  drawSea(ctx, t);

  const selecting = state.selectedShipId !== null;
  const homeLevels = HOME_BUILDING_ORDER.map((k) => state.buildings[k]);

  for (const source of state.fishSources) {
    drawFishSource(ctx, source, t, selecting, source.id === hoveredFishId);
  }

  // draw islands back-to-front so overlaps look natural
  const ordered = [...state.islands].sort((a, b) => a.y - b.y);
  for (const island of ordered) {
    const targetable = selecting && !island.isHome && island.owner !== 'rival';
    drawIsland(ctx, island, island.id === hoveredIslandId, targetable, island.isHome ? homeLevels : null);
  }

  for (const ship of state.ships) {
    drawShip(ctx, ship, ship.id === state.selectedShipId);
  }
}
