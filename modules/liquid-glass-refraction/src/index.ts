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
//      RenderEffect on THAT node (blur chain + AGSL material for the
//      bar, AGSL material alone for the droplet), and draws the
//      node. The shader's `backdrop` uniform is the node's recorded
//      content — real backdrop pixels — so the bend is real.
//   3. A cheap sampled hash of this view's rectangle in the bitmap
//      skips recapture and re-invalidation entirely when the backdrop
//      under the view did not change, so a static screen costs zero
//      capture work.
//
// PERFORMANCE. One shared bitmap per root per frame (bar + droplet
// share it, never one capture each); capture at scale 2; capture
// only in onPreDraw and only while shown; bitmap freed when the
// last glass view unmounts; shader work only over the pill areas,
// never fullscreen. No expo-blur in the bar path: the RenderEffect
// chain does the blur (bar only) and the refraction in one GPU
// pass. No extra dependencies.
//
// INTEGRATION. Render GlassView INSIDE the bar's overflow-hidden
// container, above nothing and below the veil/icons, laid out 24dp
// larger than the pill on every side — the host-view wrapper
// carries the animated size (pill + 48dp, at left/top -24dp) and
// the native view inside takes StyleSheet.absoluteFill — so the
// shader's 24dp `outset` region is available and the container
// clips it to the pill shape. The bar shader is adapted from
// GlassBarShader.kt in Anivio (GPL-3.0); the droplet lens shader is
// original. Fallback below API 33: a plain tinted pill via
// expo-blur (bar) / nothing (droplet) — never a crash, never a
// fake white circle.

import { requireNativeViewManager } from 'expo-modules-core';
import type { ViewStyle } from 'react-native';

export type GlassViewProps = {
  /** "bar" = capsule glass with tint + rim sheen + blur; "droplet" =
   *  a completely clear magnifying lens (no tint, no blur). */
  mode?: 'bar' | 'droplet';
  /** Strength of the bar's rim sheen / highlight. Default 1.0. */
  glowStrength?: number;
  /** Mix of the tint colour into the sampled backdrop. Fixed 0.30
   *  (iOS 27 default fill). Not a user setting. */
  tintMix?: number;
  /** Tint colour the bar shader mixes in: dark [28/255, 28/255,
   *  30/255] or white [1, 1, 1]. Follows the navbar mode. */
  tintColor?: [number, number, number];
  /** Droplet lens magnification at the rim. 1.0 is no lens. The
   *  displacement is zero at the exact centre and grows toward the
   *  rim, so the middle icon reads clean. Default 1.25. */
  magnification?: number;
  /** Bar blur radius in dp for the chain blur effect. The droplet
   *  never blurs. Default 10dp. */
  blurRadius?: number;
  style?: ViewStyle;
};

// Verified against the installed expo-modules-core 57.0.25: SDK 57
// exposes `requireNativeViewManager(moduleName, viewName)`; there is
// no `requireNativeView` export in this version.
export const GlassView = requireNativeViewManager<GlassViewProps>(
  'LiquidGlassRefraction',
  'GlassView',
);
