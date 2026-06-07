import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_complete').then(val => {
      setTarget(val ? '/(tabs)' : '/onboarding');
    });
  }, []);

  if (!target) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f6fb' }}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  return <Redirect href={target as any} />;
}
