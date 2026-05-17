export interface PipeCoordinate {
  row: number;
  col: number;
}

export interface PipeTile {
  row: number;
  col: number;
  solvedMask: number;
  initialMask: number;
  initialRotation: number;
}

export interface PipeRotationGeneratorParams {
  rows: number;
  cols: number;
  terminalCount: number;
  minDeadEnds?: number;
  minBranches?: number;
  minMisrotatedTiles?: number;
  minRotationDistance?: number;
  maxAttempts?: number;
}

export interface PipeRotationStats {
  deadEndCount: number;
  branchCount: number;
  leafCount: number;
  misrotatedTileCount: number;
  rotationDistance: number;
  longestTerminalDistance: number;
  tileCounts: {
    deadEnd: number;
    straight: number;
    corner: number;
    tee: number;
    cross: number;
  };
}

export interface PipeRotationPuzzle {
  rows: number;
  cols: number;
  source: PipeCoordinate;
  terminals: PipeCoordinate[];
  tiles: PipeTile[];
  stats: PipeRotationStats;
}

export interface PipeRotationVerificationResult {
  valid: boolean;
  reason?: string;
}

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;
const DIRECTIONS = [
  { bit: NORTH, opposite: SOUTH, dr: -1, dc: 0 },
  { bit: EAST, opposite: WEST, dr: 0, dc: 1 },
  { bit: SOUTH, opposite: NORTH, dr: 1, dc: 0 },
  { bit: WEST, opposite: EAST, dr: 0, dc: -1 },
];

export function generatePipeRotationPuzzle(params: PipeRotationGeneratorParams): PipeRotationPuzzle {
  validateParams(params);

  const rows = params.rows;
  const cols = params.cols;
  const maxAttempts = params.maxAttempts ?? 300;
  const minDeadEnds = params.minDeadEnds ?? Math.max(2, params.terminalCount);
  const minBranches = params.minBranches ?? Math.max(1, Math.floor((rows * cols) / 12));
  const minMisrotatedTiles = params.minMisrotatedTiles ?? Math.floor(rows * cols * 0.55);
  const minRotationDistance = params.minRotationDistance ?? Math.floor(rows * cols * 0.7);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solvedMasks = generateSpanningTreeMasks(rows, cols);
    const leaves = getCellsWithDegree(solvedMasks, rows, cols, 1);
    if (leaves.length < params.terminalCount + 1 + minDeadEnds) continue;

    const source = leaves[Math.floor(Math.random() * leaves.length)]!;
    const terminals = chooseTerminalLeaves(solvedMasks, rows, cols, leaves, source, params.terminalCount);
    const terminalKeys = new Set(terminals.map(coordKey));
    const deadEndCount = leaves.filter((leaf) => !sameCoord(leaf, source) && !terminalKeys.has(coordKey(leaf))).length;
    if (deadEndCount < minDeadEnds) continue;

    const branchCount = countCellsWithMinimumDegree(solvedMasks, rows, cols, 3);
    if (branchCount < minBranches) continue;

    const tiles = createScrambledTiles(solvedMasks, rows, cols);
    const initialMasks = tiles.map((tile) => tile.initialMask);
    if (arePipeTerminalsConnected(rows, cols, source, terminals, initialMasks)) continue;

    const stats = buildStats(solvedMasks, rows, cols, source, terminals, tiles, deadEndCount, branchCount);
    if (stats.misrotatedTileCount < minMisrotatedTiles) continue;
    if (stats.rotationDistance < minRotationDistance) continue;

    return {
      rows,
      cols,
      source,
      terminals,
      tiles,
      stats,
    };
  }

  throw new Error(
    `Unable to generate Pipe Rotation puzzle for rows=${rows}, cols=${cols}, terminals=${params.terminalCount}`,
  );
}

export function rotatePipeMask(mask: number, clockwiseTurns: number): number {
  let normalized = ((clockwiseTurns % 4) + 4) % 4;
  let result = mask;
  while (normalized > 0) {
    result = rotateMaskClockwise(result);
    normalized--;
  }
  return result;
}

export function arePipeTerminalsConnected(
  rows: number,
  cols: number,
  source: PipeCoordinate,
  terminals: PipeCoordinate[],
  masks: number[],
): boolean {
  if (masks.length !== rows * cols) return false;
  const visited = new Set<string>();
  const queue = [source];
  visited.add(coordKey(source));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentMask = masks[toIndex(current.row, current.col, cols)]!;
    for (const direction of DIRECTIONS) {
      if ((currentMask & direction.bit) === 0) continue;
      const next = { row: current.row + direction.dr, col: current.col + direction.dc };
      if (!isInBounds(next, rows, cols)) continue;
      const nextMask = masks[toIndex(next.row, next.col, cols)]!;
      if ((nextMask & direction.opposite) === 0) continue;
      const key = coordKey(next);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push(next);
    }
  }

  return terminals.every((terminal) => visited.has(coordKey(terminal)));
}

export function verifyPipeRotationSolution(
  rows: number,
  cols: number,
  source: PipeCoordinate,
  terminals: PipeCoordinate[],
  masks: number[],
): PipeRotationVerificationResult {
  if (!Array.isArray(masks) || masks.length !== rows * cols) {
    return { valid: false, reason: 'Invalid pipe board shape' };
  }

  for (let index = 0; index < masks.length; index++) {
    const mask = masks[index]!;
    if (!Number.isInteger(mask) || mask < 1 || mask > 15) {
      return { valid: false, reason: 'Invalid pipe tile mask' };
    }
  }

  const reachable = getReachablePipeCells(rows, cols, source, masks);

  for (const terminal of terminals) {
    if (!reachable.has(coordKey(terminal))) {
      return { valid: false, reason: 'A terminal is not connected to the source' };
    }
  }

  return { valid: true };
}

function getReachablePipeCells(
  rows: number,
  cols: number,
  source: PipeCoordinate,
  masks: number[],
): Set<string> {
  const visited = new Set<string>();
  const queue = [source];
  visited.add(coordKey(source));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentMask = masks[toIndex(current.row, current.col, cols)]!;
    for (const direction of DIRECTIONS) {
      if ((currentMask & direction.bit) === 0) continue;
      const next = { row: current.row + direction.dr, col: current.col + direction.dc };
      if (!isInBounds(next, rows, cols)) continue;
      const nextMask = masks[toIndex(next.row, next.col, cols)]!;
      if ((nextMask & direction.opposite) === 0) continue;
      const key = coordKey(next);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push(next);
    }
  }

  return visited;
}

function validateParams(params: PipeRotationGeneratorParams): void {
  if (!Number.isInteger(params.rows) || params.rows < 3) {
    throw new Error('Pipe Rotation requires at least 3 rows');
  }
  if (!Number.isInteger(params.cols) || params.cols < 3) {
    throw new Error('Pipe Rotation requires at least 3 columns');
  }
  if (!Number.isInteger(params.terminalCount) || params.terminalCount < 1) {
    throw new Error('Pipe Rotation requires at least 1 terminal');
  }
  if (params.terminalCount + 1 > params.rows * params.cols) {
    throw new Error('Pipe Rotation has too many terminals for the board');
  }
}

function generateSpanningTreeMasks(rows: number, cols: number): number[] {
  const masks = Array<number>(rows * cols).fill(0);
  const visited = new Set<number>();
  const start = Math.floor(Math.random() * rows * cols);
  const frontier: Array<{ from: number; to: number; bit: number; opposite: number }> = [];

  visited.add(start);
  addFrontierEdges(start, rows, cols, visited, frontier);

  while (visited.size < rows * cols) {
    const edgeIndex = Math.floor(Math.random() * frontier.length);
    const edge = frontier.splice(edgeIndex, 1)[0]!;
    if (visited.has(edge.to)) continue;

    masks[edge.from] = masks[edge.from]! | edge.bit;
    masks[edge.to] = masks[edge.to]! | edge.opposite;
    visited.add(edge.to);
    addFrontierEdges(edge.to, rows, cols, visited, frontier);
  }

  return masks;
}

function addFrontierEdges(
  index: number,
  rows: number,
  cols: number,
  visited: Set<number>,
  frontier: Array<{ from: number; to: number; bit: number; opposite: number }>,
): void {
  const coord = fromIndex(index, cols);
  for (const direction of DIRECTIONS) {
    const next = { row: coord.row + direction.dr, col: coord.col + direction.dc };
    if (!isInBounds(next, rows, cols)) continue;
    const nextIndex = toIndex(next.row, next.col, cols);
    if (visited.has(nextIndex)) continue;
    frontier.push({
      from: index,
      to: nextIndex,
      bit: direction.bit,
      opposite: direction.opposite,
    });
  }
}

function chooseTerminalLeaves(
  masks: number[],
  rows: number,
  cols: number,
  leaves: PipeCoordinate[],
  source: PipeCoordinate,
  terminalCount: number,
): PipeCoordinate[] {
  const distances = getTreeDistances(masks, rows, cols, source);
  return leaves
    .filter((leaf) => !sameCoord(leaf, source))
    .sort((a, b) => {
      const distanceDelta = (distances.get(coordKey(b)) ?? 0) - (distances.get(coordKey(a)) ?? 0);
      if (distanceDelta !== 0) return distanceDelta;
      return Math.random() - 0.5;
    })
    .slice(0, terminalCount);
}

function createScrambledTiles(masks: number[], rows: number, cols: number): PipeTile[] {
  return masks.map((solvedMask, index) => {
    const rotationOptions = getDistinctRotations(solvedMask);
    const initialRotation = rotationOptions.length === 1
      ? 0
      : rotationOptions[1 + Math.floor(Math.random() * (rotationOptions.length - 1))]!;

    const coord = fromIndex(index, cols);
    return {
      row: coord.row,
      col: coord.col,
      solvedMask,
      initialMask: rotatePipeMask(solvedMask, initialRotation),
      initialRotation,
    };
  });
}

function buildStats(
  solvedMasks: number[],
  rows: number,
  cols: number,
  source: PipeCoordinate,
  terminals: PipeCoordinate[],
  tiles: PipeTile[],
  deadEndCount: number,
  branchCount: number,
): PipeRotationStats {
  const distances = getTreeDistances(solvedMasks, rows, cols, source);
  const tileCounts = {
    deadEnd: 0,
    straight: 0,
    corner: 0,
    tee: 0,
    cross: 0,
  };

  for (const mask of solvedMasks) {
    const degree = bitCount(mask);
    if (degree === 1) {
      tileCounts.deadEnd++;
    } else if (degree === 2 && isStraight(mask)) {
      tileCounts.straight++;
    } else if (degree === 2) {
      tileCounts.corner++;
    } else if (degree === 3) {
      tileCounts.tee++;
    } else if (degree === 4) {
      tileCounts.cross++;
    }
  }

  return {
    deadEndCount,
    branchCount,
    leafCount: tileCounts.deadEnd,
    misrotatedTileCount: tiles.filter((tile) => tile.initialMask !== tile.solvedMask).length,
    rotationDistance: tiles.reduce((total, tile) => total + getRotationDistance(tile.initialMask, tile.solvedMask), 0),
    longestTerminalDistance: Math.max(...terminals.map((terminal) => distances.get(coordKey(terminal)) ?? 0)),
    tileCounts,
  };
}

function getTreeDistances(
  masks: number[],
  rows: number,
  cols: number,
  source: PipeCoordinate,
): Map<string, number> {
  const distances = new Map<string, number>();
  const queue = [source];
  distances.set(coordKey(source), 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDistance = distances.get(coordKey(current)) ?? 0;
    const mask = masks[toIndex(current.row, current.col, cols)]!;
    for (const direction of DIRECTIONS) {
      if ((mask & direction.bit) === 0) continue;
      const next = { row: current.row + direction.dr, col: current.col + direction.dc };
      if (!isInBounds(next, rows, cols)) continue;
      const key = coordKey(next);
      if (distances.has(key)) continue;
      distances.set(key, currentDistance + 1);
      queue.push(next);
    }
  }

  return distances;
}

function getCellsWithDegree(masks: number[], rows: number, cols: number, degree: number): PipeCoordinate[] {
  const cells: PipeCoordinate[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const mask = masks[toIndex(row, col, cols)]!;
      if (bitCount(mask) === degree) {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

function countCellsWithMinimumDegree(masks: number[], rows: number, cols: number, degree: number): number {
  let count = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (bitCount(masks[toIndex(row, col, cols)]!) >= degree) {
        count++;
      }
    }
  }
  return count;
}

function getDistinctRotations(mask: number): number[] {
  const seen = new Set<number>();
  const rotations: number[] = [];
  for (let rotation = 0; rotation < 4; rotation++) {
    const rotated = rotatePipeMask(mask, rotation);
    if (seen.has(rotated)) continue;
    seen.add(rotated);
    rotations.push(rotation);
  }
  return rotations;
}

function getRotationDistance(fromMask: number, toMask: number): number {
  let best = 4;
  for (let rotation = 0; rotation < 4; rotation++) {
    if (rotatePipeMask(fromMask, rotation) !== toMask) continue;
    best = Math.min(best, Math.min(rotation, 4 - rotation));
  }
  return best === 4 ? 0 : best;
}

function rotateMaskClockwise(mask: number): number {
  let rotated = 0;
  if ((mask & NORTH) !== 0) rotated |= EAST;
  if ((mask & EAST) !== 0) rotated |= SOUTH;
  if ((mask & SOUTH) !== 0) rotated |= WEST;
  if ((mask & WEST) !== 0) rotated |= NORTH;
  return rotated;
}

function bitCount(mask: number): number {
  let count = 0;
  let value = mask;
  while (value > 0) {
    count += value & 1;
    value >>= 1;
  }
  return count;
}

function isStraight(mask: number): boolean {
  return mask === (NORTH | SOUTH) || mask === (EAST | WEST);
}

function toIndex(row: number, col: number, cols: number): number {
  return row * cols + col;
}

function fromIndex(index: number, cols: number): PipeCoordinate {
  return {
    row: Math.floor(index / cols),
    col: index % cols,
  };
}

function isInBounds(coord: PipeCoordinate, rows: number, cols: number): boolean {
  return coord.row >= 0 && coord.row < rows && coord.col >= 0 && coord.col < cols;
}

function sameCoord(a: PipeCoordinate, b: PipeCoordinate): boolean {
  return a.row === b.row && a.col === b.col;
}

function coordKey(coord: PipeCoordinate): string {
  return `${coord.row},${coord.col}`;
}
