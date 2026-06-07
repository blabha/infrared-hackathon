import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../context/AuthContext';

function AuthGate() {
  const { user_id, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const screen       = segments[0] as string | undefined;
    const inLogin      = screen === 'login';
    const inOnboarding = screen === 'onboarding';
    const inCallback   = screen === 'auth-callback';

    if (!user_id) {
      if (!inLogin && !inCallback) router.replace('/login');
      return;
    }

    // Read fresh from storage so we always catch the write done by onboarding.tsx
    AsyncStorage.getItem('onboarding_complete').then(val => {
      const onboarded = !!val;
      if (!onboarded && !inOnboarding) {
        router.replace('/onboarding');
      } else if (onboarded && (inLogin || inOnboarding || inCallback || screen === undefined)) {
        router.replace('/(tabs)');
      }
    });
  }, [user_id, loading, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
