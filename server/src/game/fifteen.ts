export type FifteenBoard = number[];

export interface FifteenVerificationResult {
  valid: boolean;
  reason?: string;
}

const BOARD_SIZE = 4;
const TILE_COUNT = BOARD_SIZE * BOARD_SIZE;
const SOLVED_BOARD: FifteenBoard = [
  1, 2, 3, 4,
  5, 6, 7, 8,
  9, 10, 11, 12,
  13, 14, 15, 0,
];

export function getSolvedFifteenBoard(): FifteenBoard {
  return [...SOLVED_BOARD];
}

export function isFifteenSolved(board: FifteenBoard): boolean {
  return board.length === TILE_COUNT && board.every((tile, index) => tile === SOLVED_BOARD[index]);
}

export function generateFifteenBoard(scrambleMoves: number): FifteenBoard {
  const board = getSolvedFifteenBoard();
  let previousEmptyIndex: number | null = null;

  for (let i = 0; i < scrambleMoves; i++) {
    const emptyIndex = board.indexOf(0);
    const legalMoves = getAdjacentIndexes(emptyIndex).filter((index) => index !== previousEmptyIndex);
    const choices = legalMoves.length > 0 ? legalMoves : getAdjacentIndexes(emptyIndex);
    const moveIndex = choices[Math.floor(Math.random() * choices.length)]!;
    previousEmptyIndex = emptyIndex;
    swap(board, emptyIndex, moveIndex);
  }

  if (isFifteenSolved(board)) {
    const emptyIndex = board.indexOf(0);
    const moveIndex = getAdjacentIndexes(emptyIndex)[0]!;
    swap(board, emptyIndex, moveIndex);
  }

  return board;
}

export function decodePackedFifteenMoves(
  movesBase64: string,
  moveCount: number,
): number[] {
  if (!Number.isInteger(moveCount) || moveCount < 0) {
    throw new Error('Invalid move count');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(movesBase64)) {
    throw new Error('Invalid move encoding');
  }

  const bytes = Buffer.from(movesBase64, 'base64');
  if (moveCount > bytes.length * 2) {
    throw new Error('Move count exceeds encoded move data');
  }

  const moves: number[] = [];
  for (let i = 0; i < moveCount; i++) {
    const byte = bytes[Math.floor(i / 2)]!;
    const move = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
    moves.push(move);
  }
  return moves;
}

export function verifyFifteenSolve(
  initialBoard: FifteenBoard,
  moves: number[],
): FifteenVerificationResult {
  if (!isValidBoard(initialBoard)) {
    return { valid: false, reason: 'Invalid initial board' };
  }

  const board = [...initialBoard];
  for (const moveIndex of moves) {
    if (!Number.isInteger(moveIndex) || moveIndex < 0 || moveIndex >= TILE_COUNT) {
      return { valid: false, reason: 'Move index out of range' };
    }

    const emptyIndex = board.indexOf(0);
    if (!areAdjacent(emptyIndex, moveIndex)) {
      return { valid: false, reason: 'Illegal tile move' };
    }

    swap(board, emptyIndex, moveIndex);
  }

  if (!isFifteenSolved(board)) {
    return { valid: false, reason: 'Moves do not solve the puzzle' };
  }

  return { valid: true };
}

function isValidBoard(board: FifteenBoard): boolean {
  if (board.length !== TILE_COUNT) return false;
  const sorted = [...board].sort((a, b) => a - b);
  return sorted.every((tile, index) => tile === index);
}

function getAdjacentIndexes(index: number): number[] {
  const row = Math.floor(index / BOARD_SIZE);
  const col = index % BOARD_SIZE;
  const adjacent: number[] = [];

  if (row > 0) adjacent.push(index - BOARD_SIZE);
  if (row < BOARD_SIZE - 1) adjacent.push(index + BOARD_SIZE);
  if (col > 0) adjacent.push(index - 1);
  if (col < BOARD_SIZE - 1) adjacent.push(index + 1);

  return adjacent;
}

function areAdjacent(a: number, b: number): boolean {
  return getAdjacentIndexes(a).includes(b);
}

function swap(board: FifteenBoard, a: number, b: number): void {
  const tile = board[a]!;
  board[a] = board[b]!;
  board[b] = tile;
}
