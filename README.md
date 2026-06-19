# Frostmere Isles

A browser game inspired by the old *Sea Empire: Winter Lords* mobile game —
peaceful naval strategy, not combat. Each round is a short (~3 minute) match:
gather wood, iron, and food, build up your home island, build ships, and
sail them out to win neutral islands over to your side before two rival
lords claim them first.

## Project layout

- `client/` — the game itself. Vite + TypeScript, rendered on an HTML5
  Canvas. No build framework beyond Vite; game logic lives in `src/game/`.
- `server/` — a small Express + SQLite API for accounts: register/login,
  saving best scores, and a leaderboard.

## Running locally

### Server (accounts + leaderboard API)

```bash
cd server
npm install
cp .env.example .env   # then edit JWT_SECRET to a random string
npm run dev             # http://localhost:8787
```

### Client (the game)

```bash
cd client
npm install
npm run dev             # http://localhost:5173
```

Open `http://localhost:5173` in a browser. You can play immediately as a
guest — scores only save if you register/log in (top right of the start
screen).

## Game modes

- **Free Play** — a 3-minute open round; build the highest score you can.
- **Missions** — 28 timed challenges with a single objective each (hold or
  gather a resource, colonise islands, build ships, or raise a building to a
  level). Pick **Easy / Medium / Hard** — the *only* difference between them
  is how much time you get (hard is the base clock, medium ×1.5, easy ×2).
  Completing a mission marks it done for that difficulty (saved in your
  browser). Mission objectives and time budgets were tuned with the
  simulation playtest in `client/scripts/playtest.ts`, which auto-plays every
  mission to confirm each one is winnable on all three difficulties.

## How a round works

- You start on a home island producing a trickle of Wood, Stone, Fish and
  Coins. Each building's roof colour on the map reflects its level, so you can
  read your town's development at a glance.
- Five buildings to upgrade on your home isle: **Fishermen** (more Fish),
  **Workshop** (boosts all home production), **Market** (mints the Coins you
  need to found colonies), **Shipyard** (more ship slots, unlocks bigger
  hulls), and **Fortress** — whose walls ring the whole town and which grants
  extra ship slots.
- Build ships in three sizes — **Skiff** (cheap, fast), **Galley**, and
  **Galleon** (slow, expensive). Only the **Galleon** can colonise islands.
  The Shipyard level gates the larger classes. Ships always launch and dock
  just offshore — never sitting on the island itself.
- **Click any island or fish shoal** to open its menu. It shows exactly what
  the isle produces — each animal/work crew and its rate per second — plus
  how much it has stockpiled.
- **Colonising:** send a Galleon to a free, colonisable island and spend
  Coins to plant a colony. A colony then pays its producers' output straight
  into your stores, no ships required. You need a Galleon to do this at all.
- **Harvesting:** send any ship on a standing route to a shoal or a wild isle
  to keep ferrying its stockpile home. Voyages cost a little Fish to launch.
- **Special isles** — the snowy **Fur** isle, the **Stone** isle, and the
  **Wood** isle — can never be colonised by anyone. They sit neutral forever,
  produce far more than ordinary isles, and bank a deep stockpile. Keep
  harvest routes running to them to reap the rewards.
- Wild islands and shoals refill their stockpile up to a cap and then stop —
  they only regenerate once a fleet has drawn them back down.
- Two rival lords sail their own galleons out to colonise nearby isles. They
  don't attack you, but they will claim free islands if you're too slow.
- The round ends after 3 minutes. Your score rewards islands colonised, fur
  gathered, ships built, and resources banked. If you're logged in, it's
  saved to your profile and the leaderboard.
