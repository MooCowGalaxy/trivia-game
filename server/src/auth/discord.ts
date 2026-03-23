import { Router } from "express";
import jwt from "jsonwebtoken";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = Router();

const DISCORD_AUTH_URL = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USER_URL = "https://discord.com/api/users/@me";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const isDevMode = process.env.DEV_MODE === "true";

/**
 * GET /auth/dev?username=Player1&host=true
 * Dev-only route: creates a fake JWT without Discord OAuth.
 */
router.get("/dev", (req, res) => {
  if (!isDevMode) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const username = typeof req.query.username === "string" ? req.query.username.trim() : "";
  if (!username) {
    res.status(400).json({ error: "Missing username query parameter" });
    return;
  }

  const isHost = req.query.host === "true";
  const jwtSecret = getEnv("JWT_SECRET");

  // Generate a deterministic fake discord ID from the username
  const discordId = `dev_${username.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
  const avatarUrl = `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(username)}`;

  const payload = {
    discordId,
    username,
    avatarUrl,
    isHost,
  };

  const token = jwt.sign(payload, jwtSecret, { expiresIn: "24h" });

  // Return JSON so each tab can store the token in sessionStorage (per-tab)
  res.json({ token, user: payload });
});

/**
 * GET /auth/discord
 * Redirects to Discord OAuth2 authorization page.
 */
router.get("/discord", (_req, res) => {
  const params = new URLSearchParams({
    client_id: getEnv("DISCORD_CLIENT_ID"),
    redirect_uri: getEnv("DISCORD_REDIRECT_URI"),
    response_type: "code",
    scope: "identify",
  });

  res.redirect(`${DISCORD_AUTH_URL}?${params.toString()}`);
});

/**
 * GET /auth/discord/callback
 * Handles the OAuth2 callback: exchanges code for token, fetches user, creates JWT.
 */
router.get("/discord/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (typeof code !== "string" || !code) {
      res.status(400).json({ error: "Missing authorization code" });
      return;
    }

    const clientId = getEnv("DISCORD_CLIENT_ID");
    const clientSecret = getEnv("DISCORD_CLIENT_SECRET");
    const redirectUri = getEnv("DISCORD_REDIRECT_URI");
    const jwtSecret = getEnv("JWT_SECRET");

    // Exchange authorization code for access token
    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Discord token exchange failed:", errorText);
      res.status(502).json({ error: "Failed to exchange authorization code" });
      return;
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };
    const accessToken = tokenData.access_token;

    // Fetch user profile from Discord
    const userResponse = await fetch(DISCORD_USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error("Discord user fetch failed:", errorText);
      res.status(502).json({ error: "Failed to fetch Discord user profile" });
      return;
    }

    const discordUser = (await userResponse.json()) as {
      id: string;
      username: string;
      avatar: string | null;
    };

    // Build avatar URL
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    // Determine if user is the game host
    const isHost = discordUser.id === process.env.HOST_DISCORD_ID;

    // Create JWT
    const payload = {
      discordId: discordUser.id,
      username: discordUser.username,
      avatarUrl,
      isHost,
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: "24h" });

    // Set httpOnly cookie and redirect to frontend
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours in ms
      sameSite: "lax",
      path: "/",
    });

    res.redirect("/");
  } catch (error) {
    console.error("Discord OAuth callback error:", error);
    res.status(500).json({ error: "Internal server error during authentication" });
  }
});

/**
 * GET /auth/me
 * Returns the current user info from the JWT cookie, or 401 if not authenticated.
 */
router.get("/me", (req, res) => {
  try {
    let token: string | undefined;

    // Check Authorization header first (used by dev mode per-tab auth)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }

    // Fall back to cookie-based auth
    if (!token) {
      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        for (const pair of cookieHeader.split(";")) {
          const eqIndex = pair.indexOf("=");
          if (eqIndex === -1) continue;
          const key = pair.slice(0, eqIndex).trim();
          const value = pair.slice(eqIndex + 1).trim();
          if (key === "token") {
            token = decodeURIComponent(value);
            break;
          }
        }
      }
    }

    if (!token) {
      res.status(401).json({ error: "Not authenticated", devMode: isDevMode });
      return;
    }

    const payload = verifyToken(token);
    res.json({ ...payload, devMode: isDevMode });
  } catch {
    res.status(401).json({ error: "Not authenticated", devMode: isDevMode });
  }
});

/**
 * GET /auth/logout
 * Clears the token cookie and redirects to the frontend.
 */
router.get("/logout", (_req, res) => {
  res.clearCookie("token", { path: "/" });
  res.redirect("/");
});

export default router;
