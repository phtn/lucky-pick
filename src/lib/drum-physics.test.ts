import { describe, expect, test } from 'bun:test';
import { DRUM_SIZE, stepDrum, type DrumBall } from './drum-physics';

const ball = (overrides: Partial<DrumBall>): DrumBall => ({
  n: 1,
  x: DRUM_SIZE / 2,
  y: DRUM_SIZE / 2,
  vx: 0,
  vy: 0,
  radius: 10,
  rotation: 0,
  angularVelocity: 0,
  ...overrides,
});

const kineticEnergy = (body: DrumBall) => {
  const mass = body.radius * body.radius;
  const inertia = 0.5 * mass * body.radius * body.radius;
  return 0.5 * mass * (body.vx * body.vx + body.vy * body.vy)
    + 0.5 * inertia * body.angularVelocity * body.angularVelocity;
};

describe('drum 2D collision solver', () => {
  test('head-on contact reflects both balls along the collision normal', () => {
    const a = ball({ n: 1, x: 170, vx: 100 });
    const b = ball({ n: 2, x: 189.5, vx: -100 });

    stepDrum([a, b], 0, false, new Set(), 0);

    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
  });

  test('glancing contact changes both x and y directions', () => {
    const a = ball({ n: 1, x: 170, y: 174, vx: 110, vy: 18 });
    const b = ball({ n: 2, x: 187, y: 184, vx: -25, vy: -8 });
    const before = { avx: a.vx, avy: a.vy, bvx: b.vx, bvy: b.vy };

    stepDrum([a, b], 0, true, new Set(), 0);

    expect(a.vx).not.toBeCloseTo(before.avx);
    expect(a.vy).not.toBeCloseTo(before.avy);
    expect(b.vx).not.toBeCloseTo(before.bvx);
    expect(b.vy).not.toBeCloseTo(before.bvy);
  });

  test('an angled wall hit reflects its normal speed and creates spin', () => {
    const body = ball({ x: DRUM_SIZE / 2 + 156, vx: 120, vy: 55 });

    stepDrum([body], 0, true, new Set(), 0);

    expect(body.vx).toBeLessThan(0);
    expect(Math.abs(body.angularVelocity)).toBeGreaterThan(0);
  });

  test('an unpowered contact does not add kinetic energy', () => {
    const a = ball({ n: 1, x: 170, y: 176, vx: 90, vy: 20, angularVelocity: 1.5 });
    const b = ball({ n: 2, x: 188, y: 183, vx: -45, vy: -15, angularVelocity: -0.5 });
    const before = kineticEnergy(a) + kineticEnergy(b);

    stepDrum([a, b], 0, false, new Set(), 0);

    expect(kineticEnergy(a) + kineticEnergy(b)).toBeLessThanOrEqual(before + 0.0001);
  });
});
