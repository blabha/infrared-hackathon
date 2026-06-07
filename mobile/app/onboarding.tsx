import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { API_BASE } from '../constants/api';
import { useAuth } from '../context/AuthContext';

const GENDERS = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];

export default function OnboardingScreen() {
  const { user_id } = useAuth();
  const [name, setName]     = useState('');
  const [age, setAge]       = useState('');
  const [gender, setGender] = useState('');
  const [saving, setSaving] = useState(false);

  const [calSyncing, setCalSyncing] = useState(false);
  const [calSynced,  setCalSynced]  = useState(false);
  const [calError,   setCalError]   = useState('');

  const [healthEnabled, setHealthEnabled] = useState(false);

  const syncCalendar = async () => {
    if (!user_id) { Alert.alert('Sign in required', 'Please sign in first.'); return; }
    setCalSyncing(true);
    setCalError('');
    try {
      const res = await fetch(`${API_BASE}/api/run?user_id=${encodeURIComponent(user_id)}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setCalSynced(true);
    } catch (e: any) {
      setCalError(e?.message ? String(e.message).slice(0, 120) : 'Could not sync — try again from the Events tab.');
    } finally {
      setCalSyncing(false);
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
          name:               name.trim(),
          age:                age ? parseInt(age) : undefined,
          gender:             gender || undefined,
          calendar_connected: calSynced,
          health_connected:   healthEnabled,
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
      router.replace(healthEnabled ? '/(tabs)/health' : '/(tabs)');
    } catch {
      Alert.alert('Error', 'Could not save profile. Please try again.');
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

        {/* ── Connect your data ── */}
        <Text style={styles.sectionTitle}>Connect your data</Text>

        {/* Calendar card */}
        <View style={[styles.connectCard, calSynced && styles.connectCardDone]}>
          <View style={styles.connectBody}>
            <Text style={styles.connectCardTitle}>Google Calendar</Text>
            <Text style={styles.connectCardDesc}>
              Import your upcoming events with climate, weather, and AI insights
            </Text>
            {calError ? <Text style={styles.connectError}>{calError}</Text> : null}
          </View>
          <TouchableOpacity
            style={[styles.connectBtn, calSynced && styles.connectBtnDone]}
            onPress={syncCalendar}
            disabled={calSyncing || calSynced}
          >
            {calSyncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.connectBtnText}>{calSynced ? 'Synced' : 'Sync'}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Health card */}
        <View style={[styles.connectCard, healthEnabled && styles.connectCardDone]}>
          <View style={styles.connectBody}>
            <Text style={styles.connectCardTitle}>Health Tracking</Text>
            <Text style={styles.connectCardDesc}>
              Log workouts, weight, and cycle data for personalised thermal wellness advice
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.connectBtn, healthEnabled && styles.connectBtnDone]}
            onPress={() => setHealthEnabled(v => !v)}
          >
            <Text style={styles.connectBtnText}>{healthEnabled ? 'Enabled' : 'Enable'}</Text>
          </TouchableOpacity>
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
  content:   { padding: 28, paddingBottom: 56 },

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
  genderBtnActive:  { borderColor: '#8B5CF6', backgroundColor: '#F5F3FF' },
  genderText:       { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  genderTextActive: { color: '#8B5CF6' },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#F97316',
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 36, marginBottom: 14,
  },

  connectCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5,
    borderColor: '#E8E8E8', padding: 16, marginBottom: 12, gap: 12,
  },
  connectCardDone: { borderColor: '#22C55E', backgroundColor: '#F0FDF4' },
  connectBody: { flex: 1 },
  connectCardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  connectCardDesc:  { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  connectError:     { fontSize: 12, color: '#EF4444', marginTop: 6 },

  connectBtn: {
    backgroundColor: '#F97316', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9, minWidth: 64, alignItems: 'center',
  },
  connectBtnDone:  { backgroundColor: '#22C55E' },
  connectBtnText:  { color: '#fff', fontWeight: '700', fontSize: 13 },

  continueBtn: {
    marginTop: 36, backgroundColor: '#F97316',
    borderRadius: 14, padding: 17, alignItems: 'center',
  },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  skip: { marginTop: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 14 },
});
