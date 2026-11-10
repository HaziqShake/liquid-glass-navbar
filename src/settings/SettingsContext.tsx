import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import {
  DEFAULT_SETTINGS,
  PRESETS,
  type BooleanSettingKey,
  type NavbarSettings,
  type NumericSettingKey,
} from './settings';

interface SettingsContextValue {
  settings: NavbarSettings;
  /** Same settings, mirrored for the jelly worklets (read every frame). */
  settingsShared: SharedValue<NavbarSettings>;
  update: (key: NumericSettingKey | BooleanSettingKey, value: number | boolean) => void;
  applyPreset: (name: string) => void;
  reset: () => void;
  presetName: string;
  backgroundId: string;
  setBackgroundId: (id: string) => void;
  customPhotoUri: string | null;
  /** Opens the photo library and uses the picked photo as the background. */
  pickPhoto: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useState<NavbarSettings>(DEFAULT_SETTINGS);
  const [presetName, setPresetName] = useState('Water');
  const settingsShared = useSharedValue<NavbarSettings>(DEFAULT_SETTINGS);
  const [backgroundId, setBackgroundId] = useState('mountain-lake');
  const [customPhotoUri, setCustomPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    settingsShared.value = settings;
  }, [settings]);

  const update = (
    key: NumericSettingKey | BooleanSettingKey,
    value: number | boolean,
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setPresetName('Custom');
  };

  const applyPreset = (name: string) => {
    const preset = PRESETS.find((p) => p.name === name);
    if (!preset) return;
    setSettings(preset.settings);
    setPresetName(name);
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    setPresetName('Water');
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setCustomPhotoUri(result.assets[0].uri);
      setBackgroundId('custom-photo');
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        settingsShared,
        update,
        applyPreset,
        reset,
        presetName,
        backgroundId,
        setBackgroundId,
        customPhotoUri,
        pickPhoto,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export function useNavbarSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useNavbarSettings must be used inside SettingsProvider');
  }
  return ctx;
}
