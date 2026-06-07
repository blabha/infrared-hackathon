import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { API_BASE } from '../constants/api';

const GENDERS = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];

export default function OnboardingScreen() {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [healthConnected, setHealthConnected] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [saving, setSaving] = useState(false);

  const connectHealth = () => {
    Alert.alert(
      'Apple Health',
      Platform.OS === 'ios'
        ? 'Health data access granted. Sleep, heart rate and activity will personalise your suggestions.'
        : 'Health data is not available on this platform.',
      [{ text: 'OK', onPress: () => setHealthConnected(true) }],
    );
  };

  const checkCalendar = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/calendar/status`);
      const data = await res.json();
      if (data.connected) {
        setCalendarConnected(true);
        Alert.alert('Google Calendar', 'Your calendar is connected!');
      } else {
        Alert.alert('Not connected', 'Run the server OAuth flow first, then try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not reach server. Is it running?');
    }
  };

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
          health_connected: healthConnected,
          calendar_connected: calendarConnected,
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
        <Text style={styles.logo}>🌡</Text>
        <Text style={styles.title}>Climate Planner</Text>
        <Text style={styles.subtitle}>Personalise your outdoor experience</Text>

        <Text style={styles.label}>Your name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Bhavana"
          placeholderTextColor="#94a3b8"
          autoCapitalize="words"
        />

        <Text style={styles.label}>Age</Text>
        <TextInput
          style={styles.input}
          value={age}
          onChangeText={setAge}
          placeholder="e.g. 28"
          placeholderTextColor="#94a3b8"
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

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Connect your data</Text>

        <TouchableOpacity
          style={[styles.connectBtn, healthConnected && styles.connectBtnDone]}
          onPress={connectHealth}
        >
          <Text style={styles.connectIcon}>❤️</Text>
          <View style={styles.connectText}>
            <Text style={styles.connectLabel}>Apple Health</Text>
            <Text style={styles.connectDesc}>
              {healthConnected ? 'Connected' : 'Sleep, heart rate & activity'}
            </Text>
          </View>
          <Text style={[styles.connectArrow, healthConnected && styles.connectCheck]}>
            {healthConnected ? '✓' : '→'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.connectBtn, calendarConnected && styles.connectBtnDone]}
          onPress={checkCalendar}
        >
          <Text style={styles.connectIcon}>📅</Text>
          <View style={styles.connectText}>
            <Text style={styles.connectLabel}>Google Calendar</Text>
            <Text style={styles.connectDesc}>
              {calendarConnected ? 'Connected' : 'Your weekly events'}
            </Text>
          </View>
          <Text style={[styles.connectArrow, calendarConnected && styles.connectCheck]}>
            {calendarConnected ? '✓' : '→'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.continueBtn} onPress={finish} disabled={saving}>
          <Text style={styles.continueBtnText}>{saving ? 'Saving…' : 'Get Started'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f6fb' },
  content: { padding: 24, paddingBottom: 48 },
  logo: { fontSize: 52, textAlign: 'center', marginTop: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#0f2535', textAlign: 'center', marginTop: 10 },
  subtitle: { fontSize: 15, color: '#6b90a8', textAlign: 'center', marginBottom: 28 },
  label: {
    fontSize: 11, fontWeight: '700', color: '#6b90a8',
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#d0e4f0', padding: 14, fontSize: 15, color: '#0f2535',
  },
  genderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genderBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#d0e4f0', backgroundColor: '#fff',
  },
  genderBtnActive: { borderColor: '#0ea5e9', backgroundColor: '#f0f9ff' },
  genderText: { fontSize: 13, fontWeight: '600', color: '#6b90a8' },
  genderTextActive: { color: '#0ea5e9' },
  divider: { height: 1, backgroundColor: '#d0e4f0', marginVertical: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f2535', marginBottom: 12 },
  connectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: '#d0e4f0', marginBottom: 10,
  },
  connectBtnDone: { borderColor: '#22c55e', backgroundColor: '#f0fdf4' },
  connectIcon: { fontSize: 26 },
  connectText: { flex: 1 },
  connectLabel: { fontSize: 14, fontWeight: '700', color: '#0f2535' },
  connectDesc: { fontSize: 12, color: '#6b90a8', marginTop: 2 },
  connectArrow: { fontSize: 16, fontWeight: '700', color: '#0ea5e9' },
  connectCheck: { color: '#22c55e' },
  continueBtn: {
    marginTop: 32, backgroundColor: '#0ea5e9',
    borderRadius: 14, padding: 17, alignItems: 'center',
  },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
