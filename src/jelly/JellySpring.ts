import type { SharedValue } from 'react-native-reanimated';

/**
 * Analytic damped spring solver, ported from Anivio's JellySpring
 * (composeApp/src/androidMain/kotlin/com/nuvio/app/core/ui/jelly/JellySpring.kt).
 * Closed-form solution for a damped harmonic oscillator, stable at any frame
 * delta. Mass is 1, so frequency = sqrt(stiffness).
 */

const REST_EPSILON = 0.0001;

export function jellySpringIsAtRest(
  value: SharedValue<number>,
  velocity: SharedValue<number>,
  target: number,
): boolean {
  'worklet';
  return (
    Math.abs(value.value - target) < REST_EPSILON &&
    Math.abs(velocity.value) < REST_EPSILON
  );
}

export function jellySpringSnapTo(
  value: SharedValue<number>,
  velocity: SharedValue<number>,
  target: number,
): void {
  'worklet';
  value.value = target;
  velocity.value = 0;
}

export function jellySpringAdvance(
  value: SharedValue<number>,
  velocity: SharedValue<number>,
  target: number,
  stiffness: number,
  dampingRatio: number,
  seconds: number,
): void {
  'worklet';
  if (jellySpringIsAtRest(value, velocity, target)) {
    jellySpringSnapTo(value, velocity, target);
    return;
  }
  const displacement = value.value - target;
  const frequency = Math.sqrt(stiffness);
  if (dampingRatio === 1.0) {
    // Critically damped branch
    const decay = Math.exp(-frequency * seconds);
    const coefficient = velocity.value + frequency * displacement;
    value.value = target + (displacement + coefficient * seconds) * decay;
    velocity.value = (velocity.value - frequency * coefficient * seconds) * decay;
  } else {
    // Underdamped branch
    const damping = dampingRatio * frequency;
    const damped = frequency * Math.sqrt(1 - dampingRatio * dampingRatio);
    const decay = Math.exp(-damping * seconds);
    const cosine = Math.cos(damped * seconds);
    const sine = Math.sin(damped * seconds);
    const positionCoefficient = (velocity.value + damping * displacement) / damped;
    const velocityCoefficient =
      (damping * velocity.value + stiffness * displacement) / damped;
    value.value =
      target + decay * (displacement * cosine + positionCoefficient * sine);
    velocity.value =
      decay * (velocity.value * cosine - velocityCoefficient * sine);
  }
}

/** Asymptotic rubber band: approaches but never exceeds `dimension`. */
export function jellyRubberBand(distance: number, dimension: number): number {
  'worklet';
  if (distance === 0 || dimension <= 0) return 0;
  const damped =
    (1 - 1 / ((Math.abs(distance) * 0.14) / dimension + 1)) * dimension;
  return distance < 0 ? -damped : damped;
}

/**
 * Maps a raw pixel drag into a ±4 dp eased offset: cubic-bezier solve
 * (x-control 0.58, 10 bisection steps) followed by smoothstep.
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
    const bezierX =
      parameter * parameter * (3 * (1 - parameter) * 0.58 + parameter);
    if (bezierX < x) low = parameter;
    else high = parameter;
    parameter = (low + high) / 2;
  }
  const eased = parameter * parameter * (3 * (1 - parameter) + parameter);
  return (fraction < 0 ? -4 : 4) * eased;
}
