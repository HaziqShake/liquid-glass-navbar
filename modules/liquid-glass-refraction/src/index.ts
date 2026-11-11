// SPDX-License-Identifier: GPL-3.0
//
// TypeScript wrapper for the native hardware refraction view.
// Android only: on any other platform this renders nothing (the
// native view manager does not exist there, so guard usage with
// Platform.OS === 'android').
//
// The native view applies an AGSL RuntimeShader via RenderEffect
// (API 33+) that bends the live backdrop at the bar's edges with
// chromatic dispersion. The shader is adapted from GlassBarShader.kt
// in Anivio (https://github.com/mdtahseen7/Anivio), GPL-3.0; the only
// changes are the `tintMix` uniform (fixed 0.30, the iOS 27 default
// fill) replacing Anivio's hardcoded 0.55 surface tint, and the
// `tintColor` uniform so the tint follows the navbar mode (dark
// #1C1C1E / white) instead of always being dark.
//
// Integration: render this INSIDE the bar's overflow-hidden container,
// above the BlurView, laid out 24dp larger than the bar on every side
// (explicit width/height = bar + 48, at left/top -24) so the shader's
// 24dp `outset` region is available and the container clips it to the
// pill shape. It REPLACES the separate fill View: do not stack a fill
// on top of it or the tint doubles.
//
// WHY THE REFRACTION WAS INVISIBLE (10 Nov, build 319f4b0): the shader
// is Anivio's proven math and the module is linked, but on device the
// bar showed only the BlurView and the fill setting did nothing. That
// is what happens when the shader's uniforms are never set: they
// default to 0, the capsule SDF collapses, coverage is 0 everywhere
// and the shader draws transparent. The native view now applies the
// RenderEffect EAGERLY in init (no size gate — the gate silently
// never passed in build 1) and re-asserts its uniforms on every
// size/layout/attach event and prop change, with a Log.d on every
// attempt; the consumer gives it an explicit width/height
// so its size can never be zero from negative-inset layout arithmetic.

import { requireNativeViewManager } from 'expo-modules-core';
import type { ViewStyle } from 'react-native';

export type RefractionViewProps = {
  /** Strength of the rim sheen / highlight. Default 1.0. */
  glowStrength?: number;
  /** Mix of the tint colour into the sampled backdrop. Fixed 0.30 (iOS 27 default fill). Not a user setting. */
  tintMix?: number;
  /** Tint colour the shader mixes in: dark [28/255, 28/255, 30/255] or white [1, 1, 1]. Follows the navbar mode. */
  tintColor?: [number, number, number];
  style?: ViewStyle;
};

// Verified against the installed expo-modules-core 57.0.25: SDK 57
// exposes `requireNativeViewManager(moduleName, viewName)`; there is
// no `requireNativeView` export in this version.
export const RefractionView = requireNativeViewManager<RefractionViewProps>(
  'LiquidGlassRefraction',
  'RefractionView',
);

export type DropletRefractionViewProps = {
  /** Lens magnification at the rim of the droplet. 1.0 is no lens.
   *  The displacement is zero at the exact centre and grows toward
   *  the rim, so the middle icon reads clean. Default 1.25. */
  magnification?: number;
  style?: ViewStyle;
};

// Haziq's droplet: a completely transparent magnifying lens. No tint,
// no blur, no fill — the shader only bends the live backdrop. Render
// it inside an overflow-hidden pill container, laid out 24dp larger
// than the droplet frame on every side (explicit width/height =
// frame + 48, at left/top -24) so the shader's 24dp `outset` region
// is available and the container clips it to the pill shape.
export const DropletRefractionView = requireNativeViewManager<DropletRefractionViewProps>(
  'LiquidGlassRefraction',
  'DropletRefractionView',
);
