/**
 * Headless playtest harness.
 *
 * Drives every mission with an objective-aware auto-player and reports:
 *  - how long the bot needs to clear each objective (the "playtest"), and
 *  - whether each difficulty's time budget is enough.
 *
 * Run: npx --yes tsx scripts/playtest.ts
 */
import { GameState, SHIP_CLASSES } from '../src/game/state';
import {
  MISSIONS,
  DIFFICULTIES,
  missionDuration,
  type Mission,
  type Objective,
} from '../src/game/missions';
import type { Buildings, ShipClass, ShipTarget } from '../src/game/types';

type Game = GameState;

function buildingPlan(obj: Objective, game: Game): (keyof Buildings)[] {
  if (obj.kind === 'building') return [obj.building!];
  if (obj.kind === 'colonies') {
    if (game.buildings.shipyard < 2) return ['shipyard'];
    return ['market', 'workshop', 'shipyard'];
  }
  if (obj.kind === 'ships') return ['shipyard', 'fortress', 'workshop'];
  // resource objectives
  const r = obj.resource;
  if (r === 'coins') return ['market', 'workshop'];
  if (r === 'fish') return ['fishermen', 'workshop', 'shipyard'];
  if (r === 'fur') return ['shipyard', 'fortress'];
  return ['shipyard', 'workshop']; // wood / stone
}

function galleonCount(game: Game): number {
  return game.playerShips().filter((s) => SHIP_CLASSES[s.shipClass].canColonize).length;
}

function pickShipClass(obj: Objective, game: Game): ShipClass {
  if (obj.kind === 'colonies') {
    if (game.buildings.shipyard >= 2 && galleonCount(game) < 2) return 'galleon';
    return 'skiff';
  }
  if (obj.kind === 'ships') return 'skiff';
  if (game.buildings.shipyard >= 1) return 'galley';
  return 'skiff';
}

function harvestTargets(obj: Objective, game: Game): ShipTarget[] {
  const special = (res: string) => game.islands.find((i) => i.special && i.resource === res);
  const neutralOf = (res: string) =>
    game.islands.filter((i) => i.owner === 'neutral' && i.colonizable && i.resource === res);
  const fish = game.fishSources.map((f) => ({ kind: 'fish' as const, id: f.id }));
  const isl = (i: { id: number } | undefined): ShipTarget[] =>
    i ? [{ kind: 'island', id: i.id }] : [];

  if (obj.kind === 'have' || obj.kind === 'total') {
    const r = obj.resource!;
    if (r === 'fur') return isl(special('fur'));
    if (r === 'fish') return fish;
    if (r === 'wood') return [...isl(special('wood')), ...neutralOf('wood').map((i) => ({ kind: 'island' as const, id: i.id }))];
    if (r === 'stone') return [...isl(special('stone')), ...neutralOf('stone').map((i) => ({ kind: 'island' as const, id: i.id }))];
    // coins: harvest wood+stone to fund market upgrades
    return [...isl(special('wood')), ...isl(special('stone'))];
  }
  // colonies / ships / building → fund with wood + stone
  return [...isl(special('wood')), ...isl(special('stone'))];
}

let rrCounter = 0;

function botStep(game: Game, obj: Objective) {
  // 1) One building upgrade per step (mimics one click).
  for (const key of buildingPlan(obj, game)) {
    const cost = game.upgradeCost(key);
    if (cost && game.canAfford(cost)) {
      game.upgradeBuilding(key);
      break;
    }
  }

  // 2) Build a ship if a slot is free.
  if (game.playerShips().length < game.maxShips()) {
    if (obj.kind === 'colonies') {
      // Two cheap harvesters first (to feed both wood AND stone), then galleons.
      const gal = galleonCount(game);
      const nonGal = game.playerShips().length - gal;
      if (nonGal < 2) {
        if (game.canBuildShip('skiff')) game.buildShip('skiff');
      } else if (game.buildings.shipyard >= 2 && gal < 2) {
        if (game.canBuildShip('galleon')) game.buildShip('galleon');
      } else if (game.canBuildShip('skiff')) {
        game.buildShip('skiff');
      }
    } else {
      const cls = pickShipClass(obj, game);
      if (game.canBuildShip(cls)) game.buildShip(cls);
      else if (cls !== 'skiff' && game.canBuildShip('skiff')) game.buildShip('skiff');
    }
  }

  // 3) Colonise (colony missions): send docked galleons to the nearest free,
  // un-contested isle so voyages aren't wasted on islands rivals will snipe.
  if (obj.kind === 'colonies' && game.hasGalleon()) {
    const home = game.homeIsland;
    const contested = new Set(
      game.ships
        .filter((s) => s.purpose === 'colonize' && s.target?.kind === 'island')
        .map((s) => s.target!.id)
    );
    let dockedGalleons = game.ships.filter(
      (s) => s.owner === 'player' && s.state === 'docked' && SHIP_CLASSES[s.shipClass].canColonize
    ).length;
    const free = game.islands
      .filter((i) => i.owner === 'neutral' && i.colonizable && !contested.has(i.id))
      .sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y));
    for (const isle of free) {
      if (dockedGalleons <= 0) break;
      if (game.resources.coins < isle.colonizeCost) break;
      if (game.colonize(isle.id).ok) dockedGalleons--;
    }
  }

  // 4) Send idle ships to harvest.
  const targets = harvestTargets(obj, game);
  if (targets.length > 0) {
    const keepGalleonsHome = obj.kind === 'colonies';
    const idle = game.ships.filter(
      (s) =>
        s.owner === 'player' &&
        s.state === 'docked' &&
        !(keepGalleonsHome && SHIP_CLASSES[s.shipClass].canColonize)
    );
    for (const ship of idle) {
      if (game.resources.fish < 9) break;
      game.selectShip(ship.id);
      const target = targets[rrCounter++ % targets.length];
      game.gather(target);
    }
    game.selectShip(null);
  }
}

interface TrialResult {
  won: boolean;
  elapsed: number;
}

function runTrial(mission: Mission, sandbox: boolean, durationSeconds: number): TrialResult {
  rrCounter = 0;
  const game = new GameState({ mission, difficulty: 'hard' });
  if (sandbox) game.timeLeft = 100000;
  else game.timeLeft = durationSeconds;
  const dt = 0.1;
  const cap = sandbox ? 1500 : durationSeconds + 1;
  let elapsed = 0;
  let acc = 0;
  // prime: a first decision before the clock matters
  botStep(game, mission.objective);
  while (game.status === 'playing' && elapsed < cap) {
    game.tick(dt);
    elapsed += dt;
    acc += dt;
    if (acc >= 0.5) {
      acc = 0;
      botStep(game, mission.objective);
    }
  }
  return { won: game.objectiveMet(), elapsed };
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

const mode = process.argv[2] ?? 'tune';
const TRIALS = Number(process.argv[3] ?? (mode === 'tune' ? 7 : 12));

if (mode === 'debug') {
  const id = Number(process.argv[3] ?? 12);
  const mission = MISSIONS.find((m) => m.id === id)!;
  rrCounter = 0;
  const game = new GameState({ mission, difficulty: 'hard' });
  game.timeLeft = 100000;
  const dt = 0.1;
  let elapsed = 0;
  let acc = 0;
  let nextLog = 0;
  botStep(game, mission.objective);
  while (game.status === 'playing' && elapsed < 200) {
    game.tick(dt);
    elapsed += dt;
    acc += dt;
    if (acc >= 0.5) {
      acc = 0;
      botStep(game, mission.objective);
    }
    if (elapsed >= nextLog) {
      nextLog += 10;
      const gal = game.playerShips().filter((s) => SHIP_CLASSES[s.shipClass].canColonize);
      const galDocked = gal.filter((s) => s.state === 'docked').length;
      const free = game.islands.filter((i) => i.owner === 'neutral' && i.colonizable).length;
      console.log(
        `t=${elapsed.toFixed(0).padStart(3)} colonies=${game.islandsClaimed()} ` +
          `coins=${game.resources.coins.toFixed(0)} wood=${game.resources.wood.toFixed(0)} stone=${game.resources.stone.toFixed(0)} ` +
          `ship=${game.buildings.shipyard} mkt=${game.buildings.market} ` +
          `galleons=${gal.length}(${galDocked} docked) ships=${game.playerShips().length}/${game.maxShips()} freeIsles=${free}`
      );
    }
  }
  console.log(`Done at t=${elapsed.toFixed(1)} won=${game.objectiveMet()}`);
} else if (mode === 'mapstats') {
  let total = 0;
  let min = Infinity;
  let max = 0;
  const N = 40;
  for (let i = 0; i < N; i++) {
    const g = new GameState();
    const c = g.islands.filter((isl) => isl.colonizable && !isl.isHome).length;
    total += c;
    min = Math.min(min, c);
    max = Math.max(max, c);
  }
  console.log(`Colonizable islands over ${N} maps: avg=${(total / N).toFixed(1)} min=${min} max=${max}`);
} else if (mode === 'tune') {
  console.log('Mission bot-completion times (sandbox) and suggested HARD seconds:\n');
  console.log('id  title                  objective                               botMed  botMax  cur  suggest');
  for (const m of MISSIONS) {
    const times: number[] = [];
    for (let t = 0; t < TRIALS; t++) {
      const r = runTrial(m, true, 0);
      times.push(r.won ? r.elapsed : Infinity);
    }
    times.sort((a, b) => a - b);
    const med = times[Math.floor(times.length / 2)];
    const max = times[times.length - 1];
    const suggest = Number.isFinite(max) ? Math.ceil(max * 1.12) : NaN;
    const objStr = `${m.objective.kind}:${m.objective.resource ?? m.objective.building ?? ''}=${m.objective.amount}`;
    console.log(
      `${String(m.id).padEnd(3)} ${m.title.padEnd(22)} ${objStr.padEnd(38)} ` +
        `${med.toFixed(1).padStart(6)} ${(Number.isFinite(max) ? max.toFixed(1) : 'FAIL').padStart(6)} ` +
        `${String(m.baseSeconds).padStart(4)} ${String(Number.isFinite(suggest) ? suggest : 'FAIL').padStart(7)}`
    );
  }
} else {
  // verify: win-rate at every difficulty using the baked times
  console.log(`Verifying win-rates over ${TRIALS} trials per difficulty:\n`);
  console.log('id  title                  easy   medium hard');
  let allOk = true;
  for (const m of MISSIONS) {
    const rates: Record<string, number> = {};
    for (const d of DIFFICULTIES) {
      let wins = 0;
      const secs = missionDuration(m, d);
      for (let t = 0; t < TRIALS; t++) {
        if (runTrial(m, false, secs).won) wins++;
      }
      rates[d] = wins / TRIALS;
    }
    if (rates.easy < 1 || rates.medium < 0.85 || rates.hard < 0.6) allOk = false;
    const warn = rates.easy < 1 || rates.medium < 0.85 || rates.hard < 0.6 ? '  <-- check' : '';
    console.log(
      `${String(m.id).padEnd(3)} ${m.title.padEnd(22)} ${pct(rates.easy).padStart(5)} ` +
        `${pct(rates.medium).padStart(6)} ${pct(rates.hard).padStart(5)}${warn}`
    );
  }
  console.log(`\n${allOk ? 'ALL GOOD' : 'SOME MISSIONS NEED ATTENTION'}`);
}
