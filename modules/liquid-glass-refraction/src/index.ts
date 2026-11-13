// SPDX-License-Identifier: GPL-3.0
//
// TypeScript wrapper for the native hardware liquid-glass view.
// Android only: on any other platform this renders nothing (the
// native view manager does not exist there, so guard usage with
// Platform.OS === 'android' and API >= 33).
//
// HOW IT WORKS (build 4, rewritten from scratch 12 Nov 2026).
// Builds 1-3 put a RenderEffect on an EMPTY native view and expected
// its AGSL shader to sample the backdrop behind the view. Android's
// RenderEffect.createRuntimeShaderEffect binds the shader's uniform
// to the contents of the RenderNode the effect sits on — the view's
// OWN drawing, never the pixels behind it — so the shader input was
// transparent and no refraction could ever appear, at any size.
// GlassView fixes the mechanism instead of the wiring:
//   1. onPreDraw it captures the root view ONCE per frame into ONE
//      shared half-resolution bitmap (SharedBackdrop), skipping
//      every glass view so there is no feedback loop;
//   2. in onDraw it records a hardware RenderNode that draws the
//      captured bitmap cropped to this view's rectangle, sets a
//      RenderEffect on THAT node (blur FIRST, then the AGSL material
//      — the library's order — for both modes; the droplet's blur
//      stays on while it is held — build 10, it no longer drops to
//      0), and draws the node. The
//      shader's `backdrop` uniform is the node's recorded
//      content — real backdrop pixels — so the bend is real.
//   3. A cheap sampled hash of this view's rectangle in the bitmap
//      skips recapture and re-invalidation entirely when the backdrop
//      under the view did not change, so a static screen costs zero
//      capture work.
//
// PERFORMANCE. One shared bitmap per root per frame (bar + droplet
// share it, never one capture each); capture at scale 2; BUILD 11:
// capture only the STRIP behind the glass (union of the glass
// rects + 16dp margin), never the full root; capture only in
// onPreDraw and only while shown; bitmap freed when the last glass
// view unmounts; shader work only over the pill areas, never
// fullscreen. No expo-blur in the bar path: the RenderEffect
// chain does the blur (bar only) and the refraction in one GPU
// pass. No extra dependencies.
//
// INTEGRATION. Render GlassView INSIDE the bar's overflow-hidden
// container, above nothing and below the veil/icons, laid out 24dp
// larger than the pill on every side — the host-view wrapper
// carries the animated size (pill + 48dp, at left/top -24dp) and
// the native view inside takes StyleSheet.absoluteFill — so the
// shader's 24dp `outset` region is available and the container
// clips it to the pill shape. The glass shader is ONE unified
// source (build 9) porting the displacement model of
// react-native-liquid-glassmorphism (the library the Pioneer Gym
// live app used); the droplet is the same glass over a slot-width
// capsule. Fallback below API 33: a plain tinted pill via
// expo-blur (bar) / nothing (droplet) — never a crash, never a
// fake white circle.

import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import type { StyleProp, ViewStyle } from 'react-native';

export type GlassViewProps = {
  /** "bar" = capsule glass with tint + rim sheen + blur; "droplet" =
   *  the SAME glass over a slot-width capsule. At rest the droplet
   *  has NO magnification (magnification 1.0); only while held
   *  does it zoom uniformly to `magnification`. BUILD 10: the
   *  droplet keeps its blur on hold (it no longer drops to 0). */
  mode?: 'bar' | 'droplet';
  /** Strength of the bar's rim sheen / highlight. BUILD 10
   *  default 0.5 (was 1.0). Also gates the refraction (0 = no
   *  bend, no sheen); the bend magnitude is NOT scaled by it. */
  glowStrength?: number;
  /** BUILD 8 DIAGNOSTIC. Multiplies the bar shader's coherent
   *  displacement (iLens * bend * bendScale). Default 1.0 = the
   *  shipped look. Set to 3.0 only when the bendDiagnostic setting
   *  is ON, to prove on device whether ANY displacement reaches
   *  the screen. Never the shipped look by default. The droplet
   *  mode ignores it (always 1.0). */
  bendScale?: number;
  /** Mix of the tint colour into the sampled backdrop. Build 6: 0.15
   *  (clear glass). Not a user setting. */
  tintMix?: number;
  /** Tint colour the bar shader mixes in: dark [28/255, 28/255,
   *  30/255] or white [1, 1, 1]. Follows the navbar mode. */
  tintColor?: [number, number, number];
  /** BUILD 9: the droplet's HOLD magnification M — one uniform
   *  scale factor about the droplet centre (a plain zoom, no
   *  fisheye, no per-channel split). At rest the droplet renders
   *  at 1.0 (no magnification at all, same glass as the bar);
   *  only while `held` is true does it zoom to M. Default 1.35.
   *  The bar ignores it (always 1.0). BUILD 10: holding keeps
   *  the droplet's blur — the ONLY change on hold is this zoom. */
  magnification?: number;
  /** BUILD 9: the droplet's hold state. A plain boolean prop; the
   *  native side eases magnification 1 -> M over ~200ms itself,
   *  so no animated props ever touch this native view. BUILD 10:
   *  the blur does NOT drop to 0 while held anymore. The bar
   *  ignores it. */
  held?: boolean;
  /** Bar blur radius in dp for the chain blur effect (blur FIRST,
   *  material second — the library's order). BUILD 10: the
   *  droplet keeps this blur at rest AND on hold. Default 3.3dp
   *  (Blur setting 55). */
  blurRadius?: number;
  /** BUILD 11 (SDK 54): StyleProp, not bare ViewStyle — a
   *  RegisteredStyle (e.g. StyleSheet.absoluteFill) is assignable
   *  to StyleProp but not to a bare ViewStyle, and tsc on RN 0.81
   *  rejects it. */
  style?: StyleProp<ViewStyle>;
};

// Verified against the installed expo-modules-core 57.0.25: SDK 57
// exposes `requireNativeViewManager(moduleName, viewName)`; there is
// no `requireNativeView` export in this version.
export const GlassView = requireNativeViewManager<GlassViewProps>(
  'LiquidGlassRefraction',
  'GlassView',
);

// BUILD 6 verification aid. The native glass state as a two-line
// string, for the on-screen debug readout in the DemoScreen:
//   "cap 540x1200 barcap 540x72 | nav Y hid Y | drawn bar Y drop Y (bar)
//    hash 1a2b3c4d | rect 24,890,372,1012"
// cap = shared backdrop bitmap size; barcap = BUILD 12 second strip
// bitmap size (bar-included, droplet hold only; "—" at rest, which
// is expected — the second capture is skipped entirely until held);
// nav = a navbar root was found; hid = it was actually hidden during
// the last capture; drawn bar / drop = the RenderEffect path drew at
// least once, PER MODE (build 9: the old single flag reported only
// the last mode drawn, so the bar's own status was never separately
// proven); hash/rect = the last backdrop hash and this view's
// rectangle in the bitmap.
// REMOVE before final delivery, with the readout and GlassDebugState.
const GlassModule = requireNativeModule<{
  getGlassDebug: () => Promise<string>;
}>('LiquidGlassRefraction');

export async function getGlassDebug(): Promise<string> {
  return GlassModule.getGlassDebug();
}
