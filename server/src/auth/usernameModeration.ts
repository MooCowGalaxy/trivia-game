type UsernameModerationDecision = 'ALLOW' | 'REMOVE';

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: 'user';
    content: string;
  }>;
  max_tokens: number;
  temperature?: number;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-5.4-nano';
const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_MAX_TOKENS = 16;

const moderationCache = new Map<string, UsernameModerationDecision>();

function isModerationEnabled(): boolean {
  return process.env.USERNAME_MODERATION_ENABLED !== 'false' && !!process.env.OPENROUTER_API_KEY;
}

function getModerationModel(): string {
  return (
    process.env.OPENROUTER_USERNAME_MODERATION_MODEL ??
    process.env.OPENROUTER_MODEL ??
    DEFAULT_MODEL
  );
}

function getTimeoutMs(): number {
  const parsed = Number.parseInt(
    process.env.USERNAME_MODERATION_TIMEOUT_MS ?? '',
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function getMaxTokens(): number {
  const parsed = Number.parseInt(
    process.env.USERNAME_MODERATION_MAX_TOKENS ?? '',
    10,
  );
  return Number.isFinite(parsed) && parsed >= 16 ? parsed : DEFAULT_MAX_TOKENS;
}

function getTemperature(): number | null {
  const raw = process.env.USERNAME_MODERATION_TEMPERATURE;
  if (raw === undefined || raw.trim() === '') {
    return null;
  }

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildRequestBody(normalizedUsername: string): OpenRouterRequest {
  const temperature = getTemperature();
  return {
    model: getModerationModel(),
    messages: [
      {
        role: 'user',
        content: buildPrompt(normalizedUsername),
      },
    ],
    max_tokens: getMaxTokens(),
    ...(temperature !== null ? { temperature } : {}),
  };
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.length > 500 ? `${text.slice(0, 500)}...` : text;
  } catch {
    return '<unable to read response body>';
  }
}

function buildPrompt(username: string): string {
  return [
    'Classify this single username for a general mature audience.',
    '',
    'Return only ALLOW or REMOVE.',
    '',
    'Remove only if the username is blatantly inappropriate, hateful, harassing, sexually explicit, or contains obvious derogatory language. If uncertain, return ALLOW.',
    '',
    `Username: ${JSON.stringify(username)}`,
  ].join('\n');
}

function parseDecision(content: string | undefined): UsernameModerationDecision | null {
  const normalized = content?.trim().toUpperCase();
  if (normalized === 'ALLOW' || normalized === 'REMOVE') {
    return normalized;
  }
  return null;
}

export async function classifyUsername(
  normalizedUsername: string,
): Promise<UsernameModerationDecision> {
  const cached = moderationCache.get(normalizedUsername);
  if (cached) return cached;

  if (!isModerationEnabled()) {
    return 'ALLOW';
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return 'ALLOW';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000',
        'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'Trivia Game',
      },
      body: JSON.stringify(buildRequestBody(normalizedUsername)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await readResponseBody(response);
      console.warn(
        `Username moderation failed: ${response.status} ${response.statusText}: ${body}`,
      );
      return 'ALLOW';
    }

    const data = (await response.json()) as OpenRouterResponse;
    const decision = parseDecision(data.choices?.[0]?.message?.content);

    if (!decision) {
      console.warn('Username moderation returned an invalid decision');
      return 'ALLOW';
    }

    moderationCache.set(normalizedUsername, decision);
    return decision;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Username moderation unavailable: ${message}`);
    return 'ALLOW';
  } finally {
    clearTimeout(timeout);
  }
}
