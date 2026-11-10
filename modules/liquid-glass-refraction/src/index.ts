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
// change is the `tintMix` uniform (default 0.30) replacing Anivio's
// hardcoded 0.55 surface tint.
//
// Integration: render this INSIDE the bar's overflow-hidden container,
// above the BlurView, laid out 24dp larger than the bar on every side
// (style { position: 'absolute', left: -24, top: -24, right: -24,
// bottom: -24 }) so the shader's 24dp `outset` region is available
// and the container clips it to the pill shape. It REPLACES the
// separate fill View: do not stack a fill on top of it or the tint
// doubles.

import { requireNativeViewManager } from 'expo-modules-core';
import type { ViewStyle } from 'react-native';

export type RefractionViewProps = {
  /** Strength of the rim sheen / highlight. Default 1.0. */
  glowStrength?: number;
  /** Mix of the tint colour into the sampled backdrop. Default 0.30 (iOS 27 fill). */
  tintMix?: number;
  /** Tint colour mixed into the backdrop, as linear 0..1 [r, g, b].
   *  Dark mode: [28/255, 28/255, 30/255] (dark #1C1C1E). Light mode:
   *  [1, 1, 1] (white) so the refraction mixes a light tint. No colour
   *  effects are added; this only makes the existing surface tint follow
   *  the navbar mode. */
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
