/**
 * Jelly motion, ported line by line from Anivio's JellyMotion.kt
 * (github.com/mdtahseen7/Anivio, core/ui/jelly/JellyMotion.kt, GPL-3.0).
 *
 * Spring table (stiffness / dampingRatio), taken straight from Anivio:
 *   position  1000 / 1.0      velocity  300 / 0.5
 *   press     1000 / 1.0      scaleX    250 / 0.6
 *   scaleY    250 / 0.7       panel     300 / 1.0
 *   trackY / trackX / trackPress / glow: 240/0.9 (~266.67) / 0.6124
 *   (distortionDamping = 18 / (2 * sqrt(240 * 0.9)))
 *
 * Publish formulas (identical to Anivio):
 *   speed = velocity / 10
 *   pillScaleX = scaleX / (1 - clamp(speed * 0.75, +-0.2))
 *   pillScaleY = scaleY * (1 - clamp(speed * 0.25, +-0.2))
 *   contentScale = 1 + 0.2 * press
 *   press grow target 1.3, release when |position - target| < max(1, maxIndex) * 0.025
 *   tap rule: moved < 4dp = tab under finger, else floor(target + 0.5)
 *
 * THREADING (this is what crashed the last build — read carefully).
 * The crash was Reanimated Worklets: "Tried to synchronously call a
 * Remote Function. Called 'anonymous' on the UI Runtime", from a touch
 * event. A worklet (UI-runtime function) was called synchronously from
 * the JS thread. The rules that prevent it here:
 *
 * - Every motion function (select/begin/drag/finish/cancel/resize/
 *   advance) is a worklet, created once with useCallback so the reference
 *   is stable. They are NEVER called directly from JS. The only JS call
 *   sites are runOnUI(select) and runOnUI(resize), which schedule the
 *   worklet on the UI runtime asynchronously.
 * - The gesture callbacks (onBegin/onUpdate/onEnd/onFinalize) run as
 *   worklets on the UI thread. They call the motion worklets directly
 *   (worklet-to-worklet, same runtime) and use runOnJS only to notify
 *   the JS side (onSelect). The JS onSelect only sets React state; it
 *   never touches a shared value or calls a worklet.
 * - The frame callback is a worklet that calls advance (worklet).
 * - useAnimatedStyle callbacks only READ shared values; they never call
 *   a worklet function.
 * - Shared-value writes from JS (.value = ...) are allowed and are NOT
 *   worklet calls; the only such writes are the spring preset sync and
 *   the selected-index mirror, both plain assignments.
 * - All motion state lives in ONE shared value (`st`) holding a plain
 *   object. It is ONLY read and written from worklets (UI thread), so
 *   in-place mutation of its fields is safe. The published `frame` is a
 *   SEPARATE shared value that is REASSIGNED (new object) on every
 *   publish, which is what drives the UI.
 *
 * Crash guards (math):
 * - Every index is clamped to [0, maxIndex] (maxIndex = max(tabCount-1, 0)).
 * - tabWidth is max((width-8)/max(tabCount,1), 0); indexAt is only called
 *   when tabWidth > 0, so there is no division by zero.
 * - pillScaleX divides by (1 - clamp(speed*0.75, +-0.2)), which is in
 *   [0.8, 1.2] and can never be 0.
 * - The damping ratio is clamped inside advanceSpring (see JellySpring.ts),
 *   so no sqrt(negative) and no NaN can poison the springs.
 * - advance() clamps dt to [0, 0.064] and returns early when at rest.
 */

import { useCallback } from 'react';
import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  advanceSpring,
  jellyPanelOffset,
  jellyRubberBand,
  springIsAtRest,
} from './JellySpring';

export interface JellyFrame {
  position: number;
  pillScaleX: number;
  pillScaleY: number;
  contentScale: number;
  panelOffset: number;
  trackScale: number;
  trackScaleX: number;
  trackOffsetY: number;
  originX: number;
  glowY: number;
  glowOpacity: number;
}

export interface SpringScales {
  stiffness: number;
  damping: number;
}

const DISTORTION_DAMPING = 18 / (2 * Math.sqrt(240 * 0.9));
const TRACK_STIFFNESS = 240 / 0.9;

interface MotionState {
  position: number;
  positionVel: number;
  velocity: number;
  velocityVel: number;
  press: number;
  pressVel: number;
  scaleX: number;
  scaleXVel: number;
  scaleY: number;
  scaleYVel: number;
  panel: number;
  panelVel: number;
  trackY: number;
  trackYVel: number;
  trackX: number;
  trackXVel: number;
  trackPress: number;
  trackPressVel: number;
  glow: number;
  glowVel: number;
  target: number;
  pressTarget: number;
  shapeTarget: number;
  releasePending: boolean;
  dragging: boolean;
  running: boolean;
  downX: number;
  downY: number;
  dragStartTarget: number;
  dragStartPanel: number;
  dragStartY: number;
  movedDistance: number;
  originX: number;
  width: number;
  height: number;
  tabCount: number;
}

/** Module-level worklet helpers. They take the unwrapped state object, so
 *  no shared value is ever captured by a helper. */
function tabWidthOf(s: MotionState): number {
  'worklet';
  return Math.max((s.width - 8) / Math.max(s.tabCount, 1), 0);
}

function indexAt(s: MotionState, x: number): number {
  'worklet';
  const tw = tabWidthOf(s);
  const maxIndex = Math.max(s.tabCount - 1, 0);
  return Math.min(Math.max(Math.floor((x - 4) / tw), 0), maxIndex);
}

function publishFrame(s: MotionState, frame: SharedValue<JellyFrame>): void {
  'worklet';
  const speed = s.velocity / 10;
  const sx = Math.min(Math.max(speed * 0.75, -0.2), 0.2);
  const sy = Math.min(Math.max(speed * 0.25, -0.2), 0.2);
  frame.value = {
    position: s.position,
    pillScaleX: s.scaleX / (1 - sx),
    pillScaleY: s.scaleY * (1 - sy),
    contentScale: 1 + 0.2 * s.press,
    panelOffset: jellyPanelOffset(s.panel, s.width),
    trackScale: s.trackPress,
    trackScaleX: s.trackX,
    trackOffsetY: s.trackY,
    originX: s.originX,
    glowY: s.downY,
    glowOpacity: Math.min(Math.max(s.glow, 0), 1),
  };
}

export interface JellyMotionApi {
  frame: SharedValue<JellyFrame>;
  barWidth: SharedValue<number>;
  barHeight: SharedValue<number>;
  select: (index: number) => void;
  begin: (x: number, y: number) => void;
  drag: (dx: number, dy: number) => void;
  finish: () => number;
  cancel: (selectedIndex: number) => void;
  resize: (width: number, height: number, count: number) => void;
}

export function useJellyMotion(
  initialIndex: number,
  tabCount: number,
  springScales: SharedValue<SpringScales>,
): JellyMotionApi {
  const clampedInitial = Math.min(Math.max(initialIndex, 0), Math.max(tabCount - 1, 0));

  const st = useSharedValue<MotionState>({
    position: clampedInitial,
    positionVel: 0,
    velocity: 0,
    velocityVel: 0,
    press: 0,
    pressVel: 0,
    scaleX: 1,
    scaleXVel: 0,
    scaleY: 1,
    scaleYVel: 0,
    panel: 0,
    panelVel: 0,
    trackY: 0,
    trackYVel: 0,
    trackX: 1,
    trackXVel: 0,
    trackPress: 1,
    trackPressVel: 0,
    glow: 0,
    glowVel: 0,
    target: clampedInitial,
    pressTarget: 0,
    shapeTarget: 1,
    releasePending: false,
    dragging: false,
    running: false,
    downX: 0,
    downY: 0,
    dragStartTarget: clampedInitial,
    dragStartPanel: 0,
    dragStartY: 0,
    movedDistance: 0,
    originX: 0,
    width: 0,
    height: 64,
    tabCount,
  });

  const frame = useSharedValue<JellyFrame>({
    position: clampedInitial,
    pillScaleX: 1,
    pillScaleY: 1,
    contentScale: 1,
    panelOffset: 0,
    trackScale: 1,
    trackScaleX: 1,
    trackOffsetY: 0,
    originX: 0,
    glowY: 0,
    glowOpacity: 0,
  });

  const barWidth = useSharedValue(0);
  const barHeight = useSharedValue(64);

  const select = useCallback(
    (index: number): void => {
      'worklet';
      const s = st.value;
      s.dragging = false;
      const maxIndex = Math.max(s.tabCount - 1, 0);
      if (index >= 0) s.target = Math.min(index, maxIndex);
      s.releasePending = true;
      s.pressTarget = 0;
      s.shapeTarget = 1.0;
      s.running = true;
    },
    [st],
  );

  const begin = useCallback(
    (x: number, y: number): void => {
      'worklet';
      const s = st.value;
      s.downX = x;
      s.downY = Math.min(Math.max(y, 0), s.height);
      s.originX = Math.min(Math.max(s.downX, 0), s.width);
      s.dragStartY = s.trackY;
      s.movedDistance = 0;
      const tw = tabWidthOf(s);
      if (tw > 0) s.target = indexAt(s, s.downX);
      s.dragStartTarget = s.target;
      s.dragStartPanel = s.panel;
      s.dragging = true;
      s.releasePending = false;
      s.pressTarget = 1.0;
      s.shapeTarget = 1.3;
      s.panelVel = 0;
      s.running = true;
      publishFrame(s, frame);
    },
    [st, frame],
  );

  const drag = useCallback(
    (dx: number, dy: number): void => {
      'worklet';
      const s = st.value;
      if (!s.dragging) return;
      const tw = tabWidthOf(s);
      if (tw <= 0) return;
      const maxIndex = Math.max(s.tabCount - 1, 0);
      s.target = Math.min(Math.max(s.dragStartTarget + dx / tw, 0), maxIndex);
      s.panel = s.dragStartPanel + dx;
      s.panelVel = 0;
      s.trackY = s.dragStartY + jellyRubberBand(dy, s.height) * 0.25;
      s.trackYVel = 0;
      s.trackX = 1 - Math.min(Math.abs(dy) / 700, 1) * 0.08;
      s.trackXVel = 0;
      s.originX = Math.min(Math.max(s.downX + dx, 0), s.width);
      s.movedDistance = Math.max(s.movedDistance, Math.max(Math.abs(dx), Math.abs(dy)));
      publishFrame(s, frame);
    },
    [st, frame],
  );

  const finish = useCallback((): number => {
    'worklet';
    const s = st.value;
    const tw = tabWidthOf(s);
    const maxIndex = Math.max(s.tabCount - 1, 0);
    let index: number;
    if (s.movedDistance < 4 && tw > 0) {
      index = indexAt(s, s.downX);
    } else {
      index = Math.min(Math.max(Math.floor(s.target + 0.5), 0), maxIndex);
    }
    s.dragging = false;
    s.panelVel = 0;
    s.target = index;
    s.releasePending = true;
    s.running = true;
    return index;
  }, [st]);

  const cancel = useCallback(
    (selectedIndex: number): void => {
      'worklet';
      const s = st.value;
      s.dragging = false;
      s.panelVel = 0;
      select(selectedIndex);
    },
    [st, select],
  );

  const resize = useCallback(
    (width: number, height: number, count: number): void => {
      'worklet';
      const s = st.value;
      s.width = width;
      s.height = height;
      s.tabCount = count;
      const maxIndex = Math.max(count - 1, 0);
      s.target = Math.min(Math.max(s.target, 0), maxIndex);
      if (!s.dragging) s.originX = width / 2;
      barWidth.value = width;
      barHeight.value = height;
      publishFrame(s, frame);
    },
    [st, frame, barWidth, barHeight],
  );

  const advance = useCallback(
    (seconds: number): void => {
      'worklet';
      const s = st.value;
      if (!s.running && !s.dragging && !s.releasePending) return;
      const dt = Math.min(Math.max(seconds, 0), 0.064);
      if (dt <= 0) return;
      const ss = Math.max(springScales.value.stiffness, 0.05);
      const ds = springScales.value.damping;
      const maxIndex = Math.max(s.tabCount - 1, 0);
      s.target = Math.min(Math.max(s.target, 0), maxIndex);

      let r = advanceSpring(s.position, s.positionVel, s.target, dt, 1000 * ss, 1.0 * ds);
      s.position = r.value;
      s.positionVel = r.velocity;

      const velTarget = s.dragging && maxIndex > 0 ? s.positionVel / maxIndex : 0;
      r = advanceSpring(s.velocity, s.velocityVel, velTarget, dt, 300 * ss, 0.5 * ds);
      s.velocity = r.value;
      s.velocityVel = r.velocity;

      if (!s.dragging) {
        r = advanceSpring(s.panel, s.panelVel, 0, dt, 300 * ss, 1.0 * ds);
        s.panel = r.value;
        s.panelVel = r.velocity;
      }

      if (s.releasePending && Math.abs(s.position - s.target) < Math.max(1, maxIndex) * 0.025) {
        s.releasePending = false;
        s.pressTarget = 0;
        s.shapeTarget = 1.0;
      }

      r = advanceSpring(s.press, s.pressVel, s.pressTarget, dt, 1000 * ss, 1.0 * ds);
      s.press = r.value;
      s.pressVel = r.velocity;

      r = advanceSpring(s.scaleX, s.scaleXVel, s.shapeTarget, dt, 250 * ss, 0.6 * ds);
      s.scaleX = r.value;
      s.scaleXVel = r.velocity;

      r = advanceSpring(s.scaleY, s.scaleYVel, s.shapeTarget, dt, 250 * ss, 0.7 * ds);
      s.scaleY = r.value;
      s.scaleYVel = r.velocity;

      r = advanceSpring(
        s.trackPress,
        s.trackPressVel,
        s.dragging ? 1.025 : 1.0,
        dt,
        TRACK_STIFFNESS * ss,
        DISTORTION_DAMPING * ds,
      );
      s.trackPress = r.value;
      s.trackPressVel = r.velocity;

      r = advanceSpring(
        s.glow,
        s.glowVel,
        s.dragging ? 1.0 : 0.0,
        dt,
        TRACK_STIFFNESS * ss,
        DISTORTION_DAMPING * ds,
      );
      s.glow = r.value;
      s.glowVel = r.velocity;

      if (!s.dragging) {
        r = advanceSpring(s.trackY, s.trackYVel, 0, dt, TRACK_STIFFNESS * ss, DISTORTION_DAMPING * ds);
        s.trackY = r.value;
        s.trackYVel = r.velocity;
        r = advanceSpring(s.trackX, s.trackXVel, 1.0, dt, TRACK_STIFFNESS * ss, DISTORTION_DAMPING * ds);
        s.trackX = r.value;
        s.trackXVel = r.velocity;
        if (springIsAtRest(s.trackX, s.trackXVel, 1.0)) {
          s.originX = s.width / 2;
        }
      }

      publishFrame(s, frame);

      s.running =
        s.dragging ||
        s.releasePending ||
        !springIsAtRest(s.position, s.positionVel, s.target) ||
        !springIsAtRest(s.velocity, s.velocityVel, 0) ||
        !springIsAtRest(s.press, s.pressVel, 0) ||
        !springIsAtRest(s.scaleX, s.scaleXVel, 1) ||
        !springIsAtRest(s.scaleY, s.scaleYVel, 1) ||
        !springIsAtRest(s.panel, s.panelVel, 0) ||
        !springIsAtRest(s.trackY, s.trackYVel, 0) ||
        !springIsAtRest(s.trackX, s.trackXVel, 1) ||
        !springIsAtRest(s.trackPress, s.trackPressVel, 1) ||
        !springIsAtRest(s.glow, s.glowVel, 0);
    },
    [st, frame, springScales],
  );

  useFrameCallback((frameInfo) => {
    'worklet';
    advance((frameInfo.timeSincePreviousFrame ?? 0) / 1000);
  });

  return {
    frame,
    barWidth,
    barHeight,
    select,
    begin,
    drag,
    finish,
    cancel,
    resize,
  };
}
