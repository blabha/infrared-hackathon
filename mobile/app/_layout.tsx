import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../context/AuthContext';

function AuthGate() {
  const { user_id, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_complete').then(val => setOnboarded(!!val));
  }, [user_id]);

  useEffect(() => {
    if (loading || onboarded === null) return;
    const screen = segments[0] as string | undefined;
    const inLogin      = screen === 'login';
    const inOnboarding = screen === 'onboarding';
    const inTabs       = screen === '(tabs)';

    if (!user_id) {
      if (!inLogin) router.replace('/login');
      return;
    }
    // Authenticated
    if (!onboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (onboarded && (inLogin || inOnboarding || screen === undefined)) {
      router.replace('/(tabs)');
    }
  }, [user_id, loading, onboarded, segments]);

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
