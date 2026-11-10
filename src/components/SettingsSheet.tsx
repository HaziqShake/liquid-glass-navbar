import React from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Switch,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { X, ImageSquare } from 'phosphor-react-native';
import { useNavbarSettings } from '../settings/SettingsContext';
import {
  PRESETS,
  SETTINGS_SECTIONS,
  type ControlDef,
} from '../settings/settings';
import { BACKGROUNDS } from '../data/backgrounds';

function formatValue(step: number, value: number): string {
  if (step >= 1) return `${Math.round(value)}`;
  if (step >= 0.1) return value.toFixed(1);
  if (step >= 0.01) return value.toFixed(2);
  return value.toFixed(3);
}

export interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Settings sheet: every tweakable value of the navbar, live. Plain
 * ScrollView, deliberately NOT wired to the navbar scroll handler, a modal
 * scroll must never drive the navbar (that crash is in the skill).
 */
export const SettingsSheet: React.FC<SettingsSheetProps> = ({
  visible,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const {
    settings,
    update,
    applyPreset,
    reset,
    presetName,
    backgroundId,
    setBackgroundId,
    customPhotoUri,
    pickPhoto,
    focusMode,
    setFocusMode,
  } = useNavbarSettings();

  // In focus mode the sheet lifts above the navbar so the bar stays
  // visible while you tweak: bar height + bottom inset + a small gap.
  // The bar never shrinks in focus mode (no scrollable content), so the
  // full bar height is the right lift.
  const sheetLift = focusMode
    ? settings.barHeight + Math.max(insets.bottom, 12) + 16
    : 0;

  const renderControl = (control: ControlDef) => {
    if (control.kind === 'toggle') {
      const value = settings[control.key] as boolean;
      return (
        <View key={control.key} style={styles.row}>
          <Text style={styles.rowLabel}>{control.label}</Text>
          <Switch
            value={value}
            onValueChange={(v) => update(control.key, v)}
            trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#22C55E' }}
            thumbColor="#FFFFFF"
          />
        </View>
      );
    }
    const value = settings[control.key] as number;
    return (
      <View key={control.key} style={styles.sliderRow}>
        <View style={styles.sliderHeader}>
          <Text style={styles.rowLabel}>{control.label}</Text>
          <Text style={styles.rowValue}>
            {formatValue(control.step, value)}
          </Text>
        </View>
        <Slider
          value={value}
          minimumValue={control.min}
          maximumValue={control.max}
          step={control.step}
          onValueChange={(v) => update(control.key, v)}
          minimumTrackTintColor="#22C55E"
          maximumTrackTintColor="rgba(255,255,255,0.2)"
          thumbTintColor="#22C55E"
          style={styles.slider}
        />
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.backdrop,
          focusMode && { backgroundColor: 'transparent' },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          style={[
            StyleSheet.absoluteFill,
            focusMode && { bottom: sheetLift },
          ]}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
            focusMode && { marginBottom: sheetLift },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Navbar settings</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={reset} activeOpacity={0.7}>
                <Text style={styles.resetText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                <X size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.presetRow}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.name}
                style={[
                  styles.presetChip,
                  presetName === p.name && styles.presetChipActive,
                ]}
                onPress={() => applyPreset(p.name)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.presetText,
                    presetName === p.name && styles.presetTextActive,
                  ]}
                >
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
            {presetName === 'Custom' && (
              <View style={[styles.presetChip, styles.presetChipActive]}>
                <Text style={[styles.presetText, styles.presetTextActive]}>
                  Custom
                </Text>
              </View>
            )}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.sectionTitle}>Background</Text>
            <Text style={styles.subLabel}>Photos</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbRow}
            >
              {customPhotoUri && (
                <TouchableOpacity
                  onPress={() => setBackgroundId('custom-photo')}
                  activeOpacity={0.7}
                >
                  <Image
                    source={{ uri: customPhotoUri }}
                    style={[
                      styles.thumb,
                      backgroundId === 'custom-photo' && styles.thumbActive,
                    ]}
                  />
                </TouchableOpacity>
              )}
              {BACKGROUNDS.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => setBackgroundId(b.id)}
                  activeOpacity={0.7}
                >
                  <Image
                    source={b.source}
                    style={[
                      styles.thumb,
                      backgroundId === b.id && styles.thumbActive,
                    ]}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.photoButton}
              onPress={pickPhoto}
              activeOpacity={0.7}
            >
              <ImageSquare size={20} color="#FFFFFF" />
              <Text style={styles.photoButtonText}>
                {customPhotoUri ? 'Choose a different photo' : 'Choose your own photo'}
              </Text>
            </TouchableOpacity>

            <View style={styles.focusRow}>
              <View style={styles.focusText}>
                <Text style={styles.rowLabel}>Focus mode</Text>
                <Text style={styles.sectionNote}>
                  Hide the demo content and lift this sheet above the navbar,
                  so the bar stays visible while you tweak.
                </Text>
              </View>
              <Switch
                value={focusMode}
                onValueChange={setFocusMode}
                trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#22C55E' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {SETTINGS_SECTIONS.map((section) => (
              <View key={section.title}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.note && (
                  <Text style={styles.sectionNote}>{section.note}</Text>
                )}
                {section.controls.map(renderControl)}
              </View>
            ))}

            <Text style={styles.footer}>
              Changes apply live. Reset restores the Water preset.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 20,
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  resetText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#22C55E',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  presetChipActive: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  presetText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#FFFFFF',
  },
  presetTextActive: {
    color: '#111111',
  },
  scrollContent: {
    paddingBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: '#FFFFFF',
    marginTop: 18,
    marginBottom: 4,
  },
  sectionNote: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
    lineHeight: 16,
  },
  subLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 12,
    marginBottom: 8,
  },
  thumbRow: {
    gap: 8,
    paddingRight: 8,
  },
  thumb: {
    width: 72,
    height: 48,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: {
    borderColor: '#22C55E',
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  photoButtonText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#FFFFFF',
  },
  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
    paddingVertical: 4,
  },
  focusText: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  sliderRow: {
    paddingVertical: 6,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#FFFFFF',
  },
  rowValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  slider: {
    width: '100%',
    height: 32,
  },
  footer: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
});
