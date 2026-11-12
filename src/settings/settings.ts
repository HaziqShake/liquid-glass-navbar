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
  /** expo-blur intensity, 0..100. BUILD 10 default 55 (was 50):
   *  maps to a 3.3dp chain blur (55 * 0.06). Kept deliberately
   *  lighter than a heavy frost: a heavy blur washes the backdrop
   *  into a smooth wash, and a wash has no features left for the
   *  refraction to bend, so the lens effect disappears. */
  barBlur: number;
  /** Refraction strength, 0..1. Maps to the native shader's
   *  glowStrength (rim sheen / highlight, and the binary gate for
   *  the bend). BUILD 10 default 0.50 (was 1.00) — Haziq's exact
   *  number. NOTE: this halves the rim sheen/highlight; the bend
   *  magnitude itself is gated on/off by it, not scaled by it,
   *  so the refraction bend is unchanged at 0.50. */
  refractionStrength: number;
  /** BUILD 9: the droplet's HOLD magnification M, 1..1.6.
   *  Default 1.35. At rest the droplet has NO magnification at
   *  all (same glass as the bar); only while held does it zoom,
   *  UNIFORMLY — one scale factor about the droplet centre, a
   *  plain zoomed-in image, no fisheye — and the icon inside it
   *  scales by the same factor. BUILD 10: holding keeps the
   *  droplet's blur (it no longer drops to 0). */
  dropletMagnification: number;
  /** Edge light intensity, 0..1. Scales the corrected edge-light
   *  gradient stroke (alpha 1 at the top-left and bottom-right
   *  corners, fading fast to 0). BUILD 10 default 0.75 (was 1.00)
   *  — Haziq's exact number. */
  edgeLight: number;
  /** Legibility veil strength, 0..1. An adaptive veil under the icons
   *  so they stay readable over clear glass. Dark mode: a dark
   *  translucent layer. Light mode: a light translucent layer. It sits
   *  between the glass surface and the icons and never touches the blur
   *  or the refraction. BUILD 10 default 0.50 (was 0.02) — Haziq's
   *  exact number, a large jump: the bar now carries a 50% veil, so
   *  it reads much darker/more solid than the near-clear build 9
   *  bar. Implemented exactly as given; do not "correct" it back. */
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
  // BUILD 10 (12 Nov 2026) — Haziq's exact new defaults. FLAG:
  // Veil 0.50 (was 0.02, a 25x jump) and Refraction 0.50 (was
  // 1.00, halved). Blur 55 (was 50), edge light 0.75 (was 1.00).
  barBlur: 55,
  refractionStrength: 0.5,
  dropletMagnification: 1.35,
  edgeLight: 0.75,
  legibilityVeil: 0.5,
  barHeight: 64,
  barWidthPct: 0.9,
  shrunkWidthPct: 0.7,
  shrunkHeight: 50,
  bendDiagnostic: false,
};
