import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { signToken, requireAuth } from './auth.js';

const app = express();
const PORT = process.env.PORT || 8787;
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: ORIGIN }));
app.use(express.json());

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function getProfile(userId) {
  let profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!profile) {
    db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(userId);
    profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  }
  return profile;
}

app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3-20 characters: letters, numbers, underscores only.',
    });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, passwordHash);
  const user = { id: info.lastInsertRowid, username };
  getProfile(user.id);

  const token = signToken(user);
  res.status(201).json({ token, user: { id: user.id, username } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.get('/api/me', requireAuth, (req, res) => {
  const profile = getProfile(req.userId);
  res.json({
    user: { id: req.userId, username: req.username },
    profile: {
      gold: profile.gold,
      bestScore: profile.best_score,
      roundsPlayed: profile.rounds_played,
      islandsClaimedTotal: profile.islands_claimed_total,
    },
  });
});

app.post('/api/runs', requireAuth, (req, res) => {
  const { score, islandsClaimed, shipsBuilt, goldEarned, durationSeconds } = req.body || {};
  const fields = { score, islandsClaimed, shipsBuilt, goldEarned, durationSeconds };
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return res.status(400).json({ error: `Invalid value for ${key}.` });
    }
  }
  if (durationSeconds > 200) {
    return res.status(400).json({ error: 'Run duration exceeds round limit.' });
  }

  db.prepare(
    `INSERT INTO runs (user_id, score, islands_claimed, ships_built, gold_earned, duration_seconds)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.userId, score, islandsClaimed, shipsBuilt, goldEarned, durationSeconds);

  const profile = getProfile(req.userId);
  const newBest = Math.max(profile.best_score, score);
  db.prepare(
    `UPDATE profiles SET
       gold = gold + ?,
       best_score = ?,
       rounds_played = rounds_played + 1,
       islands_claimed_total = islands_claimed_total + ?,
       updated_at = datetime('now')
     WHERE user_id = ?`
  ).run(goldEarned, newBest, islandsClaimed, req.userId);

  res.status(201).json({ profile: getProfile(req.userId) });
});

app.get('/api/leaderboard', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.username AS username, p.best_score AS bestScore, p.rounds_played AS roundsPlayed
       FROM profiles p JOIN users u ON u.id = p.user_id
       ORDER BY p.best_score DESC
       LIMIT 20`
    )
    .all();
  res.json({ leaderboard: rows });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Frostmere Isles API listening on port ${PORT}`);
});
