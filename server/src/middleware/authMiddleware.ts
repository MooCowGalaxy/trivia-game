import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import type { Socket } from "socket.io";

export interface JwtPayload {
  discordId: string;
  username: string;
  avatarUrl: string;
  isHost: boolean;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

/**
 * Parse cookies from a Cookie header string into a key-value map.
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) continue;
    const key = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  }
  return cookies;
}

/**
 * Verify a JWT token string and return the decoded payload.
 */
export function verifyToken(token: string): JwtPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret);
  // jwt.verify returns string | JwtPayload — we always sign objects so cast appropriately
  return decoded as unknown as JwtPayload;
}

/**
 * Express middleware that authenticates requests using a JWT in the `token` cookie.
 * Attaches the decoded payload to `req.user`.
 */
export function authenticateRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const cookies = parseCookies(cookieHeader);
    const token = cookies["token"];
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Socket.io middleware that authenticates socket connections.
 * Reads JWT from `auth.token` on the handshake or from cookies in the handshake headers.
 * Attaches user data to `socket.data.user`.
 */
export function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void,
): void {
  try {
    // Try auth.token from handshake first
    let token: string | undefined =
      (socket.handshake.auth as Record<string, unknown>)?.token as
        | string
        | undefined;

    // Fall back to cookie in handshake headers
    if (!token) {
      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        const cookies = parseCookies(cookieHeader);
        token = cookies["token"];
      }
    }

    if (!token) {
      next(new Error("Authentication required"));
      return;
    }

    const payload = verifyToken(token);
    socket.data.user = payload;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
}
