/**
 * Analytic spring solver, ported line by line from Anivio's JellySpring.kt
 * (github.com/mdtahseen7/Anivio, core/ui/jelly/JellySpring.kt, GPL-3.0).
 *
 * Every function is a worklet so it can be called from Reanimated worklets.
 *
 * Safety notes (these guard the crash):
 * - The damping ratio is clamped to [0.05, 1.0] before use. The underdamped
 *   branch computes sqrt(1 - r^2); if r ever exceeded 1 that would be
 *   sqrt(negative) = NaN and the NaN would poison every spring value.
 *   r == 1.0 takes the critically-damped branch, so the clamp is exact.
 * - Stiffness is clamped to >= 1 so sqrt(stiffness) is always real.
 * - jellyRubberBand returns 0 when the dimension is <= 0 (no division by zero).
 * - jellyPanelOffset returns 0 when the width is <= 0 or the offset is 0.
 */

export interface SpringStep {
  value: number;
  velocity: number;
}

export function springIsAtRest(value: number, velocity: number, target: number): boolean {
  'worklet';
  return Math.abs(value - target) < 0.0001 && Math.abs(velocity) < 0.0001;
}

/**
 * Advance one spring by `seconds` toward `target`.
 * Returns the new { value, velocity }. Does not mutate its inputs.
 * Mirrors JellySpring.advance() exactly, including the critically-damped
 * branch (dampingRatio == 1.0) and the underdamped branch.
 */
export function advanceSpring(
  value: number,
  velocity: number,
  target: number,
  seconds: number,
  stiffness: number,
  dampingRatio: number,
): SpringStep {
  'worklet';
  const r = Math.min(Math.max(dampingRatio, 0.05), 1.0);
  const s = Math.max(stiffness, 1);
  if (Math.abs(value - target) < 0.0001 && Math.abs(velocity) < 0.0001) {
    return { value: target, velocity: 0 };
  }
  const displacement = value - target;
  const frequency = Math.sqrt(s);
  if (r === 1.0) {
    const decay = Math.exp(-frequency * seconds);
    const coefficient = velocity + frequency * displacement;
    return {
      value: target + (displacement + coefficient * seconds) * decay,
      velocity: (velocity - frequency * coefficient * seconds) * decay,
    };
  }
  const damping = r * frequency;
  const damped = frequency * Math.sqrt(1 - r * r);
  const decay = Math.exp(-damping * seconds);
  const cosine = Math.cos(damped * seconds);
  const sine = Math.sin(damped * seconds);
  const positionCoefficient = (velocity + damping * displacement) / damped;
  const velocityCoefficient = (damping * velocity + s * displacement) / damped;
  return {
    value: target + decay * (displacement * cosine + positionCoefficient * sine),
    velocity: decay * (velocity * cosine - velocityCoefficient * sine),
  };
}

/** Mirrors jellyRubberBand(). */
export function jellyRubberBand(distance: number, dimension: number): number {
  'worklet';
  if (distance === 0 || dimension <= 0) return 0;
  const damped = (1 - 1 / (Math.abs(distance) * 0.14 / dimension + 1)) * dimension;
  return distance < 0 ? -damped : damped;
}

/**
 * Mirrors jellyPanelOffset(). Inverts a cubic bezier (control x 0.58) by
 * 10 bisection steps, then eases. Returns a panel offset in dp, max +/-4.
 */
export function jellyPanelOffset(rawOffset: number, width: number): number {
  'worklet';
  if (width <= 0 || rawOffset === 0) return 0;
  const fraction = Math.min(Math.max(rawOffset / width, -1), 1);
  const x = Math.abs(fraction);
  let low = 0;
  let high = 1;
  let parameter = x;
  for (let i = 0; i < 10; i++) {
    const bezierX = parameter * parameter * (3 * (1 - parameter) * 0.58 + parameter);
    if (bezierX < x) {
      low = parameter;
    } else {
      high = parameter;
    }
    parameter = (low + high) / 2;
  }
  const eased = parameter * parameter * (3 * (1 - parameter) + parameter);
  return (fraction < 0 ? -4 : 4) * eased;
}
