import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GlassTier } from 'react-native-liquid-glassmorphism';
import { Gear } from 'phosphor-react-native';
import { useNavScroll } from '../context/NavScrollContext';
import { useNavbarSettings } from '../settings/SettingsContext';
import { LiquidGlassNavbar, NavItem } from '../components/LiquidGlassNavbar';
import { SettingsSheet } from '../components/SettingsSheet';
import { BACKGROUNDS, findBackground, type DemoBackground } from '../data/backgrounds';

const TABS: NavItem[] = [
  { label: 'Home', icon: 'House', route: 'home' },
  { label: 'Search', icon: 'MagnifyingGlass', route: 'search' },
  { label: 'Saved', icon: 'Heart', route: 'saved' },
  { label: 'Profile', icon: 'User', route: 'profile' },
];

const CARDS = [
  { title: 'Refraction, not blur', body: 'The bar bends the photo behind it. Scroll and watch the rim distort the image as content passes under.' },
  { title: 'The pill', body: 'The active tab indicator is a plain translucent pill inside the bar, not glass. Tap a tab and it springs over, stretching along its travel and squashing as it lands. The bright icon rides on top of it.' },
  { title: 'Jelly springs', body: 'Eleven coupled springs drive the motion: a critically damped position spring, an underdamped velocity spring for squash and stretch, and rubber-banded track springs for the whole bar.' },
  { title: 'Tweak it', body: 'Tap the gear up top to open settings: glass, springs, bounce, bar shape, background. Everything applies live.' },
  { title: 'Touch and drag', body: 'Touch the droplet and drag, no long-press needed. The pill follows your finger, grows to 1.3x while held, and settles with a wobble once it is nearly home.' },
  { title: 'Squash and stretch', body: 'The droplet elongates in its direction of travel, up to 25 percent longer, and squashes up to 20 percent vertically, both proportional to speed.' },
  { title: 'Clean pill', body: 'The active indicator is a plain translucent pill inside the bar, 1:1 like Anivio. No refraction, no rainbow rim. It swells while held, that press grow is the magnification. The bright icon rides on top of it.' },
  { title: 'Specular rim', body: 'Light comes from the top. The edge reflection is soft on purpose, 0.35 on the bar, 0.5 on the droplet.' },
  { title: 'Legibility veil', body: 'A faint adaptive veil sits under the icons so they stay readable over clear glass, even on bright photos.' },
  { title: 'Blur scrim', body: 'Behind the bar the content dissolves into a gradient of blur, not a background-colour fade.' },
  { title: 'Pause while scrolling', body: 'Glass capture pauses on drag, on momentum, and while the bar expands after a tap, then resumes. That is what keeps Android from crashing.' },
  { title: 'Photos, cropped for the bar', body: 'Every photo is cropped to phone portrait, so the bar sits over real detail and colour at the bottom of the frame. That bottom band is what the glass bends. Flat colours and gradients are gone, the glass gets its colours from the photo.' },
  { title: 'Tier readout', body: 'The pill above shows the rendering tier this device actually used: glass, refraction, blur, tint or none.' },
  { title: 'One glass surface', body: 'Only the bar is glass. The pill is a plain View, so it can resize every frame without crashing, and the bar is the only thing that has to capture the background.' },
  { title: 'Real build only', body: 'This is a native module. It needs a development build and never works in Expo Go.' },
];

export const DemoScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { scrollHandler, resetGlassPause } = useNavScroll();
  const { backgroundId, setBackgroundId, customPhotoUri, focusMode } = useNavbarSettings();

  // Focus mode mounts/unmounts the ScrollView. If it unmounts mid-scroll
  // the scroll handler's end events never fire and the glass pause sticks,
  // freezing the bar on a stale frame (it looks like a screenshot). Reset
  // the pause whenever focus mode flips so the bar always re-captures.
  useEffect(() => {
    resetGlassPause();
  }, [focusMode]);
  const [activeRoute, setActiveRoute] = useState('home');
  const [tier, setTier] = useState<GlassTier | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const bg: DemoBackground =
    backgroundId === 'custom-photo' && customPhotoUri
      ? {
          id: 'custom-photo',
          label: 'Yours',
          caption: 'Your own photo, picked from the gallery.',
          kind: 'image',
          source: { uri: customPhotoUri },
        }
      : findBackground(backgroundId) ?? BACKGROUNDS[0];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Image source={bg.source} style={StyleSheet.absoluteFill} resizeMode="cover" />

      {/* Focus mode: the demo content is hidden, only the background and
          the navbar stay, so the bar is never covered while you tweak. The
          small gear stays so the settings sheet can be reopened. */}
      {focusMode && (
        <TouchableOpacity
          style={[styles.focusGear, { top: Math.max(insets.top, 16) + 8 }]}
          onPress={() => setSettingsVisible(true)}
          activeOpacity={0.7}
        >
          <Gear size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {!focusMode && (
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: 150 },
        ]}
      >
        <Text style={styles.title}>Liquid Glass</Text>
        <Text style={styles.subtitle}>A refractive navbar, not a blur panel.</Text>

        <View style={styles.headerRow}>
          <View style={styles.tierPill}>
            <Text style={styles.tierText}>
              {tier ? `render tier: ${tier}` : 'render tier: waiting for first frame'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.gearButton}
            onPress={() => setSettingsVisible(true)}
            activeOpacity={0.7}
          >
            <Gear size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>BACKGROUND</Text>
        <View style={styles.picker}>
          {BACKGROUNDS.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[styles.chip, b.id === backgroundId && styles.chipActive]}
              onPress={() => setBackgroundId(b.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, b.id === backgroundId && styles.chipTextActive]}>
                {b.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.caption}>{bg.caption}</Text>

        {CARDS.map((card) => (
          <View key={card.title} style={styles.card}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardBody}>{card.body}</Text>
          </View>
        ))}
      </Animated.ScrollView>
      )}

      <LiquidGlassNavbar
        items={TABS}
        activeRoute={activeRoute}
        onPress={setActiveRoute}
        onTier={setTier}
      />

      <SettingsSheet
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  content: {
    paddingHorizontal: 20,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 32,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  tierPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tierText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#FFFFFF',
  },
  gearButton: {
    padding: 10,
    borderRadius: 99,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  focusGear: {
    position: 'absolute',
    right: 20,
    padding: 10,
    borderRadius: 99,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 10,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    letterSpacing: 1.5,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 22,
    marginBottom: 10,
  },
  picker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  chipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  chipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#FFFFFF',
  },
  chipTextActive: {
    color: '#111111',
  },
  caption: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 10,
    lineHeight: 18,
  },
  card: {
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  cardTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: '#FFFFFF',
  },
  cardBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 4,
    lineHeight: 18,
  },
});
