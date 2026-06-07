import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../context/AuthContext';

function AuthGate() {
  const { user_id, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === 'login';
    if (!user_id && !inLogin) {
      router.replace('/login');
    } else if (user_id && inLogin) {
      router.replace('/');
    }
  }, [user_id, loading]);

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
