import type { PlayerSubmission, SpeedMathPlayerState } from './types.js';

// ─── Standard Round Scoring ──────────────────────────────────────────────────
//
// Players who submitted the correct answer earn:
//   basePoints + floor(speedBonusMax * (1 - (rank - 1) / totalCorrect))
//
// where `rank` is determined by submission timestamp (earliest = rank 1).
// Incorrect answers score 0.

export function scoreStandardRound(
  submissions: PlayerSubmission[],
  correctAnswer: string | number,
  basePoints: number,
  speedBonusMax: number,
): Map<string, number> {
  const scores = new Map<string, number>();

  // Separate correct from incorrect
  const correct: PlayerSubmission[] = [];
  for (const sub of submissions) {
    if (isCorrect(sub.answer, correctAnswer)) {
      correct.push(sub);
    } else {
      scores.set(sub.playerId, 0);
    }
  }

  // Sort correct answers by timestamp (earliest first)
  correct.sort((a, b) => a.timestamp - b.timestamp);

  const totalCorrect = correct.length;
  for (let i = 0; i < correct.length; i++) {
    const sub = correct[i]!;
    const speedBonus =
      totalCorrect === 1
        ? speedBonusMax
        : Math.floor(speedBonusMax * (1 - i / (totalCorrect)));
    scores.set(sub.playerId, basePoints + speedBonus);
  }

  return scores;
}

// ─── Speed Math Scoring ──────────────────────────────────────────────────────
//
// Base component: floor(basePoints * (correctCount / totalQuestions))
// Completion bonus: players who finished all questions are ranked by
// completedAt timestamp and receive speed bonus using the same formula.

export function scoreSpeedMathRound(
  playerStates: Map<string, SpeedMathPlayerState>,
  basePoints: number,
  speedBonusMax: number,
  totalQuestions: number,
): Map<string, number> {
  const scores = new Map<string, number>();

  // Gather completers (all questions correct) for speed bonus
  const completers: { playerId: string; completedAt: number }[] = [];

  for (const [playerId, state] of playerStates) {
    const base = Math.floor(basePoints * (state.correctCount / totalQuestions));
    scores.set(playerId, base);

    if (state.completedAt !== null && state.correctCount === totalQuestions) {
      completers.push({ playerId, completedAt: state.completedAt });
    }
  }

  // Rank completers by time and award speed bonus
  completers.sort((a, b) => a.completedAt - b.completedAt);
  const totalCompleters = completers.length;

  for (let i = 0; i < completers.length; i++) {
    const { playerId } = completers[i]!;
    const speedBonus =
      totalCompleters === 1
        ? speedBonusMax
        : Math.floor(speedBonusMax * (1 - i / totalCompleters));
    const current = scores.get(playerId) ?? 0;
    scores.set(playerId, current + speedBonus);
  }

  return scores;
}

// ─── Fermi Estimation Scoring ────────────────────────────────────────────────
//
// Linear proximity: |playerAnswer - correctAnswer|
// Rank by distance (lower is better). Points are linearly scaled:
//   closest  → basePoints + speedBonusMax
//   farthest → 0
// Invalid / non-positive answers receive 0.

export function scoreFermiQuestion(
  submissions: PlayerSubmission[],
  correctAnswer: number,
  basePoints: number,
  speedBonusMax: number,
): Map<string, number> {
  const scores = new Map<string, number>();
  const maxPoints = basePoints + speedBonusMax;

  interface Ranked {
    playerId: string;
    distance: number;
  }

  const ranked: Ranked[] = [];

  for (const sub of submissions) {
    const numAnswer = typeof sub.answer === 'number' ? sub.answer : Number(sub.answer);
    if (Number.isNaN(numAnswer)) {
      scores.set(sub.playerId, 0);
      continue;
    }
    ranked.push({
      playerId: sub.playerId,
      distance: Math.abs(numAnswer - correctAnswer),
    });
  }

  // Sort by distance ascending (closest first)
  ranked.sort((a, b) => a.distance - b.distance);

  const n = ranked.length;
  for (let i = 0; i < n; i++) {
    const entry = ranked[i]!;
    const points = n === 1
      ? maxPoints
      : Math.floor(maxPoints * (1 - i / (n - 1)));
    scores.set(entry.playerId, points);
  }

  return scores;
}

// ─── Finale (Sudden Death) ───────────────────────────────────────────────────
//
// No points awarded. The first player to submit the correct answer (by
// timestamp) wins the question. Returns the winner's playerId or null if
// nobody answered correctly.

export function checkFinaleAnswer(
  submissions: PlayerSubmission[],
  correctAnswer: string | number,
): string | null {
  const correct = submissions
    .filter((s) => isCorrect(s.answer, correctAnswer))
    .sort((a, b) => a.timestamp - b.timestamp);

  return correct.length > 0 ? correct[0]!.playerId : null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isCorrect(
  playerAnswer: string | number,
  correctAnswer: string | number,
): boolean {
  // Normalise to strings for comparison
  const pa = String(playerAnswer).trim().toLowerCase();
  const ca = String(correctAnswer).trim().toLowerCase();
  return pa === ca;
}
