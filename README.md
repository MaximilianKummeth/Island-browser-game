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

## How a round works

- You start on a home island producing a trickle of Wood, Iron, and Food.
  Each building's roof colour on the map reflects its level, so you can read
  your town's development at a glance.
- Upgrade the **Sawmill, Mine, and Farm** to raise production, and the
  **Shipyard** to support more ships and unlock bigger hulls.
- Build ships in three sizes — **Skiff** (cheap, fast, weak), **Galley**, and
  **Galleon** (slow, expensive, allies a large isle in one trip). The
  Shipyard level gates the larger classes.
- Send a ship to a **neutral island** to build an alliance (small isles need
  one visit, larger ones two or three; voyages cost Food), or to a **fish
  shoal** in open water to net Food and bring it home.
- The snowy **fur island** up north is a prize target: ally it and it yields
  a steady stream of Fur, which is worth a lot of points.
- Allied villages add to your production, so expanding pays off twice.
- Two rival lords are doing the same from their own islands — they don't
  attack you, but they will out-ally you for nearby isles if you're too slow.
- The round ends after 3 minutes. Your score rewards islands allied, fur
  gathered, ships built, and resources banked. If you're logged in, it's
  saved to your profile and the leaderboard.
