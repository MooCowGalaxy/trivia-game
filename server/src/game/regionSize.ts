export type RegionSizeColor = 'black' | 'white';
export type RegionSizeInitialCell = RegionSizeColor | 'empty';

export interface RegionSizeCoordinate {
  row: number;
  col: number;
}

export interface RegionSizeClue extends RegionSizeCoordinate {
  size: number;
}

export interface RegionSizeLockedCell extends RegionSizeCoordinate {
  color: RegionSizeColor;
}

export interface RegionSizeGeneratorParams {
  rows: number;
  cols: number;
  minWhiteRegions?: number;
  maxWhiteRegions?: number;
  minRegionSize?: number;
  maxRegionSize?: number;
  lockRatio?: number;
  minLockedCells?: number;
  maxLockedCells?: number;
  maxAttempts?: number;
}

export interface RegionSizePuzzleStats {
  whiteRegionCount: number;
  whiteCellCount: number;
  blackCellCount: number;
  lockedCellCount: number;
  clueCount: number;
  regionSizes: number[];
}

export interface RegionSizePuzzle {
  rows: number;
  cols: number;
  solution: RegionSizeColor[][];
  initial: RegionSizeInitialCell[][];
  clues: RegionSizeClue[];
  lockedCells: RegionSizeLockedCell[];
  stats: RegionSizePuzzleStats;
}

export interface RegionSizeVerificationResult {
  valid: boolean;
  reason?: string;
}

const DIRECTIONS = [
  { dr: -1, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
];

export function generateRegionSizePuzzle(params: RegionSizeGeneratorParams): RegionSizePuzzle {
  validateParams(params);

  const rows = params.rows;
  const cols = params.cols;
  const area = rows * cols;
  const maxAttempts = params.maxAttempts ?? 500;
  const minRegionSize = params.minRegionSize ?? 2;
  const maxRegionSize = params.maxRegionSize ?? Math.max(minRegionSize, Math.floor(area / 7));
  const minWhiteRegions = params.minWhiteRegions ?? Math.max(3, Math.floor(area / 9));
  const maxWhiteRegions = params.maxWhiteRegions ?? Math.max(minWhiteRegions, Math.floor(area / 5));
  const lockRatio = params.lockRatio ?? 0.14;
  const minLockedCells = params.minLockedCells ?? Math.max(0, Math.floor(area * 0.06));
  const maxLockedCells = params.maxLockedCells ?? Math.max(minLockedCells, Math.floor(area * 0.2));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolvedGrid(rows, cols, minWhiteRegions, maxWhiteRegions, minRegionSize, maxRegionSize);
    if (!solution) continue;

    const whiteRegions = getColorRegions(solution, 'white');
    if (whiteRegions.length < minWhiteRegions || whiteRegions.length > maxWhiteRegions) continue;
    if (whiteRegions.some((region) => region.length < minRegionSize || region.length > maxRegionSize)) continue;
    if (!isSingleConnectedBlackSea(solution)) continue;
    if (hasBlackTwoByTwo(solution)) continue;

    const clues = whiteRegions
      .map((region) => {
        const clueCell = region[Math.floor(Math.random() * region.length)]!;
        return {
          row: clueCell.row,
          col: clueCell.col,
          size: region.length,
        };
      })
      .sort(compareCoords);

    const clueKeys = new Set(clues.map(coordKey));
    const desiredLockedCells = clamp(
      Math.round(area * lockRatio),
      minLockedCells,
      maxLockedCells,
    );
    const lockedCells = chooseLockedCells(solution, clueKeys, desiredLockedCells);
    const initial = buildInitialGrid(rows, cols, clues, lockedCells);
    const stats = buildStats(rows, cols, solution, clues, lockedCells, whiteRegions);

    return {
      rows,
      cols,
      solution,
      initial,
      clues,
      lockedCells,
      stats,
    };
  }

  throw new Error(`Unable to generate Region Size puzzle for rows=${rows}, cols=${cols}`);
}

export function verifyRegionSizeSolution(
  rows: number,
  cols: number,
  clues: RegionSizeClue[],
  lockedCells: RegionSizeLockedCell[],
  submitted: RegionSizeColor[][],
): RegionSizeVerificationResult {
  if (!isValidGridShape(submitted, rows, cols)) {
    return { valid: false, reason: 'Invalid board shape' };
  }

  const clueByKey = new Map<string, RegionSizeClue>();
  for (const clue of clues) {
    if (!isInBounds(clue, rows, cols) || !Number.isInteger(clue.size) || clue.size < 1) {
      return { valid: false, reason: 'Invalid clue' };
    }
    clueByKey.set(coordKey(clue), clue);
    if (submitted[clue.row]![clue.col] !== 'white') {
      return { valid: false, reason: 'A clue cell must be White' };
    }
  }

  for (const lockedCell of lockedCells) {
    if (!isInBounds(lockedCell, rows, cols)) {
      return { valid: false, reason: 'Invalid locked cell' };
    }
    if (submitted[lockedCell.row]![lockedCell.col] !== lockedCell.color) {
      return { valid: false, reason: 'A locked cell was changed' };
    }
  }

  const whiteRegions = getColorRegions(submitted, 'white');
  for (const region of whiteRegions) {
    const regionClues = region
      .map((cell) => clueByKey.get(coordKey(cell)))
      .filter((clue): clue is RegionSizeClue => clue !== undefined);
    if (regionClues.length !== 1) {
      return { valid: false, reason: 'Each white area must contain exactly one clue' };
    }
    if (region.length !== regionClues[0]!.size) {
      return { valid: false, reason: 'A white area has the wrong size' };
    }
  }

  if (!isSingleConnectedBlackSea(submitted)) {
    return { valid: false, reason: 'Black cells must all be connected' };
  }
  if (hasBlackTwoByTwo(submitted)) {
    return { valid: false, reason: 'Black cells cannot form a 2x2 block' };
  }

  return { valid: true };
}

function generateSolvedGrid(
  rows: number,
  cols: number,
  minWhiteRegions: number,
  maxWhiteRegions: number,
  minRegionSize: number,
  maxRegionSize: number,
): RegionSizeColor[][] | null {
  const seeds = getNurikabeSeedCells(rows, cols);
  if (seeds.length === 0) return null;
  const targetRegionCount = randomInt(
    Math.min(minWhiteRegions, seeds.length),
    Math.min(maxWhiteRegions, seeds.length),
  );
  const grid = Array.from({ length: rows }, () => Array<RegionSizeColor>(cols).fill('black'));
  const regionBySeed = new Map<string, number>();
  let regions = seeds.map((seed, index) => {
    grid[seed.row]![seed.col] = 'white';
    regionBySeed.set(coordKey(seed), index);
    return {
      cells: [seed],
      seedKeys: new Set<string>([coordKey(seed)]),
    };
  });

  let guard = seeds.length * seeds.length * 4;
  while (regions.length > targetRegionCount && guard-- > 0) {
    const merge = chooseSeedRegionMerge(seeds, regions, regionBySeed, maxRegionSize);
    if (!merge) break;

    const { keepIndex, removeIndex, corridor } = merge;
    regions[keepIndex]!.cells.push(corridor, ...regions[removeIndex]!.cells);
    for (const key of regions[removeIndex]!.seedKeys) {
      regions[keepIndex]!.seedKeys.add(key);
    }
    grid[corridor.row]![corridor.col] = 'white';
    regions.splice(removeIndex, 1);
    rebuildSeedRegionMap(regions, regionBySeed);
  }

  for (const region of shuffle(regions)) {
    growRegionToMinimum(grid, region.cells, minRegionSize);
  }

  const extraGrowthRounds = randomInt(0, rows + cols);
  for (let step = 0; step < extraGrowthRounds; step++) {
    const region = regions[Math.floor(Math.random() * regions.length)]!;
    if (region.cells.length >= maxRegionSize) continue;
    tryGrowRegionByOne(grid, region.cells, maxRegionSize);
  }

  return grid;
}

function getNurikabeSeedCells(rows: number, cols: number): RegionSizeCoordinate[] {
  const seeds: RegionSizeCoordinate[] = [];
  for (let row = 1; row < rows; row += 2) {
    for (let col = 1; col < cols; col += 2) {
      seeds.push({ row, col });
    }
  }
  if (seeds.length === 0) {
    seeds.push({ row: rows - 1, col: cols - 1 });
  }
  return shuffle(seeds);
}

function chooseSeedRegionMerge(
  seeds: RegionSizeCoordinate[],
  regions: Array<{ cells: RegionSizeCoordinate[]; seedKeys: Set<string> }>,
  regionBySeed: Map<string, number>,
  maxRegionSize: number,
): { keepIndex: number; removeIndex: number; corridor: RegionSizeCoordinate } | null {
  const candidates: Array<{ keepIndex: number; removeIndex: number; corridor: RegionSizeCoordinate }> = [];

  for (const seed of seeds) {
    const seedRegion = regionBySeed.get(coordKey(seed));
    if (seedRegion === undefined) continue;
    for (const direction of DIRECTIONS) {
      const otherSeed = { row: seed.row + direction.dr * 2, col: seed.col + direction.dc * 2 };
      const otherRegion = regionBySeed.get(coordKey(otherSeed));
      if (otherRegion === undefined || otherRegion === seedRegion) continue;
      const keepIndex = Math.min(seedRegion, otherRegion);
      const removeIndex = Math.max(seedRegion, otherRegion);
      const mergedSize = regions[keepIndex]!.cells.length + regions[removeIndex]!.cells.length + 1;
      if (mergedSize > maxRegionSize) continue;
      candidates.push({
        keepIndex,
        removeIndex,
        corridor: { row: seed.row + direction.dr, col: seed.col + direction.dc },
      });
    }
  }

  return candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]!
    : null;
}

function rebuildSeedRegionMap(
  regions: Array<{ cells: RegionSizeCoordinate[]; seedKeys: Set<string> }>,
  regionBySeed: Map<string, number>,
): void {
  regionBySeed.clear();
  regions.forEach((region, index) => {
    for (const key of region.seedKeys) {
      regionBySeed.set(key, index);
    }
  });
}

function growRegionToMinimum(
  grid: RegionSizeColor[][],
  region: RegionSizeCoordinate[],
  minRegionSize: number,
): void {
  while (region.length < minRegionSize) {
    if (!tryGrowRegionByOne(grid, region, minRegionSize)) return;
  }
}

function tryGrowRegionByOne(
  grid: RegionSizeColor[][],
  region: RegionSizeCoordinate[],
  maxRegionSize: number,
): boolean {
  if (region.length >= maxRegionSize) return false;
  const rows = grid.length;
  const cols = grid[0]!.length;
  const regionKeys = new Set(region.map(coordKey));
  const candidates = shuffle(getCandidateGrowthCells(grid, region, regionKeys));

  for (const candidate of candidates) {
    grid[candidate.row]![candidate.col] = 'white';
    if (isSingleConnectedBlackSea(grid)) {
      region.push(candidate);
      return true;
    }
    grid[candidate.row]![candidate.col] = 'black';
  }

  return false;
}

function getCandidateGrowthCells(
  grid: RegionSizeColor[][],
  region: RegionSizeCoordinate[],
  regionKeys: Set<string>,
): RegionSizeCoordinate[] {
  const rows = grid.length;
  const cols = grid[0]!.length;
  const candidates: RegionSizeCoordinate[] = [];

  for (const cell of region) {
    for (const neighbor of orthogonalNeighbors(cell, rows, cols)) {
      if (regionKeys.has(coordKey(neighbor))) continue;
      if (grid[neighbor.row]![neighbor.col] !== 'black') continue;
      if (!canJoinRegion(grid, neighbor, regionKeys)) continue;
      if (candidates.some((candidate) => sameCoord(candidate, neighbor))) continue;
      candidates.push(neighbor);
    }
  }

  return candidates;
}

function canJoinRegion(
  grid: RegionSizeColor[][],
  cell: RegionSizeCoordinate,
  regionKeys: Set<string>,
): boolean {
  const rows = grid.length;
  const cols = grid[0]!.length;
  return orthogonalNeighbors(cell, rows, cols).every((neighbor) => {
    if (regionKeys.has(coordKey(neighbor))) return true;
    return grid[neighbor.row]![neighbor.col] !== 'white';
  });
}

function chooseLockedCells(
  solution: RegionSizeColor[][],
  clueKeys: Set<string>,
  desiredCount: number,
): RegionSizeLockedCell[] {
  const candidates: RegionSizeLockedCell[] = [];
  for (let row = 0; row < solution.length; row++) {
    for (let col = 0; col < solution[row]!.length; col++) {
      if (clueKeys.has(coordKey({ row, col }))) continue;
      if (solution[row]![col] !== 'black') continue;
      candidates.push({ row, col, color: solution[row]![col]! });
    }
  }

  return shuffle(candidates)
    .slice(0, Math.min(desiredCount, candidates.length))
    .sort(compareCoords);
}

function buildInitialGrid(
  rows: number,
  cols: number,
  clues: RegionSizeClue[],
  lockedCells: RegionSizeLockedCell[],
): RegionSizeInitialCell[][] {
  const initial = Array.from({ length: rows }, () => Array<RegionSizeInitialCell>(cols).fill('empty'));

  for (const clue of clues) {
    initial[clue.row]![clue.col] = 'white';
  }
  for (const lockedCell of lockedCells) {
    initial[lockedCell.row]![lockedCell.col] = lockedCell.color;
  }

  return initial;
}

function buildStats(
  rows: number,
  cols: number,
  solution: RegionSizeColor[][],
  clues: RegionSizeClue[],
  lockedCells: RegionSizeLockedCell[],
  whiteRegions: RegionSizeCoordinate[][],
): RegionSizePuzzleStats {
  const whiteCellCount = solution.flat().filter((cell) => cell === 'white').length;
  return {
    whiteRegionCount: whiteRegions.length,
    whiteCellCount,
    blackCellCount: rows * cols - whiteCellCount,
    lockedCellCount: lockedCells.length,
    clueCount: clues.length,
    regionSizes: whiteRegions.map((region) => region.length).sort((a, b) => a - b),
  };
}

function getColorRegions(grid: RegionSizeColor[][], color: RegionSizeColor): RegionSizeCoordinate[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const visited = new Set<string>();
  const regions: RegionSizeCoordinate[][] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (grid[row]![col] !== color) continue;
      const start = { row, col };
      const startKey = coordKey(start);
      if (visited.has(startKey)) continue;

      const region: RegionSizeCoordinate[] = [];
      const queue = [start];
      visited.add(startKey);

      while (queue.length > 0) {
        const current = queue.shift()!;
        region.push(current);
        for (const neighbor of orthogonalNeighbors(current, rows, cols)) {
          const key = coordKey(neighbor);
          if (visited.has(key)) continue;
          if (grid[neighbor.row]![neighbor.col] !== color) continue;
          visited.add(key);
          queue.push(neighbor);
        }
      }

      regions.push(region);
    }
  }

  return regions;
}

function isSingleConnectedBlackSea(grid: RegionSizeColor[][]): boolean {
  return getColorRegions(grid, 'black').length === 1;
}

function hasBlackTwoByTwo(grid: RegionSizeColor[][]): boolean {
  for (let row = 0; row < grid.length - 1; row++) {
    for (let col = 0; col < grid[row]!.length - 1; col++) {
      if (
        grid[row]![col] === 'black' &&
        grid[row]![col + 1] === 'black' &&
        grid[row + 1]![col] === 'black' &&
        grid[row + 1]![col + 1] === 'black'
      ) {
        return true;
      }
    }
  }
  return false;
}

function isValidGridShape(grid: RegionSizeColor[][], rows: number, cols: number): boolean {
  if (!Array.isArray(grid) || grid.length !== rows) return false;
  return grid.every((row) => (
    Array.isArray(row) &&
    row.length === cols &&
    row.every((cell) => cell === 'black' || cell === 'white')
  ));
}

function validateParams(params: RegionSizeGeneratorParams): void {
  if (!Number.isInteger(params.rows) || params.rows < 2) {
    throw new Error('Region Size puzzle requires at least 2 rows');
  }
  if (!Number.isInteger(params.cols) || params.cols < 2) {
    throw new Error('Region Size puzzle requires at least 2 columns');
  }

  const area = params.rows * params.cols;
  const minRegionSize = params.minRegionSize ?? 2;
  const maxRegionSize = params.maxRegionSize ?? Math.max(minRegionSize, Math.floor(area / 7));
  const minWhiteRegions = params.minWhiteRegions ?? Math.max(3, Math.floor(area / 9));
  const maxWhiteRegions = params.maxWhiteRegions ?? Math.max(minWhiteRegions, Math.floor(area / 5));

  if (!Number.isInteger(minRegionSize) || minRegionSize < 1) {
    throw new Error('Region Size minRegionSize must be at least 1');
  }
  if (!Number.isInteger(maxRegionSize) || maxRegionSize < minRegionSize) {
    throw new Error('Region Size maxRegionSize must be at least minRegionSize');
  }
  if (!Number.isInteger(minWhiteRegions) || minWhiteRegions < 1) {
    throw new Error('Region Size minWhiteRegions must be at least 1');
  }
  if (!Number.isInteger(maxWhiteRegions) || maxWhiteRegions < minWhiteRegions) {
    throw new Error('Region Size maxWhiteRegions must be at least minWhiteRegions');
  }
  if (minWhiteRegions * minRegionSize > area) {
    throw new Error('Region Size white region requirements exceed board area');
  }
  if (params.lockRatio !== undefined && (params.lockRatio < 0 || params.lockRatio > 1)) {
    throw new Error('Region Size lockRatio must be between 0 and 1');
  }
  if (params.minLockedCells !== undefined && (!Number.isInteger(params.minLockedCells) || params.minLockedCells < 0)) {
    throw new Error('Region Size minLockedCells must be nonnegative');
  }
  if (params.maxLockedCells !== undefined && (!Number.isInteger(params.maxLockedCells) || params.maxLockedCells < 0)) {
    throw new Error('Region Size maxLockedCells must be nonnegative');
  }
  if (
    params.minLockedCells !== undefined &&
    params.maxLockedCells !== undefined &&
    params.maxLockedCells < params.minLockedCells
  ) {
    throw new Error('Region Size maxLockedCells must be at least minLockedCells');
  }
}

function orthogonalNeighbors(
  coord: RegionSizeCoordinate,
  rows: number,
  cols: number,
): RegionSizeCoordinate[] {
  const neighbors: RegionSizeCoordinate[] = [];
  for (const direction of DIRECTIONS) {
    const next = { row: coord.row + direction.dr, col: coord.col + direction.dc };
    if (isInBounds(next, rows, cols)) {
      neighbors.push(next);
    }
  }
  return neighbors;
}

function isInBounds(coord: RegionSizeCoordinate, rows: number, cols: number): boolean {
  return coord.row >= 0 && coord.row < rows && coord.col >= 0 && coord.col < cols;
}

function coordKey(coord: RegionSizeCoordinate): string {
  return `${coord.row},${coord.col}`;
}

function sameCoord(a: RegionSizeCoordinate, b: RegionSizeCoordinate): boolean {
  return a.row === b.row && a.col === b.col;
}

function compareCoords(a: RegionSizeCoordinate, b: RegionSizeCoordinate): number {
  return a.row - b.row || a.col - b.col;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
