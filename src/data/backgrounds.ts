import type { ImageSourcePropType } from 'react-native';

export interface DemoBackground {
  id: string;
  label: string;
  caption: string;
  kind: 'image';
  source: ImageSourcePropType;
}

/**
 * Backgrounds for the demo. Photos only, no flat colours and no gradients.
 * The glass gets its colours from the background, so a flat colour or a
 * smooth gradient gives it nothing to bend and it nearly disappears.
 *
 * The photos are stock Unsplash images, cropped to portrait 1080x2400
 * (phone aspect) so the bar sits over real detail and colour at the bottom
 * of the frame, where the navbar lives. That bottom band is what the glass
 * bends: the river's orange sunset reflection (Lake), the snowy peak base
 * (Night), the wave texture (Ocean), the valley and road (Hills).
 */
export const BACKGROUNDS: DemoBackground[] = [
  {
    id: 'mountain-lake',
    label: 'Lake',
    caption: 'Mountain lake. Orange sunset reflection in the river, right behind the bar.',
    kind: 'image',
    source: require('../../assets/backgrounds/mountain-lake.jpg'),
  },
  {
    id: 'night-peaks',
    label: 'Night',
    caption: 'Night peaks. Dark scene, bright stars and a snowy peak above the bar.',
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
    id: 'foggy-hills',
    label: 'Hills',
    caption: 'Foggy hills. Green valley and the road run right under the bar.',
    kind: 'image',
    source: require('../../assets/backgrounds/foggy-hills.jpg'),
  },
];

export function findBackground(id: string): DemoBackground | undefined {
  return BACKGROUNDS.find((b) => b.id === id);
}
