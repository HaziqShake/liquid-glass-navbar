/**
 * Simple settings sheet for the demo. Sliders and chips only; no
 * animation library, just a panel that appears above the navbar.
 *
 * Only Haziq's parameters are here: blur, refraction strength, droplet
 * magnification, edge light intensity, veil, mode and background.
 *
 * The sheet is a FIXED overlay (absolute, outside the background
 * ScrollView), so scrolling the background never moves it and the
 * settings never disappear. Its own content scrolls inside a capped
 * ScrollView, so every control stays reachable on a small screen.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { BACKGROUNDS } from '../data/backgrounds';
import type { NavbarSettings } from '../settings/settings';

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

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}): React.JSX.Element {
  return (
    <>
      <Row label={label} value={display} />
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor="#FFFFFF"
        maximumTrackTintColor="rgba(255,255,255,0.3)"
        thumbTintColor="#FFFFFF"
      />
    </>
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

  // Cap the sheet's height so it never runs off the top of a small
  // screen; the controls scroll inside the sheet instead.
  const { height: screenHeight } = useWindowDimensions();

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.title}>Bar</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.close}>Done</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ maxHeight: screenHeight * 0.62 }}
        showsVerticalScrollIndicator={false}
      >
      <SliderRow
        label="Blur"
        value={settings.barBlur}
        display={String(Math.round(settings.barBlur))}
        min={0}
        max={100}
        step={1}
        onChange={(v) => set({ barBlur: v })}
      />

      <SliderRow
        label="Refraction"
        value={settings.refractionStrength}
        display={settings.refractionStrength.toFixed(2)}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => set({ refractionStrength: v })}
      />

      <SliderRow
        label="Droplet magnification"
        value={settings.dropletMagnification}
        display={settings.dropletMagnification.toFixed(2)}
        min={1}
        max={1.6}
        step={0.01}
        onChange={(v) => set({ dropletMagnification: v })}
      />

      <SliderRow
        label="Edge light"
        value={settings.edgeLight}
        display={settings.edgeLight.toFixed(2)}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => set({ edgeLight: v })}
      />

      <SliderRow
        label="Veil"
        value={settings.legibilityVeil}
        display={settings.legibilityVeil.toFixed(2)}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => set({ legibilityVeil: v })}
      />

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
      </ScrollView>
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
