import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { API_BASE } from '../constants/api';

const GENDERS = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];

export default function OnboardingScreen() {
  const [name, setName]   = useState('');
  const [age, setAge]     = useState('');
  const [gender, setGender] = useState('');
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name to continue.');
      return;
    }
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/user-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          age: age ? parseInt(age) : undefined,
          gender: gender || undefined,
        }),
      });
      if (gender) {
        await fetch(`${API_BASE}/api/health-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gender: gender.toLowerCase() }),
        });
      }
      await AsyncStorage.setItem('onboarding_complete', 'true');
      router.replace('/(tabs)');
    } catch {
      Alert.alert('Error', 'Could not save profile. Is the server running?');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <Text style={styles.title}>Tell us about you</Text>
        <Text style={styles.subtitle}>This personalises your climate and wellness insights</Text>

        <Text style={styles.label}>Your name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Bhavana"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="words"
        />

        <Text style={styles.label}>Age</Text>
        <TextInput
          style={styles.input}
          value={age}
          onChangeText={setAge}
          placeholder="e.g. 28"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
        />

        <Text style={styles.label}>Gender</Text>
        <View style={styles.genderGrid}>
          {GENDERS.map(g => (
            <TouchableOpacity
              key={g}
              style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
              onPress={() => setGender(g)}
            >
              <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.continueBtn} onPress={finish} disabled={saving}>
          <Text style={styles.continueBtnText}>{saving ? 'Saving…' : 'Get Started'}</Text>
        </TouchableOpacity>

        <Text style={styles.skip} onPress={async () => {
          await AsyncStorage.setItem('onboarding_complete', 'true');
          router.replace('/(tabs)');
        }}>
          Skip for now
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF7ED' },
  content: { padding: 28, paddingBottom: 56 },

  title:    { fontSize: 28, fontWeight: '800', color: '#111827', marginTop: 24, marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6B7280', marginBottom: 32, lineHeight: 22 },

  label: {
    fontSize: 11, fontWeight: '700', color: '#F97316',
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#E8E8E8', padding: 14, fontSize: 15, color: '#111827',
  },

  genderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genderBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#E8E8E8', backgroundColor: '#fff',
  },
  genderBtnActive: { borderColor: '#8B5CF6', backgroundColor: '#F5F3FF' },
  genderText:      { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  genderTextActive: { color: '#8B5CF6' },

  continueBtn: {
    marginTop: 40, backgroundColor: '#F97316',
    borderRadius: 14, padding: 17, alignItems: 'center',
  },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  skip: { marginTop: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 14 },
});
