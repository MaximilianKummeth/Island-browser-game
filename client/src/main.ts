import './style.css';
import { GameState, ROUND_SECONDS } from './game/state';
import { WORLD_WIDTH, WORLD_HEIGHT } from './game/mapgen';
import { render } from './game/render';
import type { Island, Buildings } from './game/types';
import * as api from './api';
import type { AuthUser, Profile } from './api';

const app = document.querySelector<HTMLDivElement>('#app')!;

type Screen = 'start' | 'auth' | 'playing' | 'summary' | 'leaderboard';

interface AppCtx {
  screen: Screen;
  user: AuthUser | null;
  profile: Profile | null;
  game: GameState | null;
  authMode: 'login' | 'register';
  authError: string | null;
  submitting: boolean;
}

const ctx: AppCtx = {
  screen: 'start',
  user: null,
  profile: null,
  game: null,
  authMode: 'login',
  authError: null,
  submitting: false,
};

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function buildingLabel(key: keyof Buildings): string {
  return { sawmill: 'Sawmill', mine: 'Mine', farm: 'Farm', shipyard: 'Shipyard' }[key];
}

function costText(cost: Partial<Record<'wood' | 'iron' | 'food', number>>): string {
  return Object.entries(cost)
    .map(([k, v]) => `${Math.ceil(v as number)} ${k}`)
    .join(', ');
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
}

function renderStart() {
  app.innerHTML = `
    <div class="screen start-screen">
      <h1 class="title">Frostmere Isles</h1>
      <p class="subtitle">Gather resources, win allies, and chart your fleet across the frozen archipelago — each voyage lasts just three minutes.</p>
      <div class="account-row">
        ${
          ctx.user
            ? `<span class="welcome">Sailing as <strong>${ctx.user.username}</strong> · Best score: ${ctx.profile?.bestScore ?? 0}</span>
               <button class="btn ghost" id="logout-btn">Log out</button>`
            : `<button class="btn ghost" id="login-open-btn">Log in / Register</button>`
        }
      </div>
      <div class="menu-actions">
        <button class="btn primary" id="play-btn">Set Sail (Play Round)</button>
        <button class="btn ghost" id="leaderboard-btn">Leaderboard</button>
      </div>
      <p class="hint">No account needed to play — log in to save your best scores.</p>
    </div>
  `;
  document.querySelector('#play-btn')?.addEventListener('click', startRound);
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

function renderSummary() {
  if (!ctx.game) return;
  const summary = ctx.game.computeSummary();
  app.innerHTML = `
    <div class="screen summary-screen">
      <h2>Voyage Complete</h2>
      <div class="summary-grid">
        <div><span>Islands Allied</span><strong>${summary.islandsClaimed}</strong></div>
        <div><span>Ships Built</span><strong>${summary.shipsBuilt}</strong></div>
        <div><span>Gold Earned</span><strong>${summary.goldEarned}</strong></div>
        <div><span>Final Score</span><strong>${summary.score}</strong></div>
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

function startRound() {
  ctx.game = new GameState();
  ctx.screen = 'playing';
  renderApp();
}

async function finishRound() {
  if (!ctx.game) return;
  const summary = ctx.game.computeSummary();
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

function renderPlaying() {
  app.innerHTML = `
    <div class="screen play-screen">
      <div class="hud-top">
        <div class="resource" title="Wood">🪵 <span id="res-wood">0</span></div>
        <div class="resource" title="Iron">⛏️ <span id="res-iron">0</span></div>
        <div class="resource" title="Food">🐟 <span id="res-food">0</span></div>
        <div class="timer" id="timer">3:00</div>
        <button class="btn ghost small" id="quit-btn">Quit</button>
      </div>
      <div class="canvas-wrap">
        <canvas id="game-canvas"></canvas>
        <div class="toast" id="toast"></div>
      </div>
      <div class="hud-bottom">
        <div class="panel build-panel" id="build-panel"></div>
        <div class="panel ship-panel" id="ship-panel">
          <div class="ship-panel-header">
            <span>Fleet</span>
            <button class="btn small primary" id="build-ship-btn">Build Ship</button>
          </div>
          <div class="ship-list" id="ship-list"></div>
          <p class="hint" id="ship-hint">Select a docked ship, then click a neutral isle to sail.</p>
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

  document.querySelector('#quit-btn')?.addEventListener('click', () => {
    ctx.game = null;
    ctx.screen = 'start';
    renderApp();
  });
  document.querySelector('#build-ship-btn')?.addEventListener('click', () => {
    if (ctx.game?.buildShip()) renderShipList();
  });

  let hoveredIslandId: number | null = null;

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

  canvas.addEventListener('mousemove', (e) => {
    const { x, y } = toWorld(e.clientX, e.clientY);
    hoveredIslandId = islandAt(x, y)?.id ?? null;
  });

  canvas.addEventListener('click', (e) => {
    const game = ctx.game;
    if (!game) return;
    const { x, y } = toWorld(e.clientX, e.clientY);
    const island = islandAt(x, y);
    if (!island) return;

    if (island.isHome && island.owner === 'player') {
      const idle = game.ships.find((s) => s.state === 'docked');
      game.selectShip(idle ? idle.id : null);
      updateShipHint();
      return;
    }
    if (island.owner === 'neutral' && game.selectedShipId !== null) {
      const ok = game.sendSelectedShipTo(island.id);
      updateShipHint(ok ? null : 'Could not start that voyage.');
    }
  });

  function updateShipHint(message?: string | null) {
    const hint = document.querySelector('#ship-hint');
    if (!hint) return;
    if (message) {
      hint.textContent = message;
      return;
    }
    const game = ctx.game;
    hint.textContent =
      game && game.selectedShipId !== null
        ? 'Ship selected — click a neutral isle to sail.'
        : 'Select a docked ship, then click a neutral isle to sail.';
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
    const keys: (keyof Buildings)[] = ['sawmill', 'mine', 'farm', 'shipyard'];
    buildPanelEl.innerHTML = keys
      .map((key) => {
        const level = game.buildings[key];
        const cost = game.upgradeCost(key);
        const affordable = cost ? game.canAfford(cost) : false;
        return `
          <div class="build-row">
            <span class="build-name">${buildingLabel(key)} <em>Lv ${level}</em></span>
            <button class="btn small" data-key="${key}" ${!cost || !affordable ? 'disabled' : ''}>
              ${cost ? `Upgrade (${costText(cost)})` : 'Maxed'}
            </button>
          </div>
        `;
      })
      .join('');
  }

  const shipListEl = document.querySelector<HTMLDivElement>('#ship-list')!;
  shipListEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-ship]');
    const game = ctx.game;
    if (!btn || !game) return;
    game.selectShip(Number(btn.dataset.ship));
    updateShipHint();
    renderShipList();
  });

  function renderShipList() {
    const game = ctx.game;
    const buildBtn = document.querySelector<HTMLButtonElement>('#build-ship-btn');
    if (!game) return;
    if (buildBtn) {
      buildBtn.disabled = game.ships.length >= game.maxShips() || !game.canAfford({ wood: 25, iron: 15 });
    }
    shipListEl.innerHTML = game.ships
      .map((s) => {
        const label =
          s.state === 'building'
            ? `Building (${Math.ceil(s.buildTimeLeft)}s)`
            : s.state === 'docked'
            ? 'Docked'
            : s.state === 'outbound'
            ? 'Sailing out'
            : 'Returning';
        const selected = s.id === game.selectedShipId ? ' selected' : '';
        return `<button class="ship-chip${selected}" data-ship="${s.id}" ${
          s.state !== 'docked' ? 'disabled' : ''
        }>⛵ ${label}</button>`;
      })
      .join('');
  }

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
    render(ctx2d, game, now / 1000, hoveredIslandId);

    const woodEl = document.querySelector('#res-wood');
    const ironEl = document.querySelector('#res-iron');
    const foodEl = document.querySelector('#res-food');
    const timerEl = document.querySelector('#timer');
    const toastEl = document.querySelector<HTMLDivElement>('#toast');
    if (woodEl) woodEl.textContent = Math.floor(game.resources.wood).toString();
    if (ironEl) ironEl.textContent = Math.floor(game.resources.iron).toString();
    if (foodEl) foodEl.textContent = Math.floor(game.resources.food).toString();
    if (timerEl) {
      timerEl.textContent = fmtTime(game.timeLeft);
      timerEl.classList.toggle('urgent', game.timeLeft <= 20);
    }
    if (toastEl) {
      toastEl.textContent = game.toast?.text ?? '';
      toastEl.classList.toggle('visible', !!game.toast);
    }

    hudAccumulator += dt;
    if (hudAccumulator >= 0.25) {
      hudAccumulator = 0;
      renderBuildPanel();
      renderShipList();
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
