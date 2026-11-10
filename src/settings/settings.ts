/**
 * Navbar settings. Plain data, held in React state in DemoScreen.
 * The spring preset scales are mirrored into a Reanimated shared value
 * (see DemoScreen) so the motion worklet can read them.
 */

export type SpringPresetId = 'water' | 'calm' | 'bouncy';

export interface SpringPreset {
  id: SpringPresetId;
  label: string;
  /** Multiplier applied to every spring's stiffness. */
  stiffnessScale: number;
  /** Multiplier applied to every spring's damping ratio (clamped to <= 1.0 in the solver). */
  dampingScale: number;
}

export const SPRING_PRESETS: SpringPreset[] = [
  { id: 'water', label: 'Water', stiffnessScale: 1.0, dampingScale: 1.0 },
  { id: 'calm', label: 'Calm', stiffnessScale: 0.6, dampingScale: 1.25 },
  { id: 'bouncy', label: 'Bouncy', stiffnessScale: 1.4, dampingScale: 0.7 },
];

export function findPreset(id: SpringPresetId): SpringPreset {
  return SPRING_PRESETS.find((p) => p.id === id) ?? SPRING_PRESETS[0];
}

export interface NavbarSettings {
  /** expo-blur intensity, 0..100. Default 80. */
  barBlur: number;
  /** Fill opacity over the blur, 0..1. iOS 27 default is a moderate tint:
   * the background stays clearly visible, the glass has some body.
   * Default 0.30 (lighter and more translucent than Anivio's 0.55). */
  fillOpacity: number;
  /** Edge highlight strength, 0..1. Default 0.35 (Anivio's value).
   * Top edge opacity = 0.27 * (edgeReflection / 0.35). */
  barEdgeReflection: number;
  springPreset: SpringPresetId;
  /** Bar height in dp. Fixed at 64 (Anivio's expanded track height). */
  barHeight: number;
  /** Bar corner radius. Fixed at 32 (a full pill). */
  barRadius: number;
  /** Width the bar shrinks to when labels collapse, as a fraction of full width. */
  shrunkWidthPct: number;
  /** Height the bar shrinks to when labels collapse, in dp. */
  shrunkHeight: number;
  glowEnabled: boolean;
  /** Peak alpha of the touch glow. Anivio uses 0.15. */
  glowPeak: number;
}

export const DEFAULT_SETTINGS: NavbarSettings = {
  barBlur: 80,
  fillOpacity: 0.3,
  barEdgeReflection: 0.35,
  springPreset: 'water',
  barHeight: 64,
  barRadius: 32,
  shrunkWidthPct: 0.7,
  shrunkHeight: 50,
  glowEnabled: true,
  glowPeak: 0.15,
};
