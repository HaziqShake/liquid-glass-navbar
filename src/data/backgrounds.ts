import type { ImageSourcePropType } from 'react-native';

export interface DemoBackground {
  id: string;
  label: string;
  caption: string;
  kind: 'image' | 'flat';
  source?: ImageSourcePropType;
  color?: string;
}

/**
 * Backgrounds for the demo. Stock photos from Unsplash (free to use).
 * Picked the way the liquid glass library's own docs suggest: the glass
 * needs high-frequency detail behind it, a photo, text, a busy list, a
 * gradient at minimum. Over a flat colour the glass has nothing to bend and
 * nearly disappears, which is exactly what the 'Flat' option shows.
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
    kind: 'flat',
    color: '#2B2B2B',
  },
];
