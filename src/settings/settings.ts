/**
 * Every tweakable value of the springy liquid navbar, in one place.
 * The demo app keeps these in React state (so the settings sheet can edit
 * them) and mirrors them into a Reanimated shared value (so the jelly
 * worklets can read them every frame without re-rendering).
 */

export interface NavbarSettings {
  // Glass (the bar is the only glass surface now, the pill is a plain
  // View, so there are no droplet glass settings)
  barThickness: number;
  barBlur: number;
  saturation: number;
  barEdgeReflection: number;
  legibilityFloor: number;
  // Springs (stiffness, damping ratio)
  positionStiffness: number;
  positionDamping: number;
  velocityStiffness: number;
  velocityDamping: number;
  scaleStiffness: number;
  scaleXDamping: number;
  scaleYDamping: number;
  trackStiffness: number;
  trackDamping: number;
  panelStiffness: number;
  // Bounce
  pressScale: number;
  squashX: number;
  squashY: number;
  settleFraction: number;
  tapThreshold: number;
  // Bar shape
  barWidthPct: number;
  barHeight: number;
  barRadius: number;
  shrunkWidthPct: number;
  shrunkHeight: number;
  // Effects
  glowEnabled: boolean;
  glowPeak: number;
  trackEnabled: boolean;
  panelLagEnabled: boolean;
  squashEnabled: boolean;
}

export const DEFAULT_SETTINGS: NavbarSettings = {
  barThickness: 0.75,
  barBlur: 1,
  saturation: 0.8,
  barEdgeReflection: 0.35,
  legibilityFloor: 0.4,
  positionStiffness: 1000,
  positionDamping: 1.0,
  velocityStiffness: 300,
  velocityDamping: 0.5,
  scaleStiffness: 250,
  scaleXDamping: 0.6,
  scaleYDamping: 0.7,
  trackStiffness: 266.67,
  trackDamping: 0.612,
  panelStiffness: 300,
  pressScale: 1.3,
  squashX: 1.0,
  squashY: 1.0,
  settleFraction: 0.025,
  tapThreshold: 4,
  barWidthPct: 0.9,
  barHeight: 64,
  barRadius: 32,
  shrunkWidthPct: 0.7,
  shrunkHeight: 50,
  glowEnabled: true,
  glowPeak: 0.15,
  trackEnabled: true,
  panelLagEnabled: true,
  squashEnabled: true,
};

export type NumericSettingKey = {
  [K in keyof NavbarSettings]: NavbarSettings[K] extends number ? K : never;
}[keyof NavbarSettings];

export type BooleanSettingKey = {
  [K in keyof NavbarSettings]: NavbarSettings[K] extends boolean ? K : never;
}[keyof NavbarSettings];

export type ControlDef =
  | {
      kind: 'slider';
      key: NumericSettingKey;
      label: string;
      min: number;
      max: number;
      step: number;
    }
  | { kind: 'toggle'; key: BooleanSettingKey; label: string };

export interface SettingsSection {
  title: string;
  note?: string;
  controls: ControlDef[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    title: 'Glass',
    controls: [
      { kind: 'slider', key: 'barThickness', label: 'Bar thickness', min: 0.3, max: 2, step: 0.05 },
      { kind: 'slider', key: 'barBlur', label: 'Bar blur', min: 0, max: 20, step: 1 },
      { kind: 'slider', key: 'saturation', label: 'Saturation', min: 0, max: 1.5, step: 0.05 },
      { kind: 'slider', key: 'barEdgeReflection', label: 'Bar edge reflection', min: 0, max: 1, step: 0.05 },
      { kind: 'slider', key: 'legibilityFloor', label: 'Legibility veil', min: 0, max: 0.8, step: 0.05 },
    ],
  },
  {
    title: 'Springs',
    note: 'Stiffness is how snappy, damping ratio is how much it wobbles. 1.0 is critically damped, below 1.0 bounces.',
    controls: [
      { kind: 'slider', key: 'positionStiffness', label: 'Travel stiffness', min: 100, max: 2000, step: 50 },
      { kind: 'slider', key: 'positionDamping', label: 'Travel damping', min: 0.3, max: 1.5, step: 0.05 },
      { kind: 'slider', key: 'velocityStiffness', label: 'Squash stiffness', min: 100, max: 600, step: 10 },
      { kind: 'slider', key: 'velocityDamping', label: 'Squash damping', min: 0.2, max: 1, step: 0.05 },
      { kind: 'slider', key: 'scaleStiffness', label: 'Grow stiffness', min: 100, max: 500, step: 10 },
      { kind: 'slider', key: 'scaleXDamping', label: 'Grow X damping', min: 0.3, max: 1, step: 0.05 },
      { kind: 'slider', key: 'scaleYDamping', label: 'Grow Y damping', min: 0.3, max: 1, step: 0.05 },
      { kind: 'slider', key: 'trackStiffness', label: 'Bar wobble stiffness', min: 100, max: 600, step: 10 },
      { kind: 'slider', key: 'trackDamping', label: 'Bar wobble damping', min: 0.3, max: 1, step: 0.05 },
      { kind: 'slider', key: 'panelStiffness', label: 'Panel lag stiffness', min: 100, max: 600, step: 10 },
    ],
  },
  {
    title: 'Bounce',
    controls: [
      { kind: 'slider', key: 'pressScale', label: 'Press grow', min: 1, max: 1.6, step: 0.05 },
      { kind: 'slider', key: 'squashX', label: 'Stretch amount', min: 0, max: 1.5, step: 0.05 },
      { kind: 'slider', key: 'squashY', label: 'Squash amount', min: 0, max: 1.5, step: 0.05 },
      { kind: 'slider', key: 'settleFraction', label: 'Settle window', min: 0.01, max: 0.1, step: 0.005 },
      { kind: 'slider', key: 'tapThreshold', label: 'Tap distance (dp)', min: 2, max: 10, step: 1 },
    ],
  },
  {
    title: 'Bar shape',
    controls: [
      { kind: 'slider', key: 'barWidthPct', label: 'Bar width', min: 0.7, max: 0.98, step: 0.01 },
      { kind: 'slider', key: 'barHeight', label: 'Bar height', min: 48, max: 80, step: 1 },
      { kind: 'slider', key: 'barRadius', label: 'Corner radius', min: 16, max: 40, step: 1 },
      { kind: 'slider', key: 'shrunkWidthPct', label: 'Shrunk width', min: 0.5, max: 0.9, step: 0.05 },
      { kind: 'slider', key: 'shrunkHeight', label: 'Shrunk height', min: 36, max: 64, step: 1 },
    ],
  },
  {
    title: 'Effects',
    controls: [
      { kind: 'toggle', key: 'glowEnabled', label: 'Touch glow' },
      { kind: 'slider', key: 'glowPeak', label: 'Glow strength', min: 0, max: 0.3, step: 0.01 },
      { kind: 'toggle', key: 'trackEnabled', label: 'Bar wobble' },
      { kind: 'toggle', key: 'panelLagEnabled', label: 'Panel lag' },
      { kind: 'toggle', key: 'squashEnabled', label: 'Squash and stretch' },
    ],
  },
];

export interface Preset {
  name: string;
  settings: NavbarSettings;
}

export const PRESETS: Preset[] = [
  { name: 'Water', settings: DEFAULT_SETTINGS },
  {
    name: 'Calm',
    settings: {
      ...DEFAULT_SETTINGS,
      velocityDamping: 0.8,
      scaleXDamping: 0.9,
      scaleYDamping: 0.9,
      trackDamping: 0.8,
      pressScale: 1.15,
      squashX: 0.5,
      squashY: 0.5,
    },
  },
  {
    name: 'Bouncy',
    settings: {
      ...DEFAULT_SETTINGS,
      velocityDamping: 0.3,
      scaleXDamping: 0.4,
      scaleYDamping: 0.45,
      trackDamping: 0.45,
      pressScale: 1.45,
      squashX: 1.3,
      squashY: 1.3,
    },
  },
];
