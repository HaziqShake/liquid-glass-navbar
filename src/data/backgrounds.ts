import type { ImageSourcePropType } from 'react-native';

export interface DemoBackground {
  id: string;
  label: string;
  caption: string;
  kind: 'image' | 'color' | 'gradient';
  source?: ImageSourcePropType;
  color?: string;
  colors?: [string, string];
}

/**
 * Backgrounds for the demo. Stock photos from Unsplash (free to use).
 * Picked the way the liquid glass library's own docs suggest: the glass
 * needs high-frequency detail behind it, a photo, text, a busy list, a
 * gradient at minimum. Over a flat colour the glass has nothing to bend and
 * nearly disappears, which is exactly what the 'Flat' option shows.
 *
 * White is the best background for seeing the colour split: white light
 * breaks into red and blue at the rim.
 */
export const BACKGROUNDS: DemoBackground[] = [
  {
    id: 'mountain-lake',
    label: 'Lake',
    caption: 'Mountain lake. Sharp detail everywhere, the best refraction test.',
    kind: 'image',
    source: require('../../assets/backgrounds/mountain-lake.jpg'),
  },
  {
    id: 'night-peaks',
    label: 'Night',
    caption: 'Night peaks. Dark scene with bright stars, tests the specular rim.',
    kind: 'image',
    source: require('../../assets/backgrounds/night-peaks.jpg'),
  },
  {
    id: 'ocean-wave',
    label: 'Ocean',
    caption: 'Ocean wave. High-frequency water texture under the bar.',
    kind: 'image',
    source: require('../../assets/backgrounds/ocean-wave.jpg'),
  },
  {
    id: 'violet-gradient',
    label: 'Gradient',
    caption: 'Soft violet gradient. The minimum the glass needs to read at all.',
    kind: 'image',
    source: require('../../assets/backgrounds/violet-gradient.jpg'),
  },
  {
    id: 'foggy-hills',
    label: 'Hills',
    caption: 'Foggy hills. Low contrast, shows how the legibility veil helps.',
    kind: 'image',
    source: require('../../assets/backgrounds/foggy-hills.jpg'),
  },
  {
    id: 'flat',
    label: 'Flat',
    caption: 'Flat colour. The glass has nothing to bend, so it nearly disappears. This is the gotcha.',
    kind: 'color',
    color: '#2B2B2B',
  },
];

export const BACKGROUND_COLORS: DemoBackground[] = [
  {
    id: 'color-white',
    label: 'White',
    caption: 'White. The best way to see the colour split, white light breaks into red and blue at the rim.',
    kind: 'color',
    color: '#FFFFFF',
  },
  {
    id: 'color-cream',
    label: 'Cream',
    caption: 'Warm cream. Bright backdrop, soft contrast.',
    kind: 'color',
    color: '#F5E6D3',
  },
  {
    id: 'color-black',
    label: 'Black',
    caption: 'Near black. The glass reads as a dark lens.',
    kind: 'color',
    color: '#0F0F0F',
  },
  {
    id: 'color-navy',
    label: 'Navy',
    caption: 'Deep navy. Dark with a cool tint.',
    kind: 'color',
    color: '#1B1B2E',
  },
  {
    id: 'color-red',
    label: 'Red',
    caption: 'Deep red. Warm backdrop, tests the rim against a strong colour.',
    kind: 'color',
    color: '#3B0A0A',
  },
  {
    id: 'color-green',
    label: 'Green',
    caption: 'Deep green. Dark and saturated.',
    kind: 'color',
    color: '#0A2E1B',
  },
  {
    id: 'color-blue',
    label: 'Blue',
    caption: 'Steel blue. Cool mid-tone.',
    kind: 'color',
    color: '#10243E',
  },
  {
    id: 'color-purple',
    label: 'Purple',
    caption: 'Deep purple. Dark with a violet tint.',
    kind: 'color',
    color: '#2E1A3B',
  },
];

export const BACKGROUND_GRADIENTS: DemoBackground[] = [
  {
    id: 'grad-sunset',
    label: 'Sunset',
    caption: 'Sunset gradient. Warm top to pink bottom.',
    kind: 'gradient',
    colors: ['#FF512F', '#DD2476'],
  },
  {
    id: 'grad-ocean',
    label: 'Ocean',
    caption: 'Ocean gradient. Teal to sky blue.',
    kind: 'gradient',
    colors: ['#2193B0', '#6DD5ED'],
  },
  {
    id: 'grad-violet',
    label: 'Violet',
    caption: 'Violet gradient. Purple to deep indigo.',
    kind: 'gradient',
    colors: ['#8E2DE2', '#4A00E0'],
  },
  {
    id: 'grad-forest',
    label: 'Forest',
    caption: 'Forest gradient. Teal to bright green.',
    kind: 'gradient',
    colors: ['#11998E', '#38EF7D'],
  },
  {
    id: 'grad-peach',
    label: 'Peach',
    caption: 'Peach gradient. Soft pink to rose.',
    kind: 'gradient',
    colors: ['#FF9A8B', '#FF6A88'],
  },
  {
    id: 'grad-midnight',
    label: 'Midnight',
    caption: 'Midnight gradient. Near-black to steel blue.',
    kind: 'gradient',
    colors: ['#141E30', '#243B55'],
  },
];

export function findBackground(id: string): DemoBackground | undefined {
  return [...BACKGROUNDS, ...BACKGROUND_COLORS, ...BACKGROUND_GRADIENTS].find(
    (b) => b.id === id,
  );
}
