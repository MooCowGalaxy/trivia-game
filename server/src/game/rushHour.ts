export type RushHourOrientation = 'H' | 'V';

export interface RushHourVehicle {
  id: string;
  row: number;
  col: number;
  length: number;
  orientation: RushHourOrientation;
  isTarget?: boolean;
}

export interface RushHourMove {
  vehicleId: string;
  delta: number;
}

export interface RushHourGeneratorParams {
  size?: number;
  vehicleCount?: number;
  truckCount?: number;
  scrambleMoves?: number;
  minOneCellMoves?: number;
  maxOneCellMoves?: number;
  minVehicleMoves?: number;
  maxVehicleMoves?: number;
  minExploredStates?: number;
  minTargetRowBlockers?: number;
  maxAttempts?: number;
}

export interface RushHourSolveStats {
  oneCellMoves: number;
  vehicleMoves: number;
  exploredStates: number;
  targetRowBlockers: number;
  solution: RushHourMove[];
}

export interface RushHourPuzzle {
  size: number;
  targetId: string;
  exitRow: number;
  vehicles: RushHourVehicle[];
  solvedVehicles: RushHourVehicle[];
  solveStats: RushHourSolveStats;
  optimalMoves: number;
  optimalVehicleMoves: number;
  scrambleMoves: RushHourMove[];
}

export interface RushHourVerificationResult {
  valid: boolean;
  reason?: string;
  moveCount?: number;
}

interface VehicleShape {
  id: string;
  length: number;
  orientation: RushHourOrientation;
  isTarget?: boolean;
}

interface PositionedVehicle extends VehicleShape {
  row: number;
  col: number;
}

const TARGET_ID = 'X';
const VEHICLE_IDS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((id) => id !== TARGET_ID);

export function generateRushHourPuzzle(params: RushHourGeneratorParams = {}): RushHourPuzzle {
  const size = params.size ?? 6;
  const vehicleCount = params.vehicleCount ?? 12;
  const truckCount = params.truckCount ?? 3;
  const scrambleMoves = params.scrambleMoves ?? 140;
  const minOneCellMoves = params.minOneCellMoves ?? 16;
  const maxOneCellMoves = params.maxOneCellMoves ?? 70;
  const minVehicleMoves = params.minVehicleMoves ?? 10;
  const maxVehicleMoves = params.maxVehicleMoves ?? 45;
  const minExploredStates = params.minExploredStates ?? 500;
  const minTargetRowBlockers = params.minTargetRowBlockers ?? 2;
  const maxAttempts = params.maxAttempts ?? 5000;

  validateParams(size, vehicleCount, truckCount, minOneCellMoves, maxOneCellMoves, minVehicleMoves, maxVehicleMoves);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solvedVehicles = createSolvedLayout(size, vehicleCount, truckCount);
    if (!solvedVehicles) continue;

    const scrambled = scrambleSolvedLayout(solvedVehicles, size, scrambleMoves);
    if (isSolved(scrambled, size)) continue;

    const solveStats = solveRushHour(scrambled, size);
    if (!solveStats) continue;
    if (solveStats.oneCellMoves < minOneCellMoves || solveStats.oneCellMoves > maxOneCellMoves) continue;
    if (solveStats.vehicleMoves < minVehicleMoves || solveStats.vehicleMoves > maxVehicleMoves) continue;
    if (solveStats.exploredStates < minExploredStates) continue;
    if (solveStats.targetRowBlockers < minTargetRowBlockers) continue;

    return {
      size,
      targetId: TARGET_ID,
      exitRow: getTargetVehicle(scrambled).row,
      vehicles: sortVehicles(scrambled),
      solvedVehicles: sortVehicles(solvedVehicles),
      solveStats,
      optimalMoves: solveStats.oneCellMoves,
      optimalVehicleMoves: solveStats.vehicleMoves,
      scrambleMoves: [],
    };
  }

  throw new Error(`Unable to generate Rush Hour puzzle for size=${size}, vehicles=${vehicleCount}`);
}

export function solveRushHour(vehicles: RushHourVehicle[], size: number): RushHourSolveStats | null {
  const shapes = sortVehicles(vehicles).map((vehicle) => ({
    id: vehicle.id,
    length: vehicle.length,
    orientation: vehicle.orientation,
    ...(vehicle.isTarget ? { isTarget: true } : {}),
  }));
  const sortedVehicles = sortVehicles(vehicles);
  const start = encodeState(sortedVehicles);
  const targetRowBlockers = countTargetRowBlockers(sortedVehicles, size);
  const visited = new Set<string>([start]);
  const parent = new Map<string, { previous: string; move: RushHourMove }>();
  const queue: Array<{ state: string; depth: number }> = [{ state: start, depth: 0 }];
  let cursor = 0;

  while (cursor < queue.length) {
    const current = queue[cursor++]!;
    const positioned = decodeState(current.state, shapes);
    if (isSolved(positioned, size)) {
      const solution = reconstructSolution(current.state, parent);
      return {
        oneCellMoves: current.depth,
        vehicleMoves: countVehicleMoves(solution),
        exploredStates: visited.size,
        targetRowBlockers,
        solution,
      };
    }

    for (const { move, vehicles: nextVehicles } of getLegalNeighborStates(positioned, size)) {
      const encoded = encodeState(nextVehicles);
      if (visited.has(encoded)) continue;
      visited.add(encoded);
      parent.set(encoded, { previous: current.state, move });
      queue.push({ state: encoded, depth: current.depth + 1 });
    }
  }

  return null;
}

export function isRushHourSolved(vehicles: RushHourVehicle[], size: number): boolean {
  return isSolved(vehicles, size);
}

export function verifyRushHourSolve(
  initialVehicles: RushHourVehicle[],
  size: number,
  moves: RushHourMove[],
  maxMoves = 512,
): RushHourVerificationResult {
  if (!Array.isArray(moves)) {
    return { valid: false, reason: 'Invalid move list' };
  }
  if (moves.length > maxMoves) {
    return { valid: false, reason: 'Too many moves' };
  }

  let vehicles = cloneVehicles(initialVehicles);
  if (!isValidRushHourLayout(vehicles, size)) {
    return { valid: false, reason: 'Invalid initial Rush Hour layout' };
  }

  for (const move of moves) {
    if (!move || typeof move.vehicleId !== 'string' || (move.delta !== -1 && move.delta !== 1)) {
      return { valid: false, reason: 'Invalid Rush Hour move' };
    }
    const vehicle = vehicles.find((entry) => entry.id === move.vehicleId);
    if (!vehicle) {
      return { valid: false, reason: 'Move references an unknown vehicle' };
    }
    const occupied = buildOccupancy(vehicles);
    if (!canMove(vehicle, move.delta, occupied, size)) {
      return { valid: false, reason: 'Illegal Rush Hour move' };
    }
    vehicles = applyMove(vehicles, move);
  }

  if (!isSolved(vehicles, size)) {
    return { valid: false, reason: 'Moves do not solve the puzzle' };
  }

  return { valid: true, moveCount: moves.length };
}

function validateParams(
  size: number,
  vehicleCount: number,
  truckCount: number,
  minOneCellMoves: number,
  maxOneCellMoves: number,
  minVehicleMoves: number,
  maxVehicleMoves: number,
): void {
  if (!Number.isInteger(size) || size < 5) {
    throw new Error('Rush Hour requires a board size of at least 5');
  }
  if (!Number.isInteger(vehicleCount) || vehicleCount < 4) {
    throw new Error('Rush Hour requires at least 4 vehicles');
  }
  if (!Number.isInteger(truckCount) || truckCount < 0 || truckCount >= vehicleCount) {
    throw new Error('Rush Hour truckCount must be nonnegative and less than vehicleCount');
  }
  if (minOneCellMoves < 1 || maxOneCellMoves < minOneCellMoves) {
    throw new Error('Rush Hour one-cell move bounds are invalid');
  }
  if (minVehicleMoves < 1 || maxVehicleMoves < minVehicleMoves) {
    throw new Error('Rush Hour vehicle move bounds are invalid');
  }
}

function createSolvedLayout(
  size: number,
  vehicleCount: number,
  truckCount: number,
): PositionedVehicle[] | null {
  const exitRow = Math.floor(size / 2);
  const target: PositionedVehicle = {
    id: TARGET_ID,
    row: exitRow,
    col: size - 2,
    length: 2,
    orientation: 'H',
    isTarget: true,
  };
  const vehicles: PositionedVehicle[] = [target];
  const occupied = new Set<string>(getVehicleCells(target).map(cellKey));
  for (let col = 0; col < size; col++) {
    occupied.add(cellKey({ row: exitRow, col }));
  }
  const shapes = createVehicleShapes(vehicleCount, truckCount);

  for (const shape of shapes) {
    const placement = placeRandomVehicle(shape, size, occupied);
    if (!placement) return null;
    vehicles.push(placement);
    for (const cell of getVehicleCells(placement)) {
      occupied.add(cellKey(cell));
    }
  }

  return vehicles;
}

function createVehicleShapes(vehicleCount: number, truckCount: number): VehicleShape[] {
  const shapes: VehicleShape[] = [];
  const truckIds = new Set<number>();
  while (truckIds.size < truckCount) {
    truckIds.add(Math.floor(Math.random() * (vehicleCount - 1)));
  }

  for (let i = 0; i < vehicleCount - 1; i++) {
    shapes.push({
      id: VEHICLE_IDS[i]!,
      length: truckIds.has(i) ? 3 : 2,
      orientation: Math.random() < 0.5 ? 'H' : 'V',
    });
  }

  return shuffle(shapes);
}

function placeRandomVehicle(
  shape: VehicleShape,
  size: number,
  occupied: Set<string>,
): PositionedVehicle | null {
  const placements: PositionedVehicle[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const vehicle = { ...shape, row, col };
      if (!isVehicleInBounds(vehicle, size)) continue;
      if (getVehicleCells(vehicle).some((cell) => occupied.has(cellKey(cell)))) continue;
      placements.push(vehicle);
    }
  }

  return placements.length > 0
    ? placements[Math.floor(Math.random() * placements.length)]!
    : null;
}

function scrambleSolvedLayout(
  solvedVehicles: PositionedVehicle[],
  size: number,
  scrambleMoves: number,
): PositionedVehicle[] {
  let vehicles = cloneVehicles(solvedVehicles);
  let previousMove: RushHourMove | null = null;
  const forcedTargetMoves = 1 + Math.floor(Math.random() * Math.max(1, size - 3));

  for (let step = 0; step < forcedTargetMoves; step++) {
    const move = { vehicleId: TARGET_ID, delta: -1 };
    const target = getTargetVehicle(vehicles);
    const occupied = buildOccupancy(vehicles);
    if (!canMove(target, move.delta, occupied, size)) break;
    vehicles = applyMove(vehicles, move);
    previousMove = move;
  }

  for (let step = 0; step < scrambleMoves; step++) {
    const moves = getLegalMoves(vehicles, size)
      .filter((move) => !previousMove || move.vehicleId !== previousMove.vehicleId || move.delta !== -previousMove.delta);
    const choices = moves.length > 0 ? moves : getLegalMoves(vehicles, size);
    if (choices.length === 0) break;

    const move = choices[Math.floor(Math.random() * choices.length)]!;
    vehicles = applyMove(vehicles, move);
    previousMove = move;
  }

  return vehicles;
}

function getLegalNeighborStates(
  vehicles: RushHourVehicle[],
  size: number,
): Array<{ move: RushHourMove; vehicles: PositionedVehicle[] }> {
  return getLegalMoves(vehicles, size).map((move) => ({
    move,
    vehicles: applyMove(vehicles, move),
  }));
}

function getLegalMoves(vehicles: RushHourVehicle[], size: number): RushHourMove[] {
  const occupied = buildOccupancy(vehicles);
  const moves: RushHourMove[] = [];

  for (const vehicle of vehicles) {
    for (const delta of [-1, 1]) {
      if (canMove(vehicle, delta, occupied, size)) {
        moves.push({ vehicleId: vehicle.id, delta });
      }
    }
  }

  return moves;
}

function canMove(
  vehicle: RushHourVehicle,
  delta: number,
  occupied: Map<string, string>,
  size: number,
): boolean {
  const front = getMoveFrontCell(vehicle, delta);
  if (front.row < 0 || front.row >= size || front.col < 0 || front.col >= size) return false;
  const occupant = occupied.get(cellKey(front));
  return occupant === undefined || occupant === vehicle.id;
}

function getMoveFrontCell(vehicle: RushHourVehicle, delta: number): { row: number; col: number } {
  if (vehicle.orientation === 'H') {
    return {
      row: vehicle.row,
      col: delta > 0 ? vehicle.col + vehicle.length : vehicle.col - 1,
    };
  }

  return {
    row: delta > 0 ? vehicle.row + vehicle.length : vehicle.row - 1,
    col: vehicle.col,
  };
}

function applyMove(vehicles: RushHourVehicle[], move: RushHourMove): PositionedVehicle[] {
  return sortVehicles(vehicles).map((vehicle) => {
    if (vehicle.id !== move.vehicleId) return { ...vehicle };
    return {
      ...vehicle,
      row: vehicle.orientation === 'V' ? vehicle.row + move.delta : vehicle.row,
      col: vehicle.orientation === 'H' ? vehicle.col + move.delta : vehicle.col,
    };
  });
}

function isSolved(vehicles: RushHourVehicle[], size: number): boolean {
  const target = getTargetVehicle(vehicles);
  return target.col + target.length === size;
}

function countTargetRowBlockers(vehicles: RushHourVehicle[], size: number): number {
  const target = getTargetVehicle(vehicles);
  const occupied = buildOccupancy(vehicles);
  const blockers = new Set<string>();

  for (let col = target.col + target.length; col < size; col++) {
    const occupant = occupied.get(cellKey({ row: target.row, col }));
    if (occupant && occupant !== target.id) {
      blockers.add(occupant);
    }
  }

  return blockers.size;
}

function getTargetVehicle(vehicles: RushHourVehicle[]): RushHourVehicle {
  const target = vehicles.find((vehicle) => vehicle.id === TARGET_ID || vehicle.isTarget);
  if (!target) {
    throw new Error('Rush Hour target vehicle is missing');
  }
  return target;
}

function buildOccupancy(vehicles: RushHourVehicle[]): Map<string, string> {
  const occupied = new Map<string, string>();
  for (const vehicle of vehicles) {
    for (const cell of getVehicleCells(vehicle)) {
      occupied.set(cellKey(cell), vehicle.id);
    }
  }
  return occupied;
}

function getVehicleCells(vehicle: RushHourVehicle): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = [];
  for (let i = 0; i < vehicle.length; i++) {
    cells.push({
      row: vehicle.row + (vehicle.orientation === 'V' ? i : 0),
      col: vehicle.col + (vehicle.orientation === 'H' ? i : 0),
    });
  }
  return cells;
}

function isVehicleInBounds(vehicle: RushHourVehicle, size: number): boolean {
  return getVehicleCells(vehicle).every(
    (cell) => cell.row >= 0 && cell.row < size && cell.col >= 0 && cell.col < size,
  );
}

function isValidRushHourLayout(vehicles: RushHourVehicle[], size: number): boolean {
  const occupied = new Set<string>();
  let targetCount = 0;

  for (const vehicle of vehicles) {
    if (
      !vehicle ||
      typeof vehicle.id !== 'string' ||
      (vehicle.orientation !== 'H' && vehicle.orientation !== 'V') ||
      !Number.isInteger(vehicle.row) ||
      !Number.isInteger(vehicle.col) ||
      !Number.isInteger(vehicle.length) ||
      vehicle.length < 2 ||
      !isVehicleInBounds(vehicle, size)
    ) {
      return false;
    }
    if (vehicle.id === TARGET_ID || vehicle.isTarget) targetCount++;
    for (const cell of getVehicleCells(vehicle)) {
      const key = cellKey(cell);
      if (occupied.has(key)) return false;
      occupied.add(key);
    }
  }

  return targetCount === 1;
}

function encodeState(vehicles: RushHourVehicle[]): string {
  return sortVehicles(vehicles)
    .map((vehicle) => `${vehicle.row},${vehicle.col}`)
    .join('|');
}

function decodeState(state: string, shapes: VehicleShape[]): PositionedVehicle[] {
  const positions = state.split('|');
  return shapes.map((shape, index) => {
    const [rawRow, rawCol] = positions[index]!.split(',');
    return {
      ...shape,
      row: Number(rawRow),
      col: Number(rawCol),
    };
  });
}

function reconstructSolution(
  solvedState: string,
  parent: Map<string, { previous: string; move: RushHourMove }>,
): RushHourMove[] {
  const moves: RushHourMove[] = [];
  let current = solvedState;

  while (parent.has(current)) {
    const entry = parent.get(current)!;
    moves.push(entry.move);
    current = entry.previous;
  }

  return moves.reverse();
}

function countVehicleMoves(solution: RushHourMove[]): number {
  let count = 0;
  let previous: RushHourMove | null = null;

  for (const move of solution) {
    if (!previous || previous.vehicleId !== move.vehicleId || Math.sign(previous.delta) !== Math.sign(move.delta)) {
      count++;
    }
    previous = move;
  }

  return count;
}

function cloneVehicles(vehicles: RushHourVehicle[]): PositionedVehicle[] {
  return vehicles.map((vehicle) => ({ ...vehicle }));
}

function sortVehicles<T extends RushHourVehicle>(vehicles: T[]): T[] {
  return [...vehicles].sort((a, b) => a.id.localeCompare(b.id));
}

function cellKey(cell: { row: number; col: number }): string {
  return `${cell.row},${cell.col}`;
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
