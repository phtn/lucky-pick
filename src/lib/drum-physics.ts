export interface DrumBall {
  n: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export const DRUM_SIZE = 360;
const CENTER = DRUM_SIZE / 2;
const WALL_RADIUS = 165;

/** Balls shrink as the pool grows so a 6/58 chamber stays as readable as 6/42. */
export function ballRadius(count: number) {
  return Math.min(13, Math.sqrt((WALL_RADIUS * WALL_RADIUS * 0.34) / count));
}

export function createDrumBalls(count = 42): DrumBall[] {
  const radius = ballRadius(count);
  const spread = WALL_RADIUS - radius - 17;
  return Array.from({ length: count }, (_, i) => {
    const angle = i * 2.399963;
    const distance = Math.sqrt((i + 0.5) / count) * spread;
    return {
      n: i + 1,
      x: CENTER + Math.cos(angle) * distance,
      y: CENTER + Math.sin(angle) * distance,
      vx: Math.cos(angle + 1) * 32,
      vy: Math.sin(angle + 1) * 32,
      radius,
    };
  });
}

/** Velocity + gravity + reflected boundaries, inspired by the worker demo.
 * A fixed time step keeps the motion consistent on different refresh rates.
 */
export function stepDrum(balls: DrumBall[], dt: number, active: boolean, hidden: ReadonlySet<number>, time: number) {
  const visible = balls.filter(ball => !hidden.has(ball.n));
  const restitution = active ? 0.96 : 0.48;
  for (const ball of visible) {
    if (active) {
      // Air jets lift the balls from the base and circulate them through the globe.
      const lowerHalf = Math.max(0, (ball.y - 150) / 170);
      ball.vy += (110 - lowerHalf * 850 + Math.sin(time * 3 + ball.n) * 180) * dt;
      ball.vx += (Math.cos(time * 2.4 + ball.n * 1.7) * 300 - (ball.y - CENTER) * 1.7) * dt;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed < 155) {
        const angle = Math.atan2(ball.vy, ball.vx) || ball.n;
        ball.vx = Math.cos(angle) * 155;
        ball.vy = Math.sin(angle) * 155;
      } else if (speed > 380) {
        ball.vx *= 380 / speed;
        ball.vy *= 380 / speed;
      }
    } else {
      ball.vy += 330 * dt;
      ball.vx *= Math.exp(-0.65 * dt);
      ball.vy *= Math.exp(-0.15 * dt);
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
  }
  // Equal-mass ball collisions keep the numbers from passing through each other.
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i], b = visible[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const diameter = a.radius + b.radius;
      if (distance >= diameter) continue;
      const nx = distance > 0.001 ? dx / distance : 1;
      const ny = distance > 0.001 ? dy / distance : 0;
      const overlap = (diameter - distance) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;
      const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (approach > 0) {
        const impulse = approach * (1 + restitution) / 2;
        a.vx -= impulse * nx; a.vy -= impulse * ny;
        b.vx += impulse * nx; b.vy += impulse * ny;
      }
    }
  }
  for (const ball of visible) {
    const dx = ball.x - CENTER, dy = ball.y - CENTER;
    const distance = Math.hypot(dx, dy), limit = WALL_RADIUS - ball.radius;
    if (distance <= limit) continue;
    const nx = dx / distance, ny = dy / distance;
    ball.x = CENTER + nx * limit;
    ball.y = CENTER + ny * limit;
    const outward = ball.vx * nx + ball.vy * ny;
    if (outward > 0) {
      ball.vx -= (1 + restitution) * outward * nx;
      ball.vy -= (1 + restitution) * outward * ny;
    }
  }
}
