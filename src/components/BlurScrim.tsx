import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

/**
 * A gradient of blur (not color). Stacked BlurViews with increasing
 * intensity toward the anchored edge, so scrolled content dissolves
 * into blur instead of fading into a bg-color gradient.
 */
interface BlurScrimProps {
  /** Which edge the strongest blur hugs: 'bottom' (navbar) or 'top' (status bar) */
  edge: 'bottom' | 'top';
  /** How far the blur extends from the edge */
  height?: number;
}

const STEPS = [
  { frac: 1.0, intensity: 4 },
  { frac: 0.72, intensity: 12 },
  { frac: 0.46, intensity: 25 },
  { frac: 0.24, intensity: 45 },
];

export const BlurScrim: React.FC<BlurScrimProps> = ({ edge, height = 160 }) => {
  // 'default' tint renders as a flat gray overlay on Android, use 'dark'
  // so the blur melts into the photo backgrounds instead. Switch to 'light'
  // for a light-themed app.
  const tint = 'dark';

  return (
    <View pointerEvents="none" style={[styles.container, edge === 'bottom' ? styles.bottom : styles.top, { height }]}>
      {STEPS.map((s, i) => (
        <BlurView
          key={i}
          intensity={s.intensity}
          tint={tint}
          style={[
            styles.step,
            edge === 'bottom' ? { bottom: 0, height: height * s.frac } : { top: 0, height: height * s.frac },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  bottom: {
    bottom: 0,
  },
  top: {
    top: 0,
  },
  step: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
