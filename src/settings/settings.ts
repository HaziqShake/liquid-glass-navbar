/**
 * Navbar settings for Haziq's own liquid glass navbar. Plain data,
 * held in React state in DemoScreen.
 *
 * Only his parameters are here: blur, refraction strength, droplet
 * magnification, edge light intensity, mode and veil. There are no
 * spring presets and no coupled-spring settings — this navbar uses
 * none of those mechanisms.
 */

export type NavbarMode = 'dark' | 'light';

export interface NavbarSettings {
  /** Dark or light navbar. Dark: dark tint + white icons. Light: white
   *  tint + dark icons. The blur tint, the veil and the refraction
   *  tint all follow the mode. */
  mode: NavbarMode;
  /** expo-blur intensity, 0..100. Default 50. Kept deliberately lighter
   *  than a heavy frost: a heavy blur washes the backdrop into a
   *  smooth wash, and a wash has no features left for the refraction
   *  to bend, so the lens effect disappears. 50 keeps the bar glassy
   *  while the background keeps enough detail for the bend to show. */
  barBlur: number;
  /** Refraction strength, 0..1. Maps to the native shader's
   *  glowStrength (rim sheen / highlight). Default 1. */
  refractionStrength: number;
  /** BUILD 9: the droplet's HOLD magnification M, 1..1.6.
   *  Default 1.35. At rest the droplet has NO magnification at
   *  all (same glass as the bar); only while held does it zoom,
   *  UNIFORMLY — one scale factor about the droplet centre, a
   *  plain zoomed-in image, no fisheye — and the icon inside it
   *  scales by the same factor. Holding also drops the droplet's
   *  blur to 0 while keeping the refraction. */
  dropletMagnification: number;
  /** Edge light intensity, 0..1. Scales the corrected edge-light
   *  gradient stroke (alpha 1 at the top-left and bottom-right
   *  corners, fading fast to 0). Default 1. */
  edgeLight: number;
  /** Legibility veil strength, 0..1. An adaptive veil under the icons
   *  so they stay readable over clear glass. Dark mode: a dark
   *  translucent layer. Light mode: a light translucent layer. It sits
   *  between the glass surface and the icons and never touches the blur
   *  or the refraction. Build 7: 0.02 (was 0.05), deliberately subtle
   *  — the bar must read clear, and a heavy veil would hide the
   *  refraction. */
  legibilityVeil: number;
  /** Bar height in dp when labels are shown. Fixed at 64. */
  barHeight: number;
  /** BUILD 8 DIAGNOSTIC, default false. When ON, the bar glass
   *  gets bendScale 3 (three times the coherent rim displacement)
   *  so the device check can see whether ANY displacement reaches
   *  the screen at all. When OFF the bar renders at bendScale 1,
   *  the shipped look. This is a diagnostic switch only, never a
   *  look setting. */
  bendDiagnostic: boolean;
  /** Bar width as a fraction of the screen width when labels are shown. */
  barWidthPct: number;
  /** Width the bar shrinks to when labels collapse, as a fraction of
   *  the full bar width. */
  shrunkWidthPct: number;
  /** Height the bar shrinks to when labels collapse, in dp. */
  shrunkHeight: number;
}

export const DEFAULT_SETTINGS: NavbarSettings = {
  mode: 'dark',
  barBlur: 50,
  refractionStrength: 1,
  dropletMagnification: 1.35,
  edgeLight: 1,
  legibilityVeil: 0.02,
  barHeight: 64,
  barWidthPct: 0.9,
  shrunkWidthPct: 0.7,
  shrunkHeight: 50,
  bendDiagnostic: false,
};
