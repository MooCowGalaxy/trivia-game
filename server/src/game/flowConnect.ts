export interface FlowCoordinate {
  row: number;
  col: number;
}

export interface FlowEndpoint {
  color: number;
  start: FlowCoordinate;
  end: FlowCoordinate;
}

export interface FlowConnectPuzzle {
  size: number;
  colorCount: number;
  solvedGrid: number[][];
  endpoints: FlowEndpoint[];
}

export interface FlowConnectSubmittedPath {
  color: number;
  cells: FlowCoordinate[];
}

export interface FlowVerificationResult {
  valid: boolean;
  reason?: string;
}

export function generateFlowConnectPuzzle(size: number, colorCount: number): FlowConnectPuzzle {
  if (!Number.isInteger(size) || size < 3) {
    throw new Error('Flow Connect board size must be at least 3');
  }
  if (!Number.isInteger(colorCount) || colorCount < 2) {
    throw new Error('Flow Connect requires at least 2 colors');
  }
  if (size * size < colorCount * 2) {
    throw new Error('Flow Connect board must have at least two cells per color');
  }

  for (let attempt = 0; attempt < 300; attempt++) {
    const lengths = createRandomSegmentLengths(size * size, colorCount)
      .sort((a, b) => b - a);
    const puzzle = createPuzzleFromPathCover(size, colorCount, lengths);
    if (!puzzle) continue;

    const verification = verifyFlowConnectGridSolution(
      puzzle.solvedGrid,
      puzzle.endpoints,
      puzzle.size,
      puzzle.colorCount,
    );

    if (verification.valid && hasVariedEndpoints(puzzle.endpoints)) {
      return puzzle;
    }
  }

  throw new Error(`Unable to generate a valid Flow Connect board for size=${size}, colors=${colorCount}`);
}

function createPuzzleFromPathCover(
  size: number,
  colorCount: number,
  lengths: number[],
): FlowConnectPuzzle | null {
  const colorOrder = shuffle(Array.from({ length: colorCount }, (_, i) => i + 1));
  const solvedGrid = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const endpoints: FlowEndpoint[] = [];

  function placePath(pathIndex: number): boolean {
    if (pathIndex === colorCount) {
      return solvedGrid.every((row) => row.every((cell) => cell > 0));
    }

    const color = colorOrder[pathIndex]!;
    const length = lengths[pathIndex]!;
    const paths = findCandidatePaths(solvedGrid, size, length, pathIndex === colorCount - 1);

    for (const path of paths) {
      for (const cell of path) {
        solvedGrid[cell.row]![cell.col] = color;
      }

      const reverse = Math.random() < 0.5;
      endpoints.push({
        color,
        start: reverse ? path[path.length - 1]! : path[0]!,
        end: reverse ? path[0]! : path[path.length - 1]!,
      });

      if (hasEnoughEmptySpace(solvedGrid, lengths.slice(pathIndex + 1)) && placePath(pathIndex + 1)) {
        return true;
      }

      endpoints.pop();
      for (const cell of path) {
        solvedGrid[cell.row]![cell.col] = 0;
      }
    }

    return false;
  }

  if (!placePath(0)) {
    return null;
  }

  endpoints.sort((a, b) => a.color - b.color);
  return {
    size,
    colorCount,
    solvedGrid,
    endpoints,
  };
}

export function verifyFlowConnectSolution(
  paths: FlowConnectSubmittedPath[],
  endpoints: FlowEndpoint[],
  size: number,
  colorCount: number,
): FlowVerificationResult {
  if (!Array.isArray(paths) || paths.length !== colorCount) {
    return { valid: false, reason: 'Each color must submit exactly one path' };
  }

  const endpointsByColor = new Map<number, FlowEndpoint>();
  for (const endpoint of endpoints) {
    if (!Number.isInteger(endpoint.color) || endpoint.color < 1 || endpoint.color > colorCount) {
      return { valid: false, reason: 'Endpoint color is out of range' };
    }
    if (!isInBounds(endpoint.start, size) || !isInBounds(endpoint.end, size)) {
      return { valid: false, reason: 'Endpoint is out of bounds' };
    }
    endpointsByColor.set(endpoint.color, endpoint);
  }

  const seenColors = new Set<number>();
  const occupied = new Set<string>();

  for (const submittedPath of paths) {
    if (
      !submittedPath ||
      !Number.isInteger(submittedPath.color) ||
      submittedPath.color < 1 ||
      submittedPath.color > colorCount
    ) {
      return { valid: false, reason: 'Path color is out of range' };
    }
    if (seenColors.has(submittedPath.color)) {
      return { valid: false, reason: 'Duplicate color path submitted' };
    }
    seenColors.add(submittedPath.color);

    const endpoint = endpointsByColor.get(submittedPath.color);
    if (!endpoint) {
      return { valid: false, reason: 'Path has no matching endpoints' };
    }

    const cells = submittedPath.cells;
    if (!Array.isArray(cells) || cells.length < 2 || cells.length > size * size) {
      return { valid: false, reason: 'Path length is invalid' };
    }

    const first = cells[0]!;
    const last = cells[cells.length - 1]!;
    const startsAtStart = sameCoord(first, endpoint.start) && sameCoord(last, endpoint.end);
    const startsAtEnd = sameCoord(first, endpoint.end) && sameCoord(last, endpoint.start);
    if (!startsAtStart && !startsAtEnd) {
      return { valid: false, reason: 'Each path must start and end at its matching dots' };
    }

    const pathCells = new Set<string>();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      if (!isInBounds(cell, size)) {
        return { valid: false, reason: 'Path cell is out of bounds' };
      }

      const key = coordKey(cell);
      if (pathCells.has(key)) {
        return { valid: false, reason: 'A path cannot visit the same cell twice' };
      }
      if (occupied.has(key)) {
        return { valid: false, reason: 'Paths cannot overlap' };
      }
      pathCells.add(key);
      occupied.add(key);

      if (i > 0 && !areAdjacent(cells[i - 1]!, cell)) {
        return { valid: false, reason: 'Path cells must be orthogonally adjacent' };
      }
    }
  }

  for (let color = 1; color <= colorCount; color++) {
    if (!seenColors.has(color)) {
      return { valid: false, reason: 'Missing color path' };
    }
  }

  if (occupied.size !== size * size) {
    return { valid: false, reason: 'Every board cell must be used exactly once' };
  }

  return { valid: true };
}

function verifyFlowConnectGridSolution(
  grid: number[][],
  endpoints: FlowEndpoint[],
  size: number,
  colorCount: number,
): FlowVerificationResult {
  if (!isValidGridShape(grid, size)) {
    return { valid: false, reason: 'Invalid solution grid shape' };
  }

  const cellsByColor = new Map<number, FlowCoordinate[]>();
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const color = grid[row]![col]!;
      if (!Number.isInteger(color) || color < 1 || color > colorCount) {
        return { valid: false, reason: 'Every cell must be filled with a valid color' };
      }
      const cells = cellsByColor.get(color) ?? [];
      cells.push({ row, col });
      cellsByColor.set(color, cells);
    }
  }

  const endpointsByColor = new Map<number, FlowEndpoint>();
  for (const endpoint of endpoints) {
    endpointsByColor.set(endpoint.color, endpoint);
    if (
      !isInBounds(endpoint.start, size) ||
      !isInBounds(endpoint.end, size) ||
      grid[endpoint.start.row]![endpoint.start.col] !== endpoint.color ||
      grid[endpoint.end.row]![endpoint.end.col] !== endpoint.color
    ) {
      return { valid: false, reason: 'Endpoint colors do not match the solution' };
    }
  }

  for (let color = 1; color <= colorCount; color++) {
    const cells = cellsByColor.get(color) ?? [];
    const endpoint = endpointsByColor.get(color);
    if (!endpoint || cells.length < 2) {
      return { valid: false, reason: 'Each color must connect two endpoints' };
    }
    if (!isConnectedColor(grid, cells, color, size)) {
      return { valid: false, reason: 'A color has disconnected path segments' };
    }
    if (!hasValidPathDegrees(grid, cells, endpoint, color, size)) {
      return { valid: false, reason: 'A color path branches or does not end at its endpoints' };
    }
  }

  return { valid: true };
}

function createRandomSegmentLengths(totalCells: number, colorCount: number): number[] {
  const lengths = Array<number>(colorCount).fill(2);
  let remaining = totalCells - colorCount * 2;

  while (remaining > 0) {
    lengths[Math.floor(Math.random() * colorCount)]!++;
    remaining--;
  }

  return lengths;
}

function findCandidatePaths(
  grid: number[][],
  size: number,
  length: number,
  mustUseAllEmptyCells: boolean,
): FlowCoordinate[][] {
  const emptyCells = getEmptyCells(grid);
  if (mustUseAllEmptyCells && emptyCells.length !== length) return [];

  const paths: FlowCoordinate[][] = [];
  const starts = shuffle(emptyCells).slice(0, 24);

  for (const start of starts) {
    const path = [start];
    const used = new Set<string>([coordKey(start)]);
    collectPaths(grid, size, length, path, used, paths, mustUseAllEmptyCells);
    if (paths.length >= 16) break;
  }

  return shuffle(paths);
}

function collectPaths(
  grid: number[][],
  size: number,
  length: number,
  path: FlowCoordinate[],
  used: Set<string>,
  paths: FlowCoordinate[][],
  mustUseAllEmptyCells: boolean,
): void {
  if (paths.length >= 16) return;
  if (path.length === length) {
    if (!mustUseAllEmptyCells || getEmptyCells(grid).every((cell) => used.has(coordKey(cell)))) {
      paths.push([...path]);
    }
    return;
  }

  const current = path[path.length - 1]!;
  const candidates = shuffle(getNeighbors(current, size))
    .filter((coord) => grid[coord.row]![coord.col] === 0)
    .filter((coord) => !used.has(coordKey(coord)))
    .filter((coord) => doesNotTouchPathExceptPrevious(coord, path, used, size))
    .sort((a, b) => countEmptyNeighbors(grid, a, size, used) - countEmptyNeighbors(grid, b, size, used));

  for (const candidate of candidates) {
    used.add(coordKey(candidate));
    path.push(candidate);
    collectPaths(grid, size, length, path, used, paths, mustUseAllEmptyCells);
    path.pop();
    used.delete(coordKey(candidate));
    if (paths.length >= 16) return;
  }
}

function doesNotTouchPathExceptPrevious(
  coord: FlowCoordinate,
  path: FlowCoordinate[],
  used: Set<string>,
  size: number,
): boolean {
  const previous = path[path.length - 1]!;
  return getNeighbors(coord, size).every((neighbor) => {
    if (neighbor.row === previous.row && neighbor.col === previous.col) return true;
    return !used.has(coordKey(neighbor));
  });
}

function countEmptyNeighbors(
  grid: number[][],
  coord: FlowCoordinate,
  size: number,
  used: Set<string>,
): number {
  return getNeighbors(coord, size)
    .filter((neighbor) => grid[neighbor.row]![neighbor.col] === 0)
    .filter((neighbor) => !used.has(coordKey(neighbor)))
    .length;
}

function getEmptyCells(grid: number[][]): FlowCoordinate[] {
  const cells: FlowCoordinate[] = [];
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row]!.length; col++) {
      if (grid[row]![col] === 0) cells.push({ row, col });
    }
  }
  return cells;
}

function hasEnoughEmptySpace(grid: number[][], remainingLengths: number[]): boolean {
  if (remainingLengths.length === 0) return true;
  const emptyCount = getEmptyCells(grid).length;
  return emptyCount === remainingLengths.reduce((total, length) => total + length, 0);
}

function hasVariedEndpoints(endpoints: FlowEndpoint[]): boolean {
  return endpoints.some((endpoint) => endpoint.start.row !== endpoint.end.row) &&
    endpoints.some((endpoint) => endpoint.start.col !== endpoint.end.col);
}

function isValidGridShape(grid: number[][], size: number): boolean {
  return (
    Array.isArray(grid) &&
    grid.length === size &&
    grid.every((row) => Array.isArray(row) && row.length === size)
  );
}

function isConnectedColor(
  grid: number[][],
  cells: FlowCoordinate[],
  color: number,
  size: number,
): boolean {
  const start = cells[0]!;
  const visited = new Set<string>();
  const queue = [start];
  visited.add(coordKey(start));

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of getNeighbors(current, size)) {
      if (grid[next.row]![next.col] !== color) continue;
      const key = coordKey(next);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push(next);
    }
  }

  return visited.size === cells.length;
}

function hasValidPathDegrees(
  grid: number[][],
  cells: FlowCoordinate[],
  endpoint: FlowEndpoint,
  color: number,
  size: number,
): boolean {
  const startKey = coordKey(endpoint.start);
  const endKey = coordKey(endpoint.end);

  for (const cell of cells) {
    const key = coordKey(cell);
    const sameColorNeighbors = getNeighbors(cell, size)
      .filter((neighbor) => grid[neighbor.row]![neighbor.col] === color)
      .length;
    const isEndpoint = key === startKey || key === endKey;

    if (isEndpoint && sameColorNeighbors !== 1) return false;
    if (!isEndpoint && sameColorNeighbors !== 2) return false;
  }

  return true;
}

function getNeighbors(coord: FlowCoordinate, size: number): FlowCoordinate[] {
  const neighbors: FlowCoordinate[] = [];
  if (coord.row > 0) neighbors.push({ row: coord.row - 1, col: coord.col });
  if (coord.row < size - 1) neighbors.push({ row: coord.row + 1, col: coord.col });
  if (coord.col > 0) neighbors.push({ row: coord.row, col: coord.col - 1 });
  if (coord.col < size - 1) neighbors.push({ row: coord.row, col: coord.col + 1 });
  return neighbors;
}

function isInBounds(coord: FlowCoordinate, size: number): boolean {
  return (
    Number.isInteger(coord.row) &&
    Number.isInteger(coord.col) &&
    coord.row >= 0 &&
    coord.row < size &&
    coord.col >= 0 &&
    coord.col < size
  );
}

function areAdjacent(a: FlowCoordinate, b: FlowCoordinate): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function sameCoord(a: FlowCoordinate, b: FlowCoordinate): boolean {
  return a.row === b.row && a.col === b.col;
}

function coordKey(coord: FlowCoordinate): string {
  return `${coord.row},${coord.col}`;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const item = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = item;
  }
  return copy;
}
