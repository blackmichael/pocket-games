import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { barrierSegments, PATH_OUTLINE_WIDTH, PATH_WIDTH, roundedCorner, roundedPath, type Point } from './geometry';

const encoder = new TextEncoder();

describe('barrier geometry', () => {
  it('trims only the two free ends of an isolated interior barrier', () => {
    const [vertical, horizontal] = barrierSegments([[7, 8], [21, 27]]);
    expect(vertical.start).toEqual({ x: 2, y: 1.13 });
    expect(vertical.end).toEqual({ x: 2, y: 1.87 });
    expect(horizontal.start).toEqual({ x: 3.13, y: 4 });
    expect(horizontal.end).toEqual({ x: 3.87, y: 4 });
  });

  it('joins collinear barriers without trimming their shared endpoint', () => {
    const [first, second] = barrierSegments([[7, 8], [13, 14]]);
    expect(first.end).toEqual({ x: 2, y: 2 });
    expect(second.start).toEqual(first.end);
    expect(first.start.y).toBeCloseTo(1.13);
    expect(second.end.y).toBeCloseTo(2.87);
  });

  it('joins perpendicular barriers at the canonical grid corner', () => {
    const [vertical, horizontal] = barrierSegments([[7, 8], [7, 13]]);
    expect(vertical.end).toEqual({ x: 2, y: 2 });
    expect(horizontal.end).toEqual(vertical.end);
    expect(horizontal.start.x).toBeCloseTo(1.13);
  });

  it('keeps every branch of a T junction connected without merging barriers', () => {
    const segments = barrierSegments([[7, 8], [13, 14], [7, 13]]);
    expect(segments).toHaveLength(3);
    expect(segments[0].end).toEqual({ x: 2, y: 2 });
    expect(segments[1].start).toEqual(segments[0].end);
    expect(segments[2].end).toEqual(segments[0].end);
  });

  it('connects barriers to all four board boundaries', () => {
    const [top] = barrierSegments([[0, 1]]);
    const [bottom] = barrierSegments([[30, 31]]);
    const [left] = barrierSegments([[0, 6]]);
    const [right] = barrierSegments([[5, 11]]);
    expect(top.start).toEqual({ x: 1, y: 0 });
    expect(bottom.end).toEqual({ x: 1, y: 6 });
    expect(left.start).toEqual({ x: 0, y: 1 });
    expect(right.end).toEqual({ x: 6, y: 1 });
    expect(top.end.y).toBeCloseTo(.87);
    expect(bottom.start.y).toBeCloseTo(5.13);
    expect(left.end.x).toBeCloseTo(.87);
    expect(right.start.x).toBeCloseTo(5.13);
  });

  it('renders no barriers for an unwalled puzzle', () => {
    expect(barrierSegments([])).toEqual([]);
  });
});

describe('rounded path corners', () => {
  const vertex = { x: 2.5, y: 2.5 };

  it('uses tangent circular quarter-turns with a noncollapsed inner outline in every orientation', () => {
    for (const incoming of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      for (const direction of [-1, 1]) {
        const outgoing = { x: -incoming.y * direction, y: incoming.x * direction };
        const a = { x: vertex.x - incoming.x, y: vertex.y - incoming.y };
        const c = { x: vertex.x + outgoing.x, y: vertex.y + outgoing.y };
        const corner = roundedCorner(a, vertex, c)!;
        expect(corner.radius - PATH_OUTLINE_WIDTH / 2).toBeGreaterThan(0);
        expect(corner.radius).toBeLessThanOrEqual(.5);
        expect(corner.sweep).toBe(direction > 0 ? 1 : 0);
        const center = { x: corner.entry.x + outgoing.x * corner.radius, y: corner.entry.y + outgoing.y * corner.radius };
        expect(Math.hypot(center.x - corner.entry.x, center.y - corner.entry.y)).toBeCloseTo(corner.radius);
        expect(Math.hypot(center.x - corner.exit.x, center.y - corner.exit.y)).toBeCloseTo(corner.radius);
        // Both tangencies sit on the original orthogonal centerlines.
        expect(corner.entry.x).toBeCloseTo(vertex.x - incoming.x * corner.radius);
        expect(corner.entry.y).toBeCloseTo(vertex.y - incoming.y * corner.radius);
        expect(corner.exit.x).toBeCloseTo(vertex.x + outgoing.x * corner.radius);
        expect(corner.exit.y).toBeCloseTo(vertex.y + outgoing.y * corner.radius);
      }
    }
  });

  it('leaves repeated, straight, and reversing vertices unrounded', () => {
    const a = { x: 1.5, y: 2.5 };
    for (const [first, last] of [[vertex, { x: 2.5, y: 3.5 }], [a, vertex], [a, { x: 3.5, y: 2.5 }], [a, a]]) {
      expect(roundedCorner(first, vertex, last)).toBeNull();
    }
  });

  it('clamps live short segments to half their length, remaining finite and within the route bounds', () => {
    for (const incomingLength of [.000001, .08, .3, 1]) {
      for (const outgoingLength of [.000001, .08, .3, 1]) {
        const a = { x: vertex.x - incomingLength, y: vertex.y };
        const c = { x: vertex.x, y: vertex.y + outgoingLength };
        const corner = roundedCorner(a, vertex, c)!;
        expect(corner.radius).toBeGreaterThan(0);
        expect(corner.radius).toBeLessThanOrEqual(Math.hypot(vertex.x - a.x, vertex.y - a.y) / 2);
        expect(corner.radius).toBeLessThanOrEqual(Math.hypot(c.x - vertex.x, c.y - vertex.y) / 2);
        for (const point of [corner.entry, corner.exit]) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
          expect(point.x).toBeGreaterThanOrEqual(a.x);
          expect(point.x).toBeLessThanOrEqual(c.x);
          expect(point.y).toBeGreaterThanOrEqual(a.y);
          expect(point.y).toBeLessThanOrEqual(c.y);
        }
      }
    }
  });

  it('prevents neighboring rounded corners from crossing on a short connecting segment', () => {
    const vertices: Point[] = [{ x: .5, y: .5 }, { x: 1.5, y: .5 }, { x: 1.5, y: .6 }, { x: 2.5, y: .6 }];
    const first = roundedCorner(vertices[0], vertices[1], vertices[2])!;
    const second = roundedCorner(vertices[1], vertices[2], vertices[3])!;
    expect(first.exit.x).toBe(second.entry.x);
    expect(first.exit.y).toBeLessThanOrEqual(second.entry.y);
    expect(first.radius + second.radius).toBeLessThanOrEqual(.1);
  });
});

describe('rendered circular bends', () => {
  const center = { x: .5, y: .5 };
  const orientations = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
    .flatMap(incoming => [-1, 1].map(direction => ({
      incoming,
      outgoing: { x: -incoming.y * direction, y: incoming.x * direction },
    })));

  async function rasterCorner(incoming: Point, outgoing: Point, pixels: number) {
    const vertices = [
      { x: center.x - incoming.x, y: center.y - incoming.y },
      center,
      { x: center.x + outgoing.x, y: center.y + outgoing.y }
    ];
    const path = roundedPath(vertices, 0, 2);
    const corner = roundedCorner(vertices[0], center, vertices[2])!;
    const arcCenter = {
      x: corner.entry.x + outgoing.x * corner.radius,
      y: corner.entry.y + outgoing.y * corner.radius
    };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels * 3}" height="${pixels * 3}" viewBox="-1 -1 3 3">
      <path d="${path}" fill="none" stroke="#26152d" stroke-width="${PATH_OUTLINE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${path}" fill="none" stroke="white" stroke-width="${PATH_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    return { ...await sharp(encoder.encode(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), arcCenter };
  }

  it.each([48, 96])('keeps elbows within the straight bands, with seamless ports and closed unused faces at %ipx per cell', async pixels => {
    for (const { incoming, outgoing } of orientations) {
      const { data, info, arcCenter } = await rasterCorner(incoming, outgoing, pixels);
      const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
      // Both stroke edges must follow one circle: no boxy, independently rounded patches.
      const step = 1 / (pixels * 4);
      for (let angleIndex = 0; angleIndex <= 8; angleIndex++) {
        const angle = angleIndex * Math.PI / 16;
        const dx = incoming.x * Math.sin(angle) - outgoing.x * Math.cos(angle);
        const dy = incoming.y * Math.sin(angle) - outgoing.y * Math.cos(angle);
        let painted = 0, colored = 0;
        for (let radius = 0; radius < 1; radius += step) {
          const x = Math.floor((arcCenter.x + dx * radius + 1) * pixels);
          const y = Math.floor((arcCenter.y + dy * radius + 1) * pixels);
          if (alpha(x, y) < 128) continue;
          painted += step;
          const offset = (y * info.width + x) * info.channels;
          if (data[offset] >= 240 && data[offset + 1] >= 240 && data[offset + 2] >= 240) colored += step;
        }
        expect(Math.abs(painted - PATH_OUTLINE_WIDTH)).toBeLessThan(3 / pixels);
        expect(Math.abs(colored - PATH_WIDTH)).toBeLessThan(3 / pixels);
      }

      const face = (normal: Point, outside: boolean) => {
        const sign = normal.x || normal.y;
        const fixed = sign > 0 ? pixels * 2 - (outside ? 0 : 1) : pixels - (outside ? 1 : 0);
        return Array.from({ length: pixels }, (_, index) =>
          normal.x ? alpha(fixed, pixels + index) : alpha(pixels + index, fixed));
      };
      for (const closed of [incoming, { x: -outgoing.x, y: -outgoing.y }]) {
        expect(Math.max(...face(closed, true))).toBeLessThanOrEqual(16);
        for (let y = 0; y < pixels; y++) {
          for (let x = 0; x < pixels; x++) {
            const distance = closed.x * ((x + .5) / pixels - .5) + closed.y * ((y + .5) / pixels - .5);
            if (distance > PATH_OUTLINE_WIDTH / 2 + 1 / pixels) {
              expect(alpha(pixels + x, pixels + y)).toBeLessThanOrEqual(16);
            }
          }
        }
      }
      for (const opened of [{ x: -incoming.x, y: -incoming.y }, outgoing]) {
        const port = face(opened, false);
        expect(Math.abs(port.filter(value => value >= 128).length - PATH_OUTLINE_WIDTH * pixels)).toBeLessThanOrEqual(3);
        expect(port[Math.floor(pixels / 2)]).toBe(255);
      }

      // A plum pixel well inside the opaque union would be a visible interior seam.
      const inset = Math.ceil(pixels * .06);
      for (let y = pixels; y < pixels * 2; y++) {
        for (let x = pixels; x < pixels * 2; x++) {
          if (alpha(x, y) < 250) continue;
          const interior = [-inset, 0, inset].every(dy =>
            [-inset, 0, inset].every(dx => alpha(x + dx, y + dy) >= 250));
          if (interior) {
            const offset = (y * info.width + x) * info.channels;
            expect(data[offset]).toBeGreaterThanOrEqual(240);
            expect(data[offset + 1]).toBeGreaterThanOrEqual(240);
            expect(data[offset + 2]).toBeGreaterThanOrEqual(240);
          }
        }
      }
    }
  });
});
