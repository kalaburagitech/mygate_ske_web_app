import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { View, LogBox } from 'react-native';

// React Native 0.76+ deprecates core SafeAreaView; some dependencies still trigger this until they migrate.
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);
// import { ConvexProvider, ConvexReactClient } from 'convex/react';
import RootNavigator from './src/navigation/RootNavigator';
import { AuthProvider } from './src/context/AuthContext';

// import { CONVEX_URL } from './src/services/api';

// Initialize Convex Client
// const convex = new ConvexReactClient(CONVEX_URL);

import Toast from 'react-native-toast-message';
import { toastConfig } from './src/utils/toastUtils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <View style={{ flex: 1, backgroundColor: '#020617' }}>
          <NavigationContainer>
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
        </View>
        <Toast config={toastConfig} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
