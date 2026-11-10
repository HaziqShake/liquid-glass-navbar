import { Dimensions } from 'react-native';
import { useSharedValue, useFrameCallback } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import {
  jellySpringAdvance,
  jellySpringIsAtRest,
  jellySpringSnapTo,
  jellyRubberBand,
} from './JellySpring';
import type { NavbarSettings } from '../settings/settings';

/**
 * Jelly spring physics, ported from Anivio's JellyMotion
 * (composeApp/src/androidMain/kotlin/com/nuvio/app/core/ui/jelly/JellyMotion.kt).
 *
 * Eleven coupled springs drive the pill. The numbers map 1:1 to Reanimated:
 * Reanimated's spring model uses the same stiffness + damping ratio with
 * mass 1. The frame loop advances them with an analytic solver and sleeps
 * when every spring is at rest, exactly like Anivio's withFrameNanos loop.
 *
 * All spring configs come from the settings shared value, so the settings
 * sheet can retune them live. Defaults are Anivio's table:
 *   position   1000,   1.0    pill center, critically damped, no overshoot
 *   velocity   300,    0.5    tracks position velocity, drives squash/stretch
 *   press      1000,   1.0    0 to 1 while the finger is down
 *   scaleX     250,    0.6    pill X scale, 1.0 resting / 1.3 pressed
 *   scaleY     250,    0.7    pill Y scale, same targets, settles out of
 *                             phase with X (the jelly wobble)
 *   panel      300,    1.0    raw horizontal drag offset for the panel lag
 *   trackY, trackX, trackPress, glow
 *              266.67, 0.612  whole-bar distortion springs
 */

/** Whole-bar swell while dragging. */
export const JELLY_TRACK_PRESS = 1.025;
/** Frame delta clamp, seconds. */
export const JELLY_MAX_DT = 0.064;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function useSpringPair(initialValue: number) {
  const value = useSharedValue(initialValue);
  const velocity = useSharedValue(0);
  return { value, velocity };
}

export interface JellyMotion {
  position: SharedValue<number>;
  positionVelocity: SharedValue<number>;
  velocity: SharedValue<number>;
  velocityVelocity: SharedValue<number>;
  press: SharedValue<number>;
  pressVelocity: SharedValue<number>;
  scaleX: SharedValue<number>;
  scaleXVelocity: SharedValue<number>;
  scaleY: SharedValue<number>;
  scaleYVelocity: SharedValue<number>;
  panel: SharedValue<number>;
  panelVelocity: SharedValue<number>;
  trackY: SharedValue<number>;
  trackYVelocity: SharedValue<number>;
  trackX: SharedValue<number>;
  trackXVelocity: SharedValue<number>;
  trackPress: SharedValue<number>;
  trackPressVelocity: SharedValue<number>;
  glow: SharedValue<number>;
  glowVelocity: SharedValue<number>;
  positionTarget: SharedValue<number>;
  pressTarget: SharedValue<number>;
  shapeTarget: SharedValue<number>;
  dragging: SharedValue<boolean>;
  releasePending: SharedValue<boolean>;
  originX: SharedValue<number>;
  glowY: SharedValue<number>;
  /** Finger down, bar-space coordinates. */
  begin: (
    barX: number,
    barY: number,
    barHeight: number,
    slotWidth: number,
    maxIndex: number,
    barWidth: number,
  ) => void;
  /** Finger moved, dx/dy are deltas from the down point. */
  drag: (
    dx: number,
    dy: number,
    slotWidth: number,
    maxIndex: number,
    barWidth: number,
    barHeight: number,
  ) => void;
  /** Finger up. Returns the index to navigate to. */
  finish: (slotWidth: number, maxIndex: number) => number;
  /** Programmatic tab change (tap on a tab). Pulses the pill like a tap. */
  select: (index: number) => void;
  wake: () => void;
}

export function useJellyMotion(
  initialIndex: number,
  itemCount: number,
  settings: SharedValue<NavbarSettings>,
): JellyMotion {
  const maxIndex = Math.max(itemCount - 1, 0);

  const position = useSpringPair(initialIndex);
  const velocity = useSpringPair(0);
  const press = useSpringPair(0);
  const scaleX = useSpringPair(1);
  const scaleY = useSpringPair(1);
  const panel = useSpringPair(0);
  const trackY = useSpringPair(0);
  const trackX = useSpringPair(1);
  const trackPress = useSpringPair(1);
  const glow = useSpringPair(0);

  const positionTarget = useSharedValue(initialIndex);
  const pressTarget = useSharedValue(0);
  const shapeTarget = useSharedValue(1);
  const dragging = useSharedValue(false);
  const releasePending = useSharedValue(false);
  const downBarX = useSharedValue(0);
  const downBarY = useSharedValue(0);
  const dragStartTarget = useSharedValue(initialIndex);
  const dragStartPanel = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const movedDistance = useSharedValue(0);
  const originX = useSharedValue((SCREEN_WIDTH * 0.9) / 2);
  const glowY = useSharedValue(0);

  const indexAt = (x: number, slotWidth: number) => {
    'worklet';
    return Math.min(Math.max(Math.floor(x / slotWidth), 0), maxIndex);
  };

  const computeRunning = () => {
    'worklet';
    return (
      dragging.value ||
      releasePending.value ||
      !jellySpringIsAtRest(position.value, position.velocity, positionTarget.value) ||
      !jellySpringIsAtRest(velocity.value, velocity.velocity, 0) ||
      !jellySpringIsAtRest(press.value, press.velocity, 0) ||
      !jellySpringIsAtRest(scaleX.value, scaleX.velocity, 1) ||
      !jellySpringIsAtRest(scaleY.value, scaleY.velocity, 1) ||
      !jellySpringIsAtRest(panel.value, panel.velocity, 0) ||
      !jellySpringIsAtRest(trackY.value, trackY.velocity, 0) ||
      !jellySpringIsAtRest(trackX.value, trackX.velocity, 1) ||
      !jellySpringIsAtRest(trackPress.value, trackPress.velocity, 1) ||
      !jellySpringIsAtRest(glow.value, glow.velocity, 0)
    );
  };

  const advance = (seconds: number) => {
    'worklet';
    const cfg = settings.value;
    const delta = Math.min(Math.max(seconds, 0), JELLY_MAX_DT);
    positionTarget.value = Math.min(
      Math.max(positionTarget.value, 0),
      maxIndex,
    );
    jellySpringAdvance(
      position.value,
      position.velocity,
      positionTarget.value,
      cfg.positionStiffness,
      cfg.positionDamping,
      delta,
    );
    jellySpringAdvance(
      velocity.value,
      velocity.velocity,
      dragging.value && maxIndex > 0
        ? position.velocity.value / maxIndex
        : 0,
      cfg.velocityStiffness,
      cfg.velocityDamping,
      delta,
    );
    if (!dragging.value) {
      jellySpringAdvance(
        panel.value,
        panel.velocity,
        0,
        cfg.panelStiffness,
        1.0,
        delta,
      );
    }
    // The settle trick: only relax from the press grow back to 1.0 once the
    // pill is nearly home, so the squash happens at the destination, not
    // mid-flight.
    if (
      releasePending.value &&
      Math.abs(position.value.value - positionTarget.value) <
        Math.max(1, maxIndex) * cfg.settleFraction
    ) {
      releasePending.value = false;
      pressTarget.value = 0;
      shapeTarget.value = 1;
    }
    jellySpringAdvance(
      press.value,
      press.velocity,
      pressTarget.value,
      1000,
      1.0,
      delta,
    );
    jellySpringAdvance(
      scaleX.value,
      scaleX.velocity,
      shapeTarget.value,
      cfg.scaleStiffness,
      cfg.scaleXDamping,
      delta,
    );
    jellySpringAdvance(
      scaleY.value,
      scaleY.velocity,
      shapeTarget.value,
      cfg.scaleStiffness,
      cfg.scaleYDamping,
      delta,
    );
    jellySpringAdvance(
      trackPress.value,
      trackPress.velocity,
      cfg.trackEnabled && dragging.value ? JELLY_TRACK_PRESS : 1.0,
      cfg.trackStiffness,
      cfg.trackDamping,
      delta,
    );
    jellySpringAdvance(
      glow.value,
      glow.velocity,
      cfg.glowEnabled && dragging.value ? 1.0 : 0.0,
      cfg.trackStiffness,
      cfg.trackDamping,
      delta,
    );
    if (!dragging.value) {
      jellySpringAdvance(
        trackY.value,
        trackY.velocity,
        0,
        cfg.trackStiffness,
        cfg.trackDamping,
        delta,
      );
      jellySpringAdvance(
        trackX.value,
        trackX.velocity,
        1,
        cfg.trackStiffness,
        cfg.trackDamping,
        delta,
      );
      if (jellySpringIsAtRest(trackX.value, trackX.velocity, 1)) {
        originX.value = (SCREEN_WIDTH * cfg.barWidthPct) / 2;
      }
    }
  };

  const frameCallback = useFrameCallback((frameInfo) => {
    'worklet';
    const dt = Math.min(
      (frameInfo.timeSincePreviousFrame ?? 16.7) / 1000,
      JELLY_MAX_DT,
    );
    advance(dt);
    if (!computeRunning()) {
      frameCallback.setActive(false);
    }
  }, false);

  const wake = () => {
    frameCallback.setActive(true);
  };

  const begin = (
    barX: number,
    barY: number,
    barHeight: number,
    slotWidth: number,
    maxIndexArg: number,
    barWidth: number,
  ) => {
    'worklet';
    downBarX.value = barX;
    downBarY.value = Math.min(Math.max(barY, 0), barHeight);
    glowY.value = downBarY.value;
    originX.value = Math.min(Math.max(barX, 0), barWidth);
    dragStartY.value = trackY.value.value;
    movedDistance.value = 0;
    if (slotWidth > 0) {
      positionTarget.value = indexAt(barX, slotWidth);
    }
    dragStartTarget.value = positionTarget.value;
    dragStartPanel.value = panel.value.value;
    dragging.value = true;
    releasePending.value = false;
    pressTarget.value = 1;
    shapeTarget.value = settings.value.pressScale;
    panel.velocity.value = 0;
    wake();
  };

  const drag = (
    dx: number,
    dy: number,
    slotWidth: number,
    maxIndexArg: number,
    barWidth: number,
    barHeight: number,
  ) => {
    'worklet';
    if (!dragging.value || slotWidth <= 0) return;
    const cfg = settings.value;
    positionTarget.value = Math.min(
      Math.max(dragStartTarget.value + dx / slotWidth, 0),
      maxIndexArg,
    );
    if (cfg.panelLagEnabled) {
      jellySpringSnapTo(panel.value, panel.velocity, dragStartPanel.value + dx);
    }
    if (cfg.trackEnabled) {
      jellySpringSnapTo(
        trackY.value,
        trackY.velocity,
        dragStartY.value + jellyRubberBand(dy, barHeight) * 0.25,
      );
      jellySpringSnapTo(
        trackX.value,
        trackX.velocity,
        1 - Math.min(Math.abs(dy) / 700, 1) * 0.08,
      );
    }
    originX.value = Math.min(
      Math.max(downBarX.value + dx, 0),
      barWidth,
    );
    movedDistance.value = Math.max(
      movedDistance.value,
      Math.max(Math.abs(dx), Math.abs(dy)),
    );
  };

  const finish = (slotWidth: number, maxIndexArg: number) => {
    'worklet';
    const index =
      movedDistance.value < settings.value.tapThreshold && slotWidth > 0
        ? indexAt(downBarX.value, slotWidth)
        : Math.min(
            Math.max(Math.floor(positionTarget.value + 0.5), 0),
            maxIndexArg,
          );
    dragging.value = false;
    panel.velocity.value = 0;
    positionTarget.value = index;
    releasePending.value = true;
    wake();
    return index;
  };

  const select = (index: number) => {
    'worklet';
    positionTarget.value = index;
    pressTarget.value = 1;
    shapeTarget.value = settings.value.pressScale;
    releasePending.value = true;
    wake();
  };

  return {
    position: position.value,
    positionVelocity: position.velocity,
    velocity: velocity.value,
    velocityVelocity: velocity.velocity,
    press: press.value,
    pressVelocity: press.velocity,
    scaleX: scaleX.value,
    scaleXVelocity: scaleX.velocity,
    scaleY: scaleY.value,
    scaleYVelocity: scaleY.velocity,
    panel: panel.value,
    panelVelocity: panel.velocity,
    trackY: trackY.value,
    trackYVelocity: trackY.velocity,
    trackX: trackX.value,
    trackXVelocity: trackX.velocity,
    trackPress: trackPress.value,
    trackPressVelocity: trackPress.velocity,
    glow: glow.value,
    glowVelocity: glow.velocity,
    positionTarget,
    pressTarget,
    shapeTarget,
    dragging,
    releasePending,
    originX,
    glowY,
    begin,
    drag,
    finish,
    select,
    wake,
  };
}
