import { SIZE, type Barrier } from './engine.js';

export type Point = { x: number; y: number };
type Segment = { start: Point; end: Point };

export const PATH_WIDTH = .40;
export const PATH_OUTLINE_WIDTH = .45;

/** Preserve integer-grid joins; inset only ends that touch neither a wall nor the board edge. */
export function barrierSegments(barriers: readonly Barrier[]): Segment[] {
  const segments = barriers.map(([from, to]) => {
    const column = from % SIZE, row = Math.floor(from / SIZE);
    return to - from === 1
      ? { start: { x: column + 1, y: row }, end: { x: column + 1, y: row + 1 } }
      : { start: { x: column, y: row + 1 }, end: { x: column + 1, y: row + 1 } };
  });
  const endpointCounts = new Map<number, number>();
  const key = (point: Point) => point.y * (SIZE + 1) + point.x;
  for (const { start, end } of segments) {
    for (const point of [start, end]) endpointCounts.set(key(point), (endpointCounts.get(key(point)) ?? 0) + 1);
  }
  const connected = (point: Point) => point.x === 0 || point.x === SIZE || point.y === 0 || point.y === SIZE || endpointCounts.get(key(point))! > 1;
  return segments.map(({ start, end }) => {
    const dx = end.x - start.x, dy = end.y - start.y;
    return {
      start: connected(start) ? start : { x: start.x + dx * .13, y: start.y + dy * .13 },
      end: connected(end) ? end : { x: end.x - dx * .13, y: end.y - dy * .13 }
    };
  });
}

/** A circular quarter-turn tangent to two orthogonal segments. */
export function roundedCorner(a: Point, b: Point, c: Point): { entry: Point; exit: Point; radius: number; sweep: 0 | 1 } | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  const nextDx = c.x - b.x, nextDy = c.y - b.y;
  const incoming = Math.hypot(dx, dy), outgoing = Math.hypot(nextDx, nextDy);
  const cross = dx * nextDy - dy * nextDx;
  if (!incoming || !outgoing || !cross || dx * nextDx + dy * nextDy !== 0) return null;
  // Concentric stroke edges need a generous radius to keep the inside bend open.
  const radius = Math.min(.45, incoming / 2, outgoing / 2);
  return {
    entry: { x: b.x - dx / incoming * radius, y: b.y - dy / incoming * radius },
    exit: { x: b.x + nextDx / outgoing * radius, y: b.y + nextDy / outgoing * radius },
    radius,
    sweep: cross > 0 ? 1 : 0
  };
}

export function roundedPath(vertices: readonly Point[], start: number, end: number): string {
  let d = `M${vertices[start].x},${vertices[start].y}`;
  for (let index = start + 1; index < end; index++) {
    const b = vertices[index];
    const corner = roundedCorner(vertices[index - 1], b, vertices[index + 1]);
    if (!corner) d += `L${b.x},${b.y}`;
    else d += `L${corner.entry.x},${corner.entry.y}A${corner.radius},${corner.radius} 0 0 ${corner.sweep} ${corner.exit.x},${corner.exit.y}`;
  }
  return `${d}L${vertices[end].x},${vertices[end].y}`;
}
