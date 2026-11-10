/**
 * Simple settings sheet for the demo. Sliders and preset buttons only;
 * no animation library, just a panel that appears above the navbar.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { BACKGROUNDS } from '../data/backgrounds';
import { SPRING_PRESETS, type NavbarSettings, type SpringPresetId } from '../settings/settings';

interface SettingsSheetProps {
  settings: NavbarSettings;
  onSettingsChange: (next: NavbarSettings) => void;
  backgroundId: string;
  onBackgroundChange: (id: string) => void;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function SettingsSheet({
  settings,
  onSettingsChange,
  backgroundId,
  onBackgroundChange,
  onClose,
}: SettingsSheetProps): React.JSX.Element {
  const set = (patch: Partial<NavbarSettings>): void => {
    onSettingsChange({ ...settings, ...patch });
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.title}>Bar</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.close}>Done</Text>
        </Pressable>
      </View>

      {/* Navbar mode: dark / light. Dark: dark fill + white icons.
          Light: light fill + dark icons. The blur and refraction work the
          same in both; the pill, icons, edge light and veil all adapt. */}
      <Text style={styles.sectionLabel}>Mode</Text>
      <View style={styles.chips}>
        {(['dark', 'light'] as const).map((mode) => {
          const selected = settings.mode === mode;
          return (
            <Pressable
              key={mode}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => set({ mode })}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {mode === 'dark' ? 'Dark' : 'Light'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Row label="Blur" value={String(Math.round(settings.barBlur))} />
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={settings.barBlur}
        onValueChange={(v) => set({ barBlur: v })}
        minimumTrackTintColor="#FFFFFF"
        maximumTrackTintColor="rgba(255,255,255,0.3)"
        thumbTintColor="#FFFFFF"
      />

      <Row label="Fill" value={settings.fillOpacity.toFixed(2)} />
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        value={settings.fillOpacity}
        onValueChange={(v) => set({ fillOpacity: v })}
        minimumTrackTintColor="#FFFFFF"
        maximumTrackTintColor="rgba(255,255,255,0.3)"
        thumbTintColor="#FFFFFF"
      />

      {/* Legibility veil: an adaptive veil under the icons so they stay
          readable over clear glass. Dark mode: a dark translucent layer.
          Light mode: a light translucent layer. The navbar is frostier
          than the droplet (which is completely clear); this veil plus the
          stronger blur is what makes it so. */}
      <Row label="Legibility veil" value={settings.legibilityVeil.toFixed(2)} />
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        value={settings.legibilityVeil}
        onValueChange={(v) => set({ legibilityVeil: v })}
        minimumTrackTintColor="#FFFFFF"
        maximumTrackTintColor="rgba(255,255,255,0.3)"
        thumbTintColor="#FFFFFF"
      />

      <Row label="Edge light" value={settings.barEdgeReflection.toFixed(2)} />
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        value={settings.barEdgeReflection}
        onValueChange={(v) => set({ barEdgeReflection: v })}
        minimumTrackTintColor="#FFFFFF"
        maximumTrackTintColor="rgba(255,255,255,0.3)"
        thumbTintColor="#FFFFFF"
      />

      <Text style={styles.sectionLabel}>Springs</Text>
      <View style={styles.chips}>
        {SPRING_PRESETS.map((preset) => {
          const selected = settings.springPreset === preset.id;
          return (
            <Pressable
              key={preset.id}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => set({ springPreset: preset.id as SpringPresetId })}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{preset.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Background</Text>
      <View style={styles.chips}>
        {BACKGROUNDS.map((bg) => {
          const selected = backgroundId === bg.id;
          return (
            <Pressable
              key={bg.id}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onBackgroundChange(bg.id)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{bg.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 100,
    backgroundColor: 'rgba(20,20,22,0.92)',
    borderRadius: 20,
    padding: 16,
    zIndex: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    color: '#FFFFFF',
  },
  close: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  rowLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  rowValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#FFFFFF',
  },
  slider: {
    width: '100%',
    height: 32,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 14,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  chipSelected: {
    backgroundColor: '#FFFFFF',
  },
  chipText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  chipTextSelected: {
    fontFamily: 'Inter-Medium',
    color: '#111111',
  },
});
