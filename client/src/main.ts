import './style.css';
import { GameState, ROUND_SECONDS, SHIP_CLASSES } from './game/state';
import { WORLD_WIDTH, WORLD_HEIGHT } from './game/mapgen';
import { render } from './game/render';
import { levelColor } from './game/palette';
import {
  MISSIONS,
  DIFFICULTIES,
  missionDuration,
  objectiveText,
  type Mission,
  type Difficulty,
} from './game/missions';
import type { Island, FishSource, Buildings, ShipClass, ResourceKey } from './game/types';
import * as api from './api';
import type { AuthUser, Profile } from './api';

const app = document.querySelector<HTMLDivElement>('#app')!;

type Screen = 'start' | 'auth' | 'playing' | 'summary' | 'leaderboard' | 'missions';

interface AppCtx {
  screen: Screen;
  user: AuthUser | null;
  profile: Profile | null;
  game: GameState | null;
  authMode: 'login' | 'register';
  authError: string | null;
  submitting: boolean;
  difficulty: Difficulty;
  lastMission: Mission | null;
}

const ctx: AppCtx = {
  screen: 'start',
  user: null,
  profile: null,
  game: null,
  authMode: 'login',
  authError: null,
  submitting: false,
  difficulty: 'medium',
  lastMission: null,
};

const DIFF_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

function missionKey(id: number, d: Difficulty): string {
  return `frostmere_mission_${id}_${d}`;
}
function isMissionDone(id: number, d: Difficulty): boolean {
  return localStorage.getItem(missionKey(id, d)) === '1';
}
function markMissionDone(id: number, d: Difficulty) {
  localStorage.setItem(missionKey(id, d), '1');
}

const RES_ICON: Record<ResourceKey, string> = {
  wood: '🪵',
  stone: '🪨',
  fish: '🐟',
  fur: '🦊',
  coins: '🪙',
};

const BUILDING_INFO: Record<keyof Buildings, string> = {
  fishermen: 'More fish per second',
  workshop: 'Boosts all home production',
  market: 'Mints coins to fund colonies',
  shipyard: 'More ship slots · unlocks bigger hulls',
  fortress: 'More ship slots · walls around your town',
};

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function buildingLabel(key: keyof Buildings): string {
  return {
    fishermen: 'Fishermen',
    workshop: 'Workshop',
    market: 'Market',
    shipyard: 'Shipyard',
    fortress: 'Fortress',
  }[key];
}

function costText(cost: Partial<Record<ResourceKey, number>>): string {
  return Object.entries(cost)
    .map(([k, v]) => `${Math.ceil(v as number)} ${RES_ICON[k as ResourceKey] ?? k}`)
    .join(' ');
}

async function refreshProfile() {
  const me = await api.fetchMe();
  ctx.user = me?.user ?? null;
  ctx.profile = me?.profile ?? null;
}

function renderApp() {
  if (ctx.screen === 'start') renderStart();
  else if (ctx.screen === 'auth') renderAuth();
  else if (ctx.screen === 'playing') renderPlaying();
  else if (ctx.screen === 'summary') renderSummary();
  else if (ctx.screen === 'leaderboard') void renderLeaderboard();
  else if (ctx.screen === 'missions') renderMissions();
}

function renderStart() {
  app.innerHTML = `
    <div class="screen start-screen">
      <h1 class="title">Frostmere Isles</h1>
      <p class="subtitle">Gather resources, mint coins, build a fleet, and colonise the archipelago with your galleons before two rival lords claim it — each round lasts three minutes.</p>
      <div class="account-row">
        ${
          ctx.user
            ? `<span class="welcome">Sailing as <strong>${ctx.user.username}</strong> · Best score: ${ctx.profile?.bestScore ?? 0}</span>
               <button class="btn ghost" id="logout-btn">Log out</button>`
            : `<button class="btn ghost" id="login-open-btn">Log in / Register</button>`
        }
      </div>
      <div class="menu-actions">
        <button class="btn primary" id="play-btn">Set Sail (Free Play)</button>
        <button class="btn primary" id="missions-btn">Missions</button>
        <button class="btn ghost" id="leaderboard-btn">Leaderboard</button>
      </div>
      <p class="hint">No account needed to play — log in to save your best scores.</p>
    </div>
  `;
  document.querySelector('#play-btn')?.addEventListener('click', startRound);
  document.querySelector('#missions-btn')?.addEventListener('click', () => {
    ctx.screen = 'missions';
    renderApp();
  });
  document.querySelector('#login-open-btn')?.addEventListener('click', () => {
    ctx.screen = 'auth';
    ctx.authError = null;
    renderApp();
  });
  document.querySelector('#logout-btn')?.addEventListener('click', () => {
    api.logout();
    ctx.user = null;
    ctx.profile = null;
    renderApp();
  });
  document.querySelector('#leaderboard-btn')?.addEventListener('click', () => {
    ctx.screen = 'leaderboard';
    renderApp();
  });
}

function renderAuth() {
  const mode = ctx.authMode;
  app.innerHTML = `
    <div class="screen auth-screen">
      <h2>${mode === 'login' ? 'Log In' : 'Create Account'}</h2>
      <form id="auth-form" class="auth-form">
        <label>Username<input name="username" autocomplete="username" required minlength="3" maxlength="20" /></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required minlength="6" /></label>
        ${ctx.authError ? `<p class="error">${ctx.authError}</p>` : ''}
        <button type="submit" class="btn primary">${mode === 'login' ? 'Log In' : 'Register'}</button>
      </form>
      <button class="btn link" id="switch-mode-btn">
        ${mode === 'login' ? 'Need an account? Register' : 'Already have an account? Log in'}
      </button>
      <button class="btn ghost" id="back-btn">Back</button>
    </div>
  `;
  document.querySelector('#back-btn')?.addEventListener('click', () => {
    ctx.screen = 'start';
    renderApp();
  });
  document.querySelector('#switch-mode-btn')?.addEventListener('click', () => {
    ctx.authMode = ctx.authMode === 'login' ? 'register' : 'login';
    ctx.authError = null;
    renderApp();
  });
  document.querySelector('#auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const username = (form.elements.namedItem('username') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    try {
      ctx.user =
        mode === 'login' ? await api.login(username, password) : await api.register(username, password);
      await refreshProfile();
      ctx.screen = 'start';
      renderApp();
    } catch (err) {
      ctx.authError = err instanceof Error ? err.message : 'Something went wrong.';
      renderApp();
    }
  });
}

async function renderLeaderboard() {
  app.innerHTML = `<div class="screen leaderboard-screen"><h2>Top Captains</h2><p class="hint">Loading…</p></div>`;
  try {
    const board = await api.fetchLeaderboard();
    app.innerHTML = `
      <div class="screen leaderboard-screen">
        <h2>Top Captains</h2>
        ${
          board.length === 0
            ? '<p class="hint">No scores yet — be the first!</p>'
            : `<ol class="leaderboard-list">
                ${board
                  .map(
                    (e) =>
                      `<li><span>${e.username}</span><span>${e.bestScore} pts</span><span class="muted">${e.roundsPlayed} rounds</span></li>`
                  )
                  .join('')}
              </ol>`
        }
        <button class="btn ghost" id="back-btn">Back</button>
      </div>
    `;
  } catch {
    app.innerHTML = `<div class="screen leaderboard-screen"><h2>Top Captains</h2><p class="error">Could not reach the server.</p><button class="btn ghost" id="back-btn">Back</button></div>`;
  }
  document.querySelector('#back-btn')?.addEventListener('click', () => {
    ctx.screen = 'start';
    renderApp();
  });
}

function renderMissions() {
  const d = ctx.difficulty;
  const doneCount = MISSIONS.filter((m) => isMissionDone(m.id, d)).length;
  const diffButtons = DIFFICULTIES.map(
    (key) =>
      `<button class="btn small diff-btn${key === d ? ' active' : ''}" data-diff="${key}">${DIFF_LABEL[key]}</button>`
  ).join('');
  const cards = MISSIONS.map((m) => {
    const secs = missionDuration(m, d);
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    const time = mm > 0 ? `${mm}:${ss.toString().padStart(2, '0')}` : `${ss}s`;
    const done = isMissionDone(m.id, d);
    return `
      <div class="mission-card${done ? ' done' : ''}">
        <div class="mission-card-head">
          <h3>${m.title}</h3>
          ${done ? '<span class="mission-tick">✓</span>' : ''}
        </div>
        <p class="mission-desc">${m.description}</p>
        <p class="mission-obj">🎯 ${objectiveText(m.objective)}</p>
        <div class="mission-card-foot">
          <span class="mission-time">⏱ ${time}</span>
          <button class="btn small primary" data-mission="${m.id}">Play</button>
        </div>
      </div>`;
  }).join('');

  app.innerHTML = `
    <div class="screen missions-screen">
      <h2>Missions</h2>
      <p class="subtitle">Complete each objective before time runs out. Difficulty changes only the clock.</p>
      <div class="diff-row">
        <span class="diff-label">Difficulty:</span>
        ${diffButtons}
        <span class="muted">${doneCount}/${MISSIONS.length} done on ${DIFF_LABEL[d]}</span>
      </div>
      <div class="mission-grid">${cards}</div>
      <button class="btn ghost" id="back-btn">Back to Menu</button>
    </div>
  `;

  app.querySelectorAll<HTMLButtonElement>('button[data-diff]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ctx.difficulty = btn.dataset.diff as Difficulty;
      renderApp();
    });
  });
  app.querySelectorAll<HTMLButtonElement>('button[data-mission]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mission = MISSIONS.find((m) => m.id === Number(btn.dataset.mission));
      if (mission) startMission(mission, ctx.difficulty);
    });
  });
  document.querySelector('#back-btn')?.addEventListener('click', () => {
    ctx.screen = 'start';
    renderApp();
  });
}

function renderSummary() {
  if (!ctx.game) return;
  const game = ctx.game;
  if (game.mission) return renderMissionSummary();
  const summary = game.computeSummary();
  app.innerHTML = `
    <div class="screen summary-screen">
      <h2>Voyage Complete</h2>
      <div class="summary-grid">
        <div><span>Islands Colonised</span><strong>${summary.islandsClaimed}</strong></div>
        <div><span>Ships Built</span><strong>${summary.shipsBuilt}</strong></div>
        <div><span>Fur Gathered</span><strong>${summary.furGathered}</strong></div>
        <div><span>Gold Earned</span><strong>${summary.goldEarned}</strong></div>
        <div class="summary-total"><span>Final Score</span><strong>${summary.score}</strong></div>
      </div>
      <p class="hint" id="submit-status">
        ${ctx.user ? (ctx.submitting ? 'Saving your voyage…' : 'Saved to your profile.') : 'Log in next time to save this score.'}
      </p>
      <div class="menu-actions">
        <button class="btn primary" id="play-again-btn">Set Sail Again</button>
        <button class="btn ghost" id="leaderboard-btn">Leaderboard</button>
        <button class="btn ghost" id="menu-btn">Main Menu</button>
      </div>
    </div>
  `;
  document.querySelector('#play-again-btn')?.addEventListener('click', startRound);
  document.querySelector('#menu-btn')?.addEventListener('click', () => {
    ctx.screen = 'start';
    renderApp();
  });
  document.querySelector('#leaderboard-btn')?.addEventListener('click', () => {
    ctx.screen = 'leaderboard';
    renderApp();
  });
}

function renderMissionSummary() {
  if (!ctx.game || !ctx.game.mission) return;
  const game = ctx.game;
  const mission = game.mission!;
  const won = game.outcome === 'win';
  app.innerHTML = `
    <div class="screen summary-screen">
      <h2>${won ? '🏆 Mission Complete!' : '💀 Mission Failed'}</h2>
      <p class="subtitle">${mission.title} · ${DIFF_LABEL[ctx.difficulty]}</p>
      <div class="summary-grid">
        <div><span>Objective</span><strong class="small-strong">${objectiveText(mission.objective)}</strong></div>
        <div><span>You reached</span><strong>${game.objectiveCurrent()} / ${game.objectiveTarget()}</strong></div>
      </div>
      <p class="hint">${won ? 'Marked complete on this difficulty.' : 'Try again — or drop to an easier clock.'}</p>
      <div class="menu-actions">
        <button class="btn primary" id="retry-btn">${won ? 'Play Again' : 'Retry'}</button>
        <button class="btn ghost" id="missions-btn">Missions</button>
        <button class="btn ghost" id="menu-btn">Main Menu</button>
      </div>
    </div>
  `;
  document.querySelector('#retry-btn')?.addEventListener('click', () => startMission(mission, ctx.difficulty));
  document.querySelector('#missions-btn')?.addEventListener('click', () => {
    ctx.screen = 'missions';
    renderApp();
  });
  document.querySelector('#menu-btn')?.addEventListener('click', () => {
    ctx.screen = 'start';
    renderApp();
  });
}

function startRound() {
  ctx.game = new GameState();
  if (import.meta.env.DEV) {
    (window as unknown as { __game: GameState }).__game = ctx.game;
  }
  ctx.screen = 'playing';
  renderApp();
}

function startMission(mission: Mission, difficulty: Difficulty) {
  ctx.difficulty = difficulty;
  ctx.lastMission = mission;
  ctx.game = new GameState({ mission, difficulty });
  if (import.meta.env.DEV) {
    (window as unknown as { __game: GameState }).__game = ctx.game;
  }
  ctx.screen = 'playing';
  renderApp();
}

async function finishRound() {
  if (!ctx.game) return;
  const game = ctx.game;

  if (game.mission) {
    if (game.outcome === 'win') markMissionDone(game.mission.id, ctx.difficulty);
    ctx.screen = 'summary';
    renderApp();
    return;
  }

  const summary = game.computeSummary();
  if (ctx.user) {
    ctx.submitting = true;
    try {
      const result = await api.submitRun(summary);
      ctx.profile = result?.profile ?? ctx.profile;
    } catch {
      // keep showing the local summary even if the save request failed
    }
    ctx.submitting = false;
  }
  ctx.screen = 'summary';
  renderApp();
}

type MenuTarget = { kind: 'island'; id: number } | { kind: 'fish'; id: number };

function renderPlaying() {
  app.innerHTML = `
    <div class="screen play-screen">
      <div class="hud-top" id="hud-top"></div>
      <div class="objective-bar" id="objective-bar"></div>
      <div class="canvas-wrap">
        <canvas id="game-canvas"></canvas>
        <div class="toast" id="toast"></div>
        <div class="island-menu hidden" id="island-menu"></div>
      </div>
      <div class="hud-bottom">
        <div class="panel build-panel" id="build-panel"></div>
        <div class="panel ship-panel" id="ship-panel">
          <div class="ship-panel-header">
            <span id="fleet-label">Fleet</span>
          </div>
          <div class="ship-build-row" id="ship-build-row"></div>
          <div class="ship-list" id="ship-list"></div>
          <p class="hint" id="ship-hint">Click an island to colonise or harvest it. Galleons are needed to colonise.</p>
        </div>
      </div>
    </div>
  `;

  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
  const ctx2d = canvas.getContext('2d')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = WORLD_WIDTH * dpr;
  canvas.height = WORLD_HEIGHT * dpr;
  ctx2d.scale(dpr, dpr);

  const menuEl = document.querySelector<HTMLDivElement>('#island-menu')!;
  let menuTarget: MenuTarget | null = null;

  let hoveredIslandId: number | null = null;
  let hoveredFishId: number | null = null;

  function toWorld(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * WORLD_WIDTH,
      y: ((clientY - rect.top) / rect.height) * WORLD_HEIGHT,
    };
  }

  function islandAt(x: number, y: number): Island | null {
    const game = ctx.game;
    if (!game) return null;
    return game.islands.find((isl) => Math.hypot(isl.x - x, isl.y - y) <= isl.radius + 8) ?? null;
  }

  function fishAt(x: number, y: number): FishSource | null {
    const game = ctx.game;
    if (!game) return null;
    return game.fishSources.find((f) => Math.hypot(f.x - x, f.y - y) <= f.radius) ?? null;
  }

  canvas.addEventListener('mousemove', (e) => {
    const { x, y } = toWorld(e.clientX, e.clientY);
    const isl = islandAt(x, y);
    hoveredIslandId = isl?.id ?? null;
    hoveredFishId = isl ? null : fishAt(x, y)?.id ?? null;
    canvas.style.cursor = isl || hoveredFishId !== null ? 'pointer' : 'default';
  });

  canvas.addEventListener('click', (e) => {
    const game = ctx.game;
    if (!game) return;
    const { x, y } = toWorld(e.clientX, e.clientY);
    const island = islandAt(x, y);
    if (island) {
      if (island.isHome && island.owner === 'player') {
        closeMenu();
        return;
      }
      openMenu({ kind: 'island', id: island.id });
      return;
    }
    const fish = fishAt(x, y);
    if (fish) {
      openMenu({ kind: 'fish', id: fish.id });
      return;
    }
    closeMenu();
  });

  function openMenu(target: MenuTarget) {
    menuTarget = target;
    menuEl.classList.remove('hidden');
    renderMenu();
  }

  function closeMenu() {
    menuTarget = null;
    menuEl.classList.add('hidden');
  }

  function producerList(island: Island): string {
    if (island.producers.length === 0) return '';
    const rows = island.producers
      .map(
        (p) =>
          `<li><span>${p.icon} ${p.label}</span><span class="rate">+${p.ratePerSec.toFixed(1)} ${RES_ICON[p.resource]}/s</span></li>`
      )
      .join('');
    return `<ul class="producer-list">${rows}</ul>`;
  }

  function renderMenu() {
    const game = ctx.game;
    if (!game || !menuTarget) return;

    if (menuTarget.kind === 'fish') {
      const fish = game.getFish(menuTarget.id);
      if (!fish) {
        closeMenu();
        return;
      }
      menuEl.innerHTML = `
        <div class="island-menu-head">
          <h3>🐟 Fishing Shoal</h3>
          <button class="menu-close" data-action="close">✕</button>
        </div>
        <p class="menu-line">Fish in the water: <strong>${Math.floor(fish.amount)} / ${fish.capacity}</strong></p>
        <p class="menu-line muted">Refills to the cap, then waits until a boat draws it down.</p>
        <div class="menu-actions-row">
          <button class="btn small primary" data-action="harvest-fish">Send fishing boat (8 🐟)</button>
        </div>
      `;
      return;
    }

    const island = game.getIsland(menuTarget.id);
    if (!island) {
      closeMenu();
      return;
    }

    const title = island.special
      ? `⭐ Special ${island.resource[0].toUpperCase()}${island.resource.slice(1)} Isle`
      : `${island.terrain[0].toUpperCase()}${island.terrain.slice(1)} ${island.size} isle`;

    let ownerLine = 'Unclaimed';
    if (island.owner === 'player') ownerLine = 'Your colony';
    else if (island.owner === 'rival') ownerLine = 'Held by a rival lord';
    else if (island.special) ownerLine = 'Free for all to harvest — never colonised';

    const stockLine =
      island.owner === 'neutral' && island.stockCap > 0
        ? `<p class="menu-line">Stockpile: <strong>${Math.floor(island.stock)} / ${island.stockCap} ${RES_ICON[island.resource]}</strong></p>`
        : '';

    let actions = '';
    if (island.owner === 'neutral') {
      if (island.colonizable) {
        const hasGalleon = game.hasGalleon();
        const canAfford = game.resources.coins >= island.colonizeCost;
        const disabled = !hasGalleon || !canAfford ? 'disabled' : '';
        const note = !hasGalleon
          ? '<span class="menu-note">Build a Galleon first</span>'
          : !canAfford
          ? `<span class="menu-note">Need ${island.colonizeCost} 🪙</span>`
          : '';
        actions += `<button class="btn small primary" data-action="colonize" ${disabled}>Colonise (${island.colonizeCost} 🪙)</button>${note}`;
      }
      actions += `<button class="btn small ghost" data-action="harvest">Send harvest ship (8 🐟)</button>`;
    } else if (island.owner === 'player') {
      actions = '<span class="menu-note">This colony pays into your stores automatically.</span>';
    } else {
      actions = '<span class="menu-note">Out-colonise rivals by claiming free isles first.</span>';
    }

    menuEl.innerHTML = `
      <div class="island-menu-head">
        <h3>${title}</h3>
        <button class="menu-close" data-action="close">✕</button>
      </div>
      <p class="menu-line muted">${ownerLine}</p>
      <p class="menu-sub">Produces</p>
      ${producerList(island) || '<p class="menu-line muted">Nothing of note.</p>'}
      ${stockLine}
      <div class="menu-actions-row">${actions}</div>
    `;
  }

  menuEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    const game = ctx.game;
    if (!btn || !game || !menuTarget) return;
    const action = btn.dataset.action;
    if (action === 'close') {
      closeMenu();
      return;
    }
    if (action === 'colonize' && menuTarget.kind === 'island') {
      const res = game.colonize(menuTarget.id);
      updateShipHint(res.message);
      renderMenu();
      renderShipList();
    } else if (action === 'harvest' && menuTarget.kind === 'island') {
      const res = game.gather({ kind: 'island', id: menuTarget.id });
      updateShipHint(res.message);
      renderShipList();
    } else if (action === 'harvest-fish' && menuTarget.kind === 'fish') {
      const res = game.gather({ kind: 'fish', id: menuTarget.id });
      updateShipHint(res.message);
      renderShipList();
    }
  });

  function updateShipHint(message?: string | null) {
    const hint = document.querySelector('#ship-hint');
    if (!hint) return;
    hint.textContent = message ?? 'Click an island to colonise or harvest it. Galleons are needed to colonise.';
  }

  const buildPanelEl = document.querySelector<HTMLDivElement>('#build-panel')!;
  buildPanelEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-key]');
    const game = ctx.game;
    if (!btn || !game) return;
    if (game.upgradeBuilding(btn.dataset.key as keyof Buildings)) renderBuildPanel();
  });

  function renderBuildPanel() {
    const game = ctx.game;
    if (!game) return;
    const keys: (keyof Buildings)[] = ['fishermen', 'workshop', 'market', 'shipyard', 'fortress'];
    buildPanelEl.innerHTML =
      '<div class="panel-title">Home Town</div>' +
      keys
        .map((key) => {
          const level = game.buildings[key];
          const cost = game.upgradeCost(key);
          const affordable = cost ? game.canAfford(cost) : false;
          return `
          <div class="build-row">
            <span class="build-name">
              <span class="lvl-swatch" style="background:${levelColor(level)}"></span>
              <span class="build-text">${buildingLabel(key)} <em>Lv ${level}</em><small>${BUILDING_INFO[key]}</small></span>
            </span>
            <button class="btn small" data-key="${key}" ${!cost || !affordable ? 'disabled' : ''}>
              ${cost ? `${costText(cost)}` : 'Maxed'}
            </button>
          </div>
        `;
        })
        .join('');
  }

  const shipBuildRowEl = document.querySelector<HTMLDivElement>('#ship-build-row')!;
  shipBuildRowEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-class]');
    const game = ctx.game;
    if (!btn || !game) return;
    if (game.buildShip(btn.dataset.class as ShipClass)) {
      renderShipList();
    }
  });

  function renderShipBuildRow() {
    const game = ctx.game;
    if (!game) return;
    shipBuildRowEl.innerHTML = (Object.keys(SHIP_CLASSES) as ShipClass[])
      .map((key) => {
        const def = SHIP_CLASSES[key];
        const locked = game.buildings.shipyard < def.requiresShipyard;
        const canBuild = game.canBuildShip(key);
        const tag = def.canColonize ? ' ⚑' : '';
        const label = locked
          ? `🔒 ${def.name} <em>Shipyard Lv${def.requiresShipyard}</em>`
          : `${def.name}${tag} <em>${costText(def.cost)}</em>`;
        return `<button class="ship-build-btn" data-class="${key}" ${canBuild ? '' : 'disabled'}>${label}</button>`;
      })
      .join('');
  }

  const shipListEl = document.querySelector<HTMLDivElement>('#ship-list')!;
  shipListEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const game = ctx.game;
    if (!game) return;
    const selectBtn = target.closest<HTMLButtonElement>('button[data-ship]');
    if (selectBtn) {
      const id = Number(selectBtn.dataset.ship);
      game.selectShip(game.selectedShipId === id ? null : id);
      renderShipList();
      return;
    }
    const recallBtn = target.closest<HTMLButtonElement>('button[data-recall]');
    if (recallBtn) {
      game.recallShip(Number(recallBtn.dataset.recall));
      updateShipHint('Ship recalled — it will dock once it reaches harbor.');
      renderShipList();
    }
  });

  function renderShipList() {
    const game = ctx.game;
    if (!game) return;
    const playerShips = game.playerShips();
    const fleetLabel = document.querySelector('#fleet-label');
    if (fleetLabel) fleetLabel.textContent = `Fleet ${playerShips.length}/${game.maxShips()}`;
    renderShipBuildRow();
    if (playerShips.length === 0) {
      shipListEl.innerHTML = '<span class="hint">No ships yet — build one above.</span>';
      return;
    }
    shipListEl.innerHTML = playerShips
      .map((s) => {
        const name = SHIP_CLASSES[s.shipClass].name;
        if (s.state === 'building') {
          return `<button class="ship-chip" disabled>⛵ ${name} · Building (${Math.ceil(s.buildTimeLeft)}s)</button>`;
        }
        if (s.state === 'docked') {
          const selected = s.id === game.selectedShipId ? ' selected' : '';
          return `<button class="ship-chip${selected}" data-ship="${s.id}">⛵ ${name} · Docked</button>`;
        }
        const label =
          s.purpose === 'colonize' ? 'Colonising' : s.state === 'outbound' ? 'On route' : 'Returning';
        const recallTag = s.recalled ? ' (recalling)' : '';
        return `<button class="ship-chip sailing" data-recall="${s.id}">⛵ ${name} · ${label}${recallTag} ↩</button>`;
      })
      .join('');
  }

  function renderHud() {
    const game = ctx.game;
    if (!game) return;
    const prod = game.buildingProductionPerSec();
    const hud = document.querySelector<HTMLDivElement>('#hud-top');
    if (!hud) return;
    const keys: ResourceKey[] = ['wood', 'stone', 'fish', 'fur', 'coins'];
    const resHtml = keys
      .map((k) => {
        const rate = prod[k];
        const rateTxt = rate > 0.05 ? `<small>+${rate.toFixed(1)}/s</small>` : '';
        return `<div class="resource">${RES_ICON[k]} <span id="res-${k}">${Math.floor(
          game.resources[k]
        )}</span>${rateTxt}</div>`;
      })
      .join('');
    hud.innerHTML = `
      ${resHtml}
      <div class="timer" id="timer">${fmtTime(game.timeLeft)}</div>
      <button class="btn ghost small" id="quit-btn">Quit</button>
    `;
    hud.querySelector('#quit-btn')?.addEventListener('click', () => {
      ctx.game = null;
      ctx.screen = 'start';
      renderApp();
    });
  }

  function renderObjectiveBar() {
    const game = ctx.game;
    const bar = document.querySelector<HTMLDivElement>('#objective-bar');
    if (!game || !bar) return;
    if (!game.mission) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    const cur = game.objectiveCurrent();
    const target = game.objectiveTarget();
    const pct = Math.min(100, Math.round((cur / target) * 100));
    bar.innerHTML = `
      <div class="objective-text">
        <strong>${game.mission.title}</strong> — ${objectiveText(game.mission.objective)}
        <span class="objective-count">${cur} / ${target}</span>
      </div>
      <div class="objective-track"><div class="objective-fill" style="width:${pct}%"></div></div>
    `;
  }

  renderHud();
  renderObjectiveBar();
  renderBuildPanel();
  renderShipList();
  updateShipHint();

  let lastTime = performance.now();
  let rafId = 0;
  let hudAccumulator = 0;

  function loop(now: number) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    const game = ctx.game;
    if (!game || ctx.screen !== 'playing') return;

    game.tick(dt);
    render(ctx2d, game, now / 1000, hoveredIslandId, hoveredFishId);

    // light per-frame HUD numbers
    const keys: ResourceKey[] = ['wood', 'stone', 'fish', 'fur', 'coins'];
    for (const k of keys) {
      const el = document.querySelector(`#res-${k}`);
      if (el) el.textContent = Math.floor(game.resources[k]).toString();
    }
    const timerEl = document.querySelector('#timer');
    if (timerEl) {
      timerEl.textContent = fmtTime(game.timeLeft);
      timerEl.classList.toggle('urgent', game.timeLeft <= 20);
    }
    const toastEl = document.querySelector<HTMLDivElement>('#toast');
    if (toastEl) {
      toastEl.textContent = game.toast?.text ?? '';
      toastEl.classList.toggle('visible', !!game.toast);
    }

    hudAccumulator += dt;
    if (hudAccumulator >= 0.25) {
      hudAccumulator = 0;
      renderHud();
      renderObjectiveBar();
      renderBuildPanel();
      renderShipList();
      if (menuTarget) renderMenu();
    }

    if (game.status === 'ended') {
      cancelAnimationFrame(rafId);
      void finishRound();
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);
  void ROUND_SECONDS;
}

void refreshProfile().then(renderApp);
