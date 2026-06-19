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

- You start with a home island producing a trickle of Wood, Iron, and Food.
- Upgrade the Sawmill, Mine, and Farm to increase production, and the
  Shipyard to support more ships at once.
- Build ships (cost Wood + Iron), then send them to neutral islands —
  each successful voyage costs Food and adds goodwill; small islands need
  one trip, larger ones need two or three before they ally with you.
- Two rival lords are doing the same thing from their own islands — they
  don't attack you, but they will out-ally you for nearby islands if you're
  too slow.
- The round ends after 3 minutes. Your score is based on islands allied,
  ships built, and resources banked. If you're logged in, it's saved to
  your profile and the leaderboard.
