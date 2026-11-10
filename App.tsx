import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DemoScreen } from './src/screens/DemoScreen';

function App(): React.JSX.Element {
  const [fontsLoaded] = useFonts({
    'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('./assets/fonts/Inter-Medium.ttf'),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F0F0F', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DemoScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
