import type { ImageSourcePropType } from 'react-native';

export interface DemoBackground {
  id: string;
  label: string;
  caption: string;
  kind: 'image';
  source: ImageSourcePropType;
  /** Dominant / accent colour of the photo (hex). The glass reacts with
   *  the colour around it: the edge light is tinted with this accent
   *  instead of always being white, so the rim picks up the ambient
   *  colour of the scene (the green glow in Haziq's screenshot). */
  accent: string;
}

/**
 * Backgrounds for the demo. Photos only, no flat colours and no gradients.
 * The glass gets its colours from the background, so a flat colour or a
 * smooth gradient gives it nothing to bend and it nearly disappears.
 *
 * The photos are stock Unsplash images, cropped to portrait 1080x2400
 * (phone aspect) so the bar sits over real detail and colour at the bottom
 * of the frame, where the navbar lives. That bottom band is what the glass
 * bends. The set is chosen to judge the glass: sharp detail and strong
 * colour for refraction, a dark and a light scene so both navbar modes can
 * be tested, and high-frequency texture for the blur.
 */
export const BACKGROUNDS: DemoBackground[] = [
  {
    id: 'mountain-lake',
    label: 'Lake',
    caption: 'Mountain lake. Orange sunset reflection in the river, right behind the bar.',
    kind: 'image',
    source: require('../../assets/backgrounds/mountain-lake.jpg'),
    accent: '#EA580C',
  },
  {
    id: 'night-peaks',
    label: 'Night',
    caption: 'Night peaks. Dark scene, bright stars and a snowy peak above the bar.',
    kind: 'image',
    source: require('../../assets/backgrounds/night-peaks.jpg'),
    accent: '#93C5FD',
  },
  {
    id: 'ocean-wave',
    label: 'Ocean',
    caption: 'Ocean wave. High-frequency water texture under the bar.',
    kind: 'image',
    source: require('../../assets/backgrounds/ocean-wave.jpg'),
    accent: '#06B6D4',
  },
  {
    id: 'foggy-hills',
    label: 'Hills',
    caption: 'Foggy hills. Green valley and the road run right under the bar.',
    kind: 'image',
    source: require('../../assets/backgrounds/foggy-hills.jpg'),
    accent: '#22C55E',
  },
  {
    id: 'abstract-paint',
    label: 'Paint',
    caption: 'Colourful abstract paint. Strong, saturated colour for refraction and the ambient edge light.',
    kind: 'image',
    source: require('../../assets/backgrounds/abstract-paint.jpg'),
    accent: '#EC4899',
  },
  {
    id: 'architecture',
    label: 'Arch',
    caption: 'Sharp white architecture. Hard edges and straight lines make refraction easy to judge.',
    kind: 'image',
    source: require('../../assets/backgrounds/architecture.jpg'),
    accent: '#64748B',
  },
  {
    id: 'sunset-field',
    label: 'Sunset',
    caption: 'Vivid sunset over a field. Warm orange and red behind the bar.',
    kind: 'image',
    source: require('../../assets/backgrounds/sunset-field.jpg'),
    accent: '#F97316',
  },
  {
    id: 'beach',
    label: 'Beach',
    caption: 'Bright beach. A light scene for testing the light navbar mode.',
    kind: 'image',
    source: require('../../assets/backgrounds/beach.jpg'),
    accent: '#0EA5E9',
  },
  {
    id: 'city-night',
    label: 'City',
    caption: 'Neon city at night. Dark scene with vivid coloured lights for the edge glow.',
    kind: 'image',
    source: require('../../assets/backgrounds/city-night.jpg'),
    accent: '#A855F7',
  },
];

export function findBackground(id: string): DemoBackground | undefined {
  return BACKGROUNDS.find((b) => b.id === id);
}
