import type { RunSummary } from './game/types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
const TOKEN_KEY = 'frostmere_token';

export interface AuthUser {
  id: number;
  username: string;
}

export interface Profile {
  gold: number;
  bestScore: number;
  roundsPlayed: number;
  islandsClaimedTotal: number;
}

export interface LeaderboardEntry {
  username: string;
  bestScore: number;
  roundsPlayed: number;
}

class ApiError extends Error {}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.error || `Request failed (${res.status})`);
  }
  return body as T;
}

export async function register(username: string, password: string) {
  const data = await request<{ token: string; user: AuthUser }>('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  return data.user;
}

export async function login(username: string, password: string) {
  const data = await request<{ token: string; user: AuthUser }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  return data.user;
}

export function logout() {
  setToken(null);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export async function fetchMe(): Promise<{ user: AuthUser; profile: Profile } | null> {
  if (!getToken()) return null;
  try {
    return await request('/api/me');
  } catch {
    setToken(null);
    return null;
  }
}

export async function submitRun(summary: RunSummary): Promise<{ profile: Profile } | null> {
  if (!getToken()) return null;
  return request('/api/runs', { method: 'POST', body: JSON.stringify(summary) });
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const data = await request<{ leaderboard: LeaderboardEntry[] }>('/api/leaderboard');
  return data.leaderboard;
}

export { ApiError };
