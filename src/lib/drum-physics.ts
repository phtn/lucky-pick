export interface DrumBall {
  n: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  angularVelocity: number;
}

export const DRUM_SIZE = 360;
export const MIN_DRUM_GRAVITY = 0.2;
export const MAX_DRUM_GRAVITY = 1.8;
export const DEFAULT_DRUM_GRAVITY = 0.5;
const CENTER = DRUM_SIZE / 2;
const WALL_RADIUS = 165;
const BOTTOM_WIND_STRENGTH = 1050;
const BOTTOM_WIND_FALLOFF = 7;
const SOLVER_ITERATIONS = 4;
const POSITION_SLOP = 0.01;

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
      rotation: angle * 0.7,
      angularVelocity: Math.sin(angle * 1.4) * 1.8,
    };
  });
}

function resolveBallCollision(a: DrumBall, b: DrumBall, restitution: number, friction: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const diameter = a.radius + b.radius;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= diameter * diameter) return;

  const distance = Math.sqrt(distanceSquared);
  // A deterministic fallback prevents coincident balls from always separating
  // along the same axis and introducing a visible rightward bias.
  const fallbackAngle = (a.n * 12.9898 + b.n * 78.233) % (Math.PI * 2);
  const nx = distance > 0.0001 ? dx / distance : Math.cos(fallbackAngle);
  const ny = distance > 0.0001 ? dy / distance : Math.sin(fallbackAngle);
  const tx = -ny;
  const ty = nx;
  const massA = a.radius * a.radius;
  const massB = b.radius * b.radius;
  const invMassA = 1 / massA;
  const invMassB = 1 / massB;
  const invMassSum = invMassA + invMassB;

  // Correct penetration independently of velocity so a dense pile cannot
  // accumulate overlap and explode apart on a later frame.
  const penetration = diameter - distance;
  const correction = Math.max(penetration - POSITION_SLOP, 0) * 0.82 / invMassSum;
  a.x -= nx * correction * invMassA;
  a.y -= ny * correction * invMassA;
  b.x += nx * correction * invMassB;
  b.y += ny * correction * invMassB;

  const relativeVx = b.vx - a.vx;
  const relativeVy = b.vy - a.vy;
  const normalSpeed = relativeVx * nx + relativeVy * ny;
  if (normalSpeed >= 0) return;

  // The normal impulse redirects each ball along the contact normal. This is
  // what makes glancing impacts deflect instead of merely swapping directions.
  const normalImpulse = -(1 + restitution) * normalSpeed / invMassSum;
  const impulseX = normalImpulse * nx;
  const impulseY = normalImpulse * ny;
  a.vx -= impulseX * invMassA;
  a.vy -= impulseY * invMassA;
  b.vx += impulseX * invMassB;
  b.vy += impulseY * invMassB;

  // Coulomb friction at the contact patch converts tangential slip into spin.
  const invInertiaA = 2 / (massA * a.radius * a.radius);
  const invInertiaB = 2 / (massB * b.radius * b.radius);
  const tangentSpeed = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty
    - b.angularVelocity * b.radius - a.angularVelocity * a.radius;
  const tangentMass = invMassSum
    + a.radius * a.radius * invInertiaA
    + b.radius * b.radius * invInertiaB;
  const unconstrainedFriction = -tangentSpeed / tangentMass;
  const maxFriction = friction * normalImpulse;
  const frictionImpulse = Math.max(-maxFriction, Math.min(maxFriction, unconstrainedFriction));
  a.vx -= frictionImpulse * tx * invMassA;
  a.vy -= frictionImpulse * ty * invMassA;
  b.vx += frictionImpulse * tx * invMassB;
  b.vy += frictionImpulse * ty * invMassB;
  a.angularVelocity -= a.radius * frictionImpulse * invInertiaA;
  b.angularVelocity -= b.radius * frictionImpulse * invInertiaB;
}

function resolveWallCollision(ball: DrumBall, restitution: number, friction: number) {
  const dx = ball.x - CENTER;
  const dy = ball.y - CENTER;
  const distance = Math.hypot(dx, dy);
  const limit = WALL_RADIUS - ball.radius;
  if (distance <= limit) return;

  const nx = distance > 0.0001 ? dx / distance : 0;
  const ny = distance > 0.0001 ? dy / distance : 1;
  const tx = -ny;
  const ty = nx;
  ball.x = CENTER + nx * limit;
  ball.y = CENTER + ny * limit;

  const outwardSpeed = ball.vx * nx + ball.vy * ny;
  if (outwardSpeed <= 0) return;
  const mass = ball.radius * ball.radius;
  const invMass = 1 / mass;
  const invInertia = 2 / (mass * ball.radius * ball.radius);
  const normalImpulse = (1 + restitution) * outwardSpeed / invMass;
  ball.vx -= normalImpulse * nx * invMass;
  ball.vy -= normalImpulse * ny * invMass;

  // The static chamber wall scrubs sideways speed and rolls the ball at impact.
  const contactSpeed = ball.vx * tx + ball.vy * ty + ball.angularVelocity * ball.radius;
  const tangentMass = invMass + ball.radius * ball.radius * invInertia;
  const unconstrainedFriction = -contactSpeed / tangentMass;
  const maxFriction = friction * normalImpulse;
  const frictionImpulse = Math.max(-maxFriction, Math.min(maxFriction, unconstrainedFriction));
  ball.vx += frictionImpulse * tx * invMass;
  ball.vy += frictionImpulse * ty * invMass;
  ball.angularVelocity += ball.radius * frictionImpulse * invInertia;
}

/** Gravity, a bottom-fed air column, and reflected boundaries.
 * A fixed time step keeps the motion consistent on different refresh rates.
 */
export function stepDrum(balls: DrumBall[], dt: number, active: boolean, hidden: ReadonlySet<number>, time: number, gravity = DEFAULT_DRUM_GRAVITY) {
  const visible = balls.filter(ball => !hidden.has(ball.n));
  const ballRestitution = active ? 0.88 : 0.5;
  const wallRestitution = active ? 0.82 : 0.42;
  const contactFriction = active ? 0.08 : 0.16;
  const gravityScale = Math.min(MAX_DRUM_GRAVITY, Math.max(MIN_DRUM_GRAVITY, gravity));
  for (const ball of visible) {
    const gravityForce = 330 * gravityScale;
    if (active) {
      // A narrow jet rises from the blower. It loses pressure with height while
      // the outer edges form the downward return path of the circulation loop.
      const horizontalOffset = (ball.x - CENTER) / (WALL_RADIUS - ball.radius);
      const heightFromBottom = Math.min(1, Math.max(0, (CENTER + WALL_RADIUS - ball.radius - ball.y) / (WALL_RADIUS * 2)));
      const jetProfile = Math.exp(-BOTTOM_WIND_FALLOFF * horizontalOffset * horizontalOffset);
      const heightPressure = 1 - heightFromBottom * 0.75;
      const gust = 0.9 + Math.sin(time * 4.2 + ball.n * 1.91) * 0.1;
      const lift = BOTTOM_WIND_STRENGTH * (0.1 + jetProfile * 0.9) * heightPressure * gust;
      const verticalPosition = (CENTER - ball.y) / WALL_RADIUS;
      const circulation = horizontalOffset * verticalPosition * 320;
      const turbulence = Math.sin(time * 3.1 + ball.n * 2.17) * 95;
      ball.vy += (gravityForce - lift) * dt;
      ball.vx += (circulation + turbulence) * dt;
      ball.vx *= Math.exp(-0.12 * dt);
      ball.vy *= Math.exp(-0.04 * dt);
      ball.angularVelocity += Math.sin(time * 2.7 + ball.n * 1.33) * 0.9 * dt;
      ball.angularVelocity *= Math.exp(-0.28 * dt);
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > 390) {
        ball.vx *= 390 / speed;
        ball.vy *= 390 / speed;
      }
    } else {
      ball.vy += gravityForce * dt;
      ball.vx *= Math.exp(-0.65 * dt);
      ball.vy *= Math.exp(-0.15 * dt);
      ball.angularVelocity *= Math.exp(-1.3 * dt);
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.rotation = (ball.rotation + ball.angularVelocity * dt) % (Math.PI * 2);
  }

  // Several sequential-impulse passes make simultaneous contacts in the pile
  // converge without one collision tunnelling through the next ball.
  for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration++) {
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        resolveBallCollision(visible[i], visible[j], ballRestitution, contactFriction);
      }
    }
    for (const ball of visible) {
      resolveWallCollision(ball, wallRestitution, contactFriction);
    }
  }

  for (const ball of visible) {
    ball.angularVelocity = Math.max(-12, Math.min(12, ball.angularVelocity));
  }
}
