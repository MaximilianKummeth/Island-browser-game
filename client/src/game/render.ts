import type { GameState } from './state';
import { WORLD_WIDTH, WORLD_HEIGHT } from './mapgen';
import type { Island, Ship } from './types';

const OWNER_FILL: Record<Island['owner'], string> = {
  player: '#3fae84',
  neutral: '#e8eef2',
  rival: '#c9533f',
};
const RIVAL_COLORS = ['#c9533f', '#8a4fc0'];

function polygonPath(ctx: CanvasRenderingContext2D, x: number, y: number, shape: number[]) {
  ctx.beginPath();
  shape.forEach((r, i) => {
    const angle = (i / shape.length) * Math.PI * 2;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

function drawSea(ctx: CanvasRenderingContext2D, t: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  grad.addColorStop(0, '#1c5d82');
  grad.addColorStop(1, '#0d3a5c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const y = ((i * 97 + t * 12) % (WORLD_HEIGHT + 60)) - 30;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= WORLD_WIDTH; x += 40) {
      ctx.lineTo(x, y + Math.sin((x + t * 30) * 0.02) * 6);
    }
    ctx.stroke();
  }
}

function drawIsland(
  ctx: CanvasRenderingContext2D,
  island: Island,
  isHighlighted: boolean
) {
  const fill =
    island.owner === 'rival' && island.rivalId !== undefined
      ? RIVAL_COLORS[island.rivalId]
      : OWNER_FILL[island.owner];

  ctx.save();
  if (isHighlighted) {
    ctx.shadowColor = 'rgba(255, 230, 140, 0.9)';
    ctx.shadowBlur = 18;
  }
  polygonPath(ctx, island.x, island.y, island.shape);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // snow cap
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(island.x, island.y - island.radius * 0.35, island.radius * 0.55, island.radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  if (island.isHome) {
    ctx.save();
    ctx.fillStyle = '#2c2c2c';
    ctx.beginPath();
    ctx.moveTo(island.x, island.y - island.radius * 0.9);
    ctx.lineTo(island.x - 10, island.y - island.radius * 0.5);
    ctx.lineTo(island.x + 10, island.y - island.radius * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (island.owner === 'neutral' && island.allianceNeeded > 0) {
    const radius = island.radius + 10;
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(island.x, island.y, radius, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();

    const pct = island.allianceProgress / island.allianceNeeded;
    ctx.strokeStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(island.x, island.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();
    ctx.restore();
  }
}

function drawShip(ctx: CanvasRenderingContext2D, ship: Ship, selected: boolean) {
  if (ship.state === 'building') return;
  ctx.save();
  const dx = ship.targetIslandId !== null ? 1 : 0;
  ctx.translate(ship.x, ship.y);
  const angle = ship.state === 'returning' ? Math.PI : 0;
  ctx.rotate(angle * dx);
  ctx.beginPath();
  ctx.moveTo(-8, 6);
  ctx.lineTo(8, 0);
  ctx.lineTo(-8, -6);
  ctx.closePath();
  ctx.fillStyle = selected ? '#ffd166' : '#f4f1ea';
  ctx.fill();
  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  t: number,
  hoveredIslandId: number | null
) {
  ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  drawSea(ctx, t);

  for (const island of state.islands) {
    drawIsland(ctx, island, island.id === hoveredIslandId);
  }
  for (const ship of state.ships) {
    drawShip(ctx, ship, ship.id === state.selectedShipId);
  }
}
