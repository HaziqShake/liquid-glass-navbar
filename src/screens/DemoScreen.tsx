/**
 * Demo screen: a scrolling photo background with Haziq's liquid glass
 * navbar on top.
 *
 * The background Image + ScrollView are wrapped in a BlurTargetView. The
 * navbar's BlurView points at that target (blurTarget), which is what
 * makes the blur real on Android.
 *
 * Scroll drives the label fraction: accumulate the scroll delta,
 * collapse the labels past 60px down, expand past 60px up, reset the
 * accumulator when the direction changes, expand at the very top. The
 * fraction animates over 300ms with the standard cubic-bezier(0.2, 0,
 * 0, 1). The scroll handler runs on an Animated.ScrollView, never a
 * plain ScrollView with a worklet.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BlurTargetView } from 'expo-blur';
import { Books, Compass, Gear, House } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidNavbar, type LiquidTabItem } from '../components/LiquidNavbar';
import { SettingsSheet } from '../components/SettingsSheet';
import { BACKGROUNDS, findBackground } from '../data/backgrounds';
import { DEFAULT_SETTINGS, type NavbarSettings } from '../settings/settings';

const TABS: LiquidTabItem[] = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'explore', label: 'Explore', icon: Compass },
  { key: 'library', label: 'Library', icon: Books },
  { key: 'settings', label: 'Settings', icon: Gear },
];

const CARDS = [
  { title: 'Mountain Lake', body: 'Orange sunset reflection in the river, right behind the bar.' },
  { title: 'Night Peaks', body: 'Dark scene, bright stars and a snowy peak above the bar.' },
  { title: 'Ocean Wave', body: 'High-frequency water texture under the bar.' },
  { title: 'Foggy Hills', body: 'Green valley and the road run right under the bar.' },
  { title: 'Live Blur', body: 'The bar blurs whatever is behind it, live, as the list scrolls.' },
  { title: 'Refraction', body: 'The background bends at the glass edge. Look at the rim, not the middle.' },
  { title: 'The Droplet', body: 'A clear lens over the active tab. It magnifies the icon without scaling it. Hold it and it lifts over the bar.' },
  { title: 'Drag the Bar', body: 'Press and drag across the bar. The droplet follows your finger and snaps to the nearest tab.' },
  { title: 'Tap a Tab', body: 'A tap picks the tab under your finger. The droplet glides there on one soft spring.' },
  { title: 'Scroll to Shrink', body: 'Scroll down and the labels collapse and the bar shrinks. Switching tabs never grows it back. Scroll up to bring them back.' },
  { title: 'Edge Light', body: 'The rim is brightest at the top-left and bottom-right corners and fades fast to nothing along the edges.' },
  { title: 'iOS 27 Default', body: 'Moderate tint. Not crystal clear, not heavily tinted. The photo stays visible through the glass.' },
];

const SCROLL_THRESHOLD = 60;
const LABEL_ANIMATION = { duration: 300, easing: Easing.bezier(0.2, 0, 0, 1) };

export function DemoScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<NavbarSettings>(DEFAULT_SETTINGS);
  const [backgroundId, setBackgroundId] = useState(BACKGROUNDS[0].id);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const blurTargetRef = useRef<View>(null);
  const labelFraction = useSharedValue(1);
  const lastOffset = useSharedValue(0);
  const accumulated = useSharedValue(0);

  const onSelect = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      const delta = y - lastOffset.value;
      lastOffset.value = y;
      if (delta === 0) return;

      // At the very top, expand the labels.
      if (y <= 0) {
        if (labelFraction.value !== 1) {
          labelFraction.value = withTiming(1, LABEL_ANIMATION);
        }
        accumulated.value = 0;
        return;
      }

      accumulated.value += delta;

      // Scrolling down past the threshold collapses the labels.
      if (accumulated.value > SCROLL_THRESHOLD && labelFraction.value !== 0) {
        labelFraction.value = withTiming(0, LABEL_ANIMATION);
        accumulated.value = 0;
      } else if (accumulated.value < -SCROLL_THRESHOLD && labelFraction.value !== 1) {
        // Scrolling up past the threshold expands them again.
        labelFraction.value = withTiming(1, LABEL_ANIMATION);
        accumulated.value = 0;
      }

      // Reset the accumulator when the direction changes.
      if (delta > 0 && accumulated.value < 0) accumulated.value = delta;
      if (delta < 0 && accumulated.value > 0) accumulated.value = delta;
    },
  });

  const background = findBackground(backgroundId) ?? BACKGROUNDS[0];

  return (
    <View style={styles.root}>
      <BlurTargetView ref={blurTargetRef} style={styles.target}>
        <Image source={background.source} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <Animated.ScrollView
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 24, paddingBottom: 140 },
          ]}
        >
          <Text style={styles.title}>Liquid Navbar</Text>
          <Text style={styles.subtitle}>Haziq&apos;s own liquid glass navbar</Text>
          {CARDS.map((card) => (
            <View key={card.title} style={styles.card}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardBody}>{card.body}</Text>
            </View>
          ))}
        </Animated.ScrollView>
      </BlurTargetView>

      <Pressable
        style={[styles.settingsButton, { top: insets.top + 12 }]}
        onPress={() => setShowSettings((v) => !v)}
        hitSlop={8}
      >
        <Gear size={22} color="#FFFFFF" weight="regular" />
      </Pressable>

      <LiquidNavbar
        tabs={TABS}
        selectedIndex={selectedIndex}
        onSelect={onSelect}
        labelFraction={labelFraction}
        blurTarget={blurTargetRef}
        settings={settings}
      />

      {showSettings ? (
        <SettingsSheet
          settings={settings}
          onSettingsChange={setSettings}
          backgroundId={backgroundId}
          onBackgroundChange={setBackgroundId}
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  target: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 28,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 6,
    marginBottom: 20,
  },
  card: {
    backgroundColor: 'rgba(15,15,17,0.55)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    color: '#FFFFFF',
  },
  cardBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 6,
  },
  settingsButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,15,17,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
});
