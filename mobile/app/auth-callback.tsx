import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';

export default function AuthCallbackScreen() {
  const { user_id, email, name, access_token, refresh_token, error } = useLocalSearchParams<{
    user_id?: string;
    email?: string;
    name?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
  }>();
  const router = useRouter();
  const { loadSession } = useAuth();

  useEffect(() => {
    const finish = async () => {
      if (error || !user_id) {
        router.replace('/login');
        return;
      }
      const pairs: [string, string][] = [
        ['user_id', user_id],
        ['email',   email ?? ''],
        ['name',    name  ?? ''],
      ];
      if (access_token) pairs.push(['access_token', access_token]);
      if (refresh_token) pairs.push(['refresh_token', refresh_token]);
      await AsyncStorage.multiSet(pairs);
      await loadSession();
      const onboarded = await AsyncStorage.getItem('onboarding_complete');
      router.replace(onboarded ? '/(tabs)' : '/onboarding');
    };
    finish();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#F97316" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF7ED' },
});
