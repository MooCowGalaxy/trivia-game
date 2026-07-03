import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { classifyUsername } from './usernameModeration.js';

export interface UsernameIdentity {
  discordId: string;
  username: string;
  normalizedUsername: string;
  avatarUrl: string;
  isHost?: boolean;
  isGuest?: boolean;
}

interface AuthRouterOptions {
  onHostLogin?: (playerId: string) => void;
  isUsernameInUse?: (normalizedUsername: string) => boolean;
}

type UsernameValidationResult =
  | { ok: true; username: string; normalizedUsername: string }
  | { ok: false; error: string };

const isDevMode = process.env.DEV_MODE === 'true';
const revokedPlayerIds = new Set<string>();
const bannedUsernames = new Set<string>();

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalHostCode(): string | null {
  return (
    process.env.HOST_LOGIN_CODE ??
    process.env.HOST_CODE ??
    process.env.GAME_HOST_CODE ??
    null
  );
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signIdentity(payload: UsernameIdentity): string {
  return jwt.sign(payload, getEnv('JWT_SECRET'), { expiresIn: '30d' });
}

function verifyIdentity(token: string): UsernameIdentity {
  const decoded = jwt.verify(token, getEnv('JWT_SECRET')) as UsernameIdentity;
  if (isPlayerIdentityRevoked(decoded.discordId)) {
    throw new Error('Identity has been revoked');
  }
  if (decoded.normalizedUsername && isDiscordUsernameBanned(decoded.normalizedUsername)) {
    throw new Error('Username has been blocked');
  }
  return decoded;
}

function parseBearerOrCookieToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  for (const pair of cookieHeader.split(';')) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) continue;
    const key = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (key === 'token') return decodeURIComponent(value);
  }

  return undefined;
}

function makeAvatarUrl(username: string): string {
  return `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(username)}`;
}

function makePlayerId(prefix = 'usr'): string {
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}

function normalizeLooseUsername(username: string): string {
  return username.trim().toLowerCase().replace(/[^a-z0-9._]/g, '_');
}

export function normalizeDiscordUsername(rawUsername: string): UsernameValidationResult {
  const trimmed = rawUsername.trim();

  if (!trimmed) {
    return { ok: false, error: 'Enter your Discord username.' };
  }

  if (trimmed.startsWith('@')) {
    return { ok: false, error: 'Enter your username without the @ symbol.' };
  }

  if (trimmed.includes('#')) {
    return {
      ok: false,
      error: 'Enter your current Discord username, not an old username#0000 tag.',
    };
  }

  const username = trimmed.toLowerCase();

  if (username.length < 2 || username.length > 32) {
    return {
      ok: false,
      error: 'Discord usernames must be 2 to 32 characters.',
    };
  }

  if (!/^[a-z0-9._]+$/.test(username)) {
    return {
      ok: false,
      error: 'Use only lowercase letters, numbers, periods, and underscores.',
    };
  }

  if (username.startsWith('.') || username.endsWith('.') || username.includes('..')) {
    return {
      ok: false,
      error: 'Discord usernames cannot start/end with a period or contain two periods in a row.',
    };
  }

  return { ok: true, username, normalizedUsername: username };
}

export function revokePlayerIdentity(playerId: string): void {
  revokedPlayerIds.add(playerId);
}

export function isPlayerIdentityRevoked(playerId: string): boolean {
  return revokedPlayerIds.has(playerId);
}

export function banDiscordUsername(username: string): string | null {
  const normalized = normalizeDiscordUsername(username);
  if (!normalized.ok) return null;
  bannedUsernames.add(normalized.normalizedUsername);
  return normalized.normalizedUsername;
}

export function isDiscordUsernameBanned(normalizedUsername: string): boolean {
  return bannedUsernames.has(normalizedUsername);
}

/**
 * Username-only auth. Players identify themselves by their Discord username,
 * then winners prove ownership later by sending their private code from Discord.
 */
export function createAuthRouter(options: AuthRouterOptions = {}): Router {
  const router = Router();

  router.post('/username', async (req, res) => {
    try {
      const body = req.body as { username?: unknown; hostCode?: unknown };
      const usernameInput = typeof body.username === 'string' ? body.username : '';
      const hostCodeInput = typeof body.hostCode === 'string' ? body.hostCode.trim() : '';
      const validation = normalizeDiscordUsername(usernameInput);

      if (!validation.ok) {
        res.status(400).json({ error: validation.error });
        return;
      }

      if (isDiscordUsernameBanned(validation.normalizedUsername)) {
        res.status(403).json({ error: 'That username has been blocked from this game.' });
        return;
      }

      if (options.isUsernameInUse?.(validation.normalizedUsername)) {
        res.status(409).json({ error: 'That username is already in the game.' });
        return;
      }

      const moderationDecision = await classifyUsername(validation.normalizedUsername);
      if (moderationDecision === 'REMOVE') {
        res.status(400).json({ error: 'Please choose a different username.' });
        return;
      }

      let isHost = false;
      if (hostCodeInput) {
        const hostCode = getOptionalHostCode();
        if (!hostCode) {
          res.status(500).json({ error: 'Host login is not configured.' });
          return;
        }
        if (!constantTimeEquals(hostCodeInput, hostCode)) {
          res.status(401).json({ error: 'Invalid host code.' });
          return;
        }
        isHost = true;
      }

      const payload: UsernameIdentity = {
        discordId: makePlayerId(),
        username: validation.username,
        normalizedUsername: validation.normalizedUsername,
        avatarUrl: makeAvatarUrl(validation.username),
        ...(isHost ? { isHost: true } : {}),
      };

      if (isHost) {
        options.onHostLogin?.(payload.discordId);
      }

      const token = signIdentity(payload);
      res.json({ token, user: payload });
    } catch (error) {
      console.error('Username auth error:', error);
      res.status(500).json({ error: 'Internal server error during authentication' });
    }
  });

  /**
   * GET /auth/dev?username=Player1&host=true
   * Dev-only route: creates a fake JWT without host-code checks.
   */
  router.get('/dev', (req, res) => {
    if (!isDevMode) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
    if (!username) {
      res.status(400).json({ error: 'Missing username query parameter' });
      return;
    }

    const normalizedUsername = normalizeLooseUsername(username);
    const discordId = `dev_${normalizedUsername}`;
    const payload: UsernameIdentity = {
      discordId,
      username,
      normalizedUsername,
      avatarUrl: makeAvatarUrl(username),
      ...(req.query.host === 'true' ? { isHost: true } : {}),
    };

    if (req.query.host === 'true') {
      options.onHostLogin?.(discordId);
    }

    const token = signIdentity(payload);
    res.json({ token, user: payload });
  });

  let guestCounter = 0;

  router.get('/guest', (_req, res) => {
    guestCounter++;
    const username = `Guest ${guestCounter}`;
    const payload: UsernameIdentity = {
      discordId: makePlayerId('guest'),
      username,
      normalizedUsername: `guest_${guestCounter}`,
      avatarUrl: makeAvatarUrl(username),
      isGuest: true,
    };

    const token = signIdentity(payload);
    res.json({ token, user: payload });
  });

  router.get('/discord', (_req, res) => {
    res.status(410).json({ error: 'Discord OAuth is disabled for this game.' });
  });

  router.get('/discord/callback', (_req, res) => {
    res.status(410).json({ error: 'Discord OAuth is disabled for this game.' });
  });

  router.get('/me', (req, res) => {
    try {
      const token = parseBearerOrCookieToken(req);
      if (!token) {
        res.status(401).json({ error: 'Not authenticated', devMode: isDevMode });
        return;
      }

      const payload = verifyIdentity(token);
      res.json({ ...payload, devMode: isDevMode });
    } catch {
      res.status(401).json({ error: 'Not authenticated', devMode: isDevMode });
    }
  });

  router.get('/logout', (_req, res) => {
    res.clearCookie('token', { path: '/' });
    res.redirect('/');
  });

  return router;
}
