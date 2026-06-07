import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE } from '../../constants/api';

const WORKOUT_TYPES = ['Running', 'Cycling', 'Swimming', 'Yoga', 'Gym', 'Walking', 'Pilates', 'Other'];

// cycleDay is counted from period START (1 = first day of period)
function getCycleThermalInsight(cycleDay: number): { message: string; color: string; bg: string } {
  if (cycleDay < 1)    return { color: '#9ca3af', bg: '#f9fafb', message: 'Log your period start date to unlock thermal wellness feedback.' };
  if (cycleDay <= 5)   return { color: '#ec4899', bg: '#fdf2f8', message: 'Your period is active — body temp is variable and energy may be lower. Ease into outdoor activity and avoid prolonged heat exposure.' };
  if (cycleDay <= 13)  return { color: '#3b82f6', bg: '#eff6ff', message: 'Follicular phase: rising oestrogen improves heat tolerance — your best window for outdoor workouts and warm environments.' };
  if (cycleDay <= 15)  return { color: '#8b5cf6', bg: '#f5f3ff', message: 'Ovulation: basal body temp rises about 0.3 degrees. You may feel warmer outside — prefer cooler times of day for exercise.' };
  if (cycleDay <= 21)  return { color: '#f59e0b', bg: '#fffbeb', message: 'Luteal phase: progesterone raises core temp 0.3–0.5 degrees — heat tolerance is reduced. Limit intense outdoor activity when UTCI > 32.' };
  return                      { color: '#ef4444', bg: '#fef2f2', message: 'Late luteal (PMS window): fluid retention and high progesterone increase heat sensitivity. Seek shade, hydrate extra, and avoid peak-heat hours.' };
}

export default function HealthScreen() {
  const [profile, setProfile] = useState({
    gender: 'female',
    cycle_day: '',
    cycle_phase: '',
    recent_activity: 'moderate',
    avg_sleep_hrs: '',
    resting_hr_bpm: '',
    notes: '',
  });
  // Date selector
  const [logDate, setLogDate] = useState<Date>(new Date());
  const isToday = logDate.toDateString() === new Date().toDateString();
  const dateStr = logDate.toISOString().slice(0, 10);
  const shiftDay = (n: number) => setLogDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; });
  const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const isWoman = profile.gender?.toLowerCase() === 'female' || profile.gender?.toLowerCase() === 'woman';

  const [loaded, setLoaded] = useState(false);
  const [workoutType, setWorkoutType] = useState('Running');
  const [workoutDuration, setWorkoutDuration] = useState('');
  const [workoutTime, setWorkoutTime] = useState('');
  const [loggingWorkout, setLoggingWorkout] = useState(false);
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [loggingWeight, setLoggingWeight] = useState(false);
  const [loggingPeriod, setLoggingPeriod] = useState(false);
  const [periodDate, setPeriodDate] = useState('');
  const [phaseStatus, setPhaseStatus] = useState<{ day: number; phase: string; color: string } | null>(null);
  const [cycleInsight, setCycleInsight] = useState<{ message: string; color: string; bg: string } | null>(null);

  const PHASE_COLORS: Record<string, string> = {
    'Menstrual': '#ec4899', 'Follicular': '#3b82f6',
    'Ovulatory': '#8b5cf6', 'Luteal': '#f59e0b', 'Late Luteal': '#ef4444',
  };

  const recalcPhase = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health/logs`);
      const logs = await res.json();
      const today = new Date();

      const starts: string[] = (logs.period || [])
        .filter((e: any) => e.event === 'start')
        .map((e: any) => e.date)
        .sort()
        .reverse();
      if (starts.length) {
        const lastStart = new Date(starts[0]);
        const rawDay = Math.floor((today.getTime() - lastStart.getTime()) / 86400000) + 1;
        const cycleDay = ((rawDay - 1) % 28) + 1;
        let phase = 'Late Luteal';
        if (cycleDay <= 5) phase = 'Menstrual';
        else if (cycleDay <= 13) phase = 'Follicular';
        else if (cycleDay <= 15) phase = 'Ovulatory';
        else if (cycleDay <= 21) phase = 'Luteal';
        setPhaseStatus({ day: cycleDay, phase, color: PHASE_COLORS[phase] ?? '#94a3b8' });
        setCycleInsight(getCycleThermalInsight(cycleDay));
      }
    } catch {}
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/health-profile`)
      .then(r => r.json())
      .then(data => {
        if (data && Object.keys(data).length) {
          setProfile(p => ({ ...p, ...data }));
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    recalcPhase();
  }, []);

  const logWorkout = async () => {
    if (!workoutDuration.trim()) { Alert.alert('Enter duration'); return; }
    setLoggingWorkout(true);
    try {
      await fetch(`${API_BASE}/api/health/log-workout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: workoutType, duration_min: parseInt(workoutDuration), logged_at: `${dateStr}T${workoutTime || '00:00'}:00` }),
      });
      setWorkoutDuration('');
      Alert.alert('Logged', `${workoutType} — ${workoutDuration} min on ${fmtDate(logDate)}`);
    } catch {
      Alert.alert('Error', 'Could not log workout.');
    } finally {
      setLoggingWorkout(false);
    }
  };

  const logWeight = async () => {
    if (!weight.trim()) { Alert.alert('Enter weight'); return; }
    setLoggingWeight(true);
    try {
      const kg = weightUnit === 'lbs' ? parseFloat(weight) * 0.453592 : parseFloat(weight);
      await fetch(`${API_BASE}/api/health/log-weight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight_kg: Math.round(kg * 10) / 10, logged_at: `${dateStr}T00:00:00` }),
      });
      setWeight('');
      Alert.alert('Logged', `${weight} ${weightUnit} on ${fmtDate(logDate)}`);
    } catch {
      Alert.alert('Error', 'Could not log weight.');
    } finally {
      setLoggingWeight(false);
    }
  };

  const logPeriod = async (event: 'start' | 'end') => {
    setLoggingPeriod(true);
    try {
      let targetDate = dateStr;
      if (periodDate.trim()) {
        const parts = periodDate.replace(/\D/g, '');
        if (parts.length === 6) {
          const dd = parts.slice(0, 2);
          const mm = parts.slice(2, 4);
          const yy = parts.slice(4, 6);
          targetDate = `20${yy}-${mm}-${dd}`;
        } else {
          Alert.alert('Invalid date', 'Use DD/MM/YY format, e.g. 01/06/25');
          setLoggingPeriod(false);
          return;
        }
      }
      await fetch(`${API_BASE}/api/health/log-period`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, date: targetDate }),
      });
      await fetch(`${API_BASE}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: event === 'start' ? 'Period Start' : 'Period End',
          time: `${targetDate}T00:00:00`,
        }),
      });
      Alert.alert('Logged', `Period ${event} added — ${targetDate}`);
      recalcPhase();
    } catch {
      Alert.alert('Error', 'Could not log period.');
    } finally {
      setLoggingPeriod(false);
    }
  };

  if (!loaded) return (
    <SafeAreaView style={st.center}>
      <ActivityIndicator size="large" color="#0ea5e9" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <View style={st.header}>
        <Text style={st.title}>Health</Text>
        {phaseStatus && isWoman && (
          <View style={[st.phaseBadge, { backgroundColor: phaseStatus.color + '20', borderColor: phaseStatus.color }]}>
            <Text style={[st.phaseBadgeText, { color: phaseStatus.color }]}>
              {phaseStatus.phase}  ·  Day {phaseStatus.day}
            </Text>
          </View>
        )}
      </View>

      {/* Date navigator */}
      <View style={st.datebar}>
        <TouchableOpacity onPress={() => shiftDay(-1)} style={st.dateArrow}>
          <Text style={st.dateArrowText}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setLogDate(new Date())} disabled={isToday}>
          <Text style={st.dateLabel}>{isToday ? 'Today' : fmtDate(logDate)}</Text>
          {!isToday && <Text style={st.dateSub}>{fmtDate(logDate) !== 'Today' ? 'Tap to go to today' : ''}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftDay(1)} style={st.dateArrow} disabled={isToday}>
          <Text style={[st.dateArrowText, isToday && { opacity: 0.3 }]}>›</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">

        {/* ── Log Workout ── */}
        <Text style={st.section}>Log Workout</Text>

        <Text style={st.label}>Type</Text>
        <View style={st.typeGrid}>
          {WORKOUT_TYPES.map(t => (
            <TouchableOpacity
              key={t}
              style={[st.typeChip, workoutType === t && st.typeChipActive]}
              onPress={() => setWorkoutType(t)}
            >
              <Text style={[st.typeChipText, workoutType === t && st.typeChipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={st.row}>
          <View style={st.half}>
            <Text style={st.label}>Duration (min)</Text>
            <TextInput
              style={st.input}
              value={workoutDuration}
              onChangeText={setWorkoutDuration}
              placeholder="e.g. 45"
              keyboardType="numeric"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={st.half}>
            <Text style={st.label}>Time of day</Text>
            <TextInput
              style={st.input}
              value={workoutTime}
              onChangeText={setWorkoutTime}
              placeholder="e.g. 07:30"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
            />
          </View>
        </View>

        <TouchableOpacity style={st.greenBtn} onPress={logWorkout} disabled={loggingWorkout}>
          <Text style={st.primaryBtnText}>{loggingWorkout ? 'Logging…' : 'Log Workout'}</Text>
        </TouchableOpacity>

        {/* ── Log Weight ── */}
        <Text style={st.section}>Log Weight</Text>

        <View style={st.weightRow}>
          <TextInput
            style={[st.input, { flex: 1 }]}
            value={weight}
            onChangeText={setWeight}
            placeholder={`Weight in ${weightUnit}`}
            keyboardType="decimal-pad"
            placeholderTextColor="#94a3b8"
          />
          <View style={st.unitToggle}>
            {(['kg', 'lbs'] as const).map(u => (
              <TouchableOpacity
                key={u}
                style={[st.unitBtn, weightUnit === u && st.unitBtnActive]}
                onPress={() => setWeightUnit(u)}
              >
                <Text style={[st.unitBtnText, weightUnit === u && st.unitBtnTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={st.slateBtn} onPress={logWeight} disabled={loggingWeight}>
          <Text style={st.primaryBtnText}>{loggingWeight ? 'Logging…' : 'Log Weight'}</Text>
        </TouchableOpacity>

        {/* ── Period Tracking (women only) ── */}
        {isWoman && (
          <>
            <Text style={st.section}>Period Tracking</Text>
            <Text style={st.label}>Date (DD/MM/YY)</Text>
            <TextInput
              style={st.input}
              value={periodDate}
              onChangeText={v => {
                const digits = v.replace(/\D/g, '').slice(0, 6);
                let formatted = digits;
                if (digits.length > 2) formatted = `${digits.slice(0,2)}/${digits.slice(2)}`;
                if (digits.length > 4) formatted = `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
                setPeriodDate(formatted);
                if (digits.length === 6) {
                  const entered = new Date(`20${digits.slice(4)}-${digits.slice(2,4)}-${digits.slice(0,2)}`);
                  if (!isNaN(entered.getTime())) {
                    const rawDay = Math.floor((Date.now() - entered.getTime()) / 86400000) + 1;
                    const cycleDay = ((rawDay - 1) % 28) + 1;
                    setCycleInsight(getCycleThermalInsight(cycleDay));
                  }
                }
              }}
              placeholder={`e.g. ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'2-digit' })}`}
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
              maxLength={8}
            />
            <Text style={st.hint}>Leave blank to use the date selected above</Text>
            <View style={[st.row, { marginTop: 12 }]}>
              <TouchableOpacity style={[st.periodBtn, { backgroundColor: '#ec4899' }]} onPress={() => logPeriod('start')} disabled={loggingPeriod}>
                <Text style={st.primaryBtnText}>{loggingPeriod ? 'Logging…' : 'Log Period Start'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.periodBtn, { backgroundColor: '#94a3b8' }]} onPress={() => logPeriod('end')} disabled={loggingPeriod}>
                <Text style={st.primaryBtnText}>{loggingPeriod ? 'Logging…' : 'Log Period End'}</Text>
              </TouchableOpacity>
            </View>

            {cycleInsight && (
              <View style={[st.insightCard, { backgroundColor: cycleInsight.bg, borderColor: cycleInsight.color }]}>
                <Text style={[st.insightLabel, { color: cycleInsight.color }]}>Thermal Wellness</Text>
                <Text style={[st.insightText, { color: cycleInsight.color }]}>{cycleInsight.message}</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F3FF' },
  header: { padding: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  phaseBadge: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5 },
  phaseBadgeText: { fontSize: 13, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },

  datebar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#e8e8e8' },
  dateArrow: { padding: 8 },
  dateArrowText: { fontSize: 24, color: '#0ea5e9', fontWeight: '400' },
  dateLabel: { fontSize: 15, fontWeight: '700', color: '#111827', textAlign: 'center' },
  dateSub: { fontSize: 10, color: '#0ea5e9', textAlign: 'center', marginTop: 1 },

  section: { fontSize: 13, fontWeight: '700', color: '#F97316', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 24, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#FED7AA' },
  label: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },

  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e8e8e8', padding: 12, fontSize: 14, color: '#111827' },
  textArea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },

  phaseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  phaseCard: { flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#e8e8e8' },
  phaseCardActive: { borderColor: '#0ea5e9', backgroundColor: '#f0f9ff' },
  phaseLabel: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 2 },
  phaseLabelActive: { color: '#0ea5e9' },
  phaseDays: { fontSize: 11, color: '#6b7280', marginBottom: 2 },
  phaseDesc: { fontSize: 11, color: '#94a3b8' },

  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#e8e8e8', backgroundColor: '#fff' },
  chipActive: { borderColor: '#0ea5e9', backgroundColor: '#f0f9ff' },
  chipText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  chipTextActive: { color: '#0ea5e9' },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#e8e8e8', backgroundColor: '#fff' },
  typeChipActive: { borderColor: '#F97316', backgroundColor: '#FFF7ED' },
  typeChipText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  typeChipTextActive: { color: '#F97316' },

  weightRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  unitToggle: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: '#e8e8e8', overflow: 'hidden' },
  unitBtn: { paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff' },
  unitBtnActive: { backgroundColor: '#0ea5e9' },
  unitBtnText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  unitBtnTextActive: { color: '#fff' },

  primaryBtn: { marginTop: 16, backgroundColor: '#F97316', borderRadius: 12, padding: 14, alignItems: 'center' },
  greenBtn:   { marginTop: 16, backgroundColor: '#F97316', borderRadius: 12, padding: 14, alignItems: 'center' },
  slateBtn:   { marginTop: 16, backgroundColor: '#8B5CF6', borderRadius: 12, padding: 14, alignItems: 'center' },
  periodBtn:  { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  hint: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  insightCard: { marginTop: 14, borderRadius: 12, borderWidth: 1.5, padding: 12 },
  insightLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  insightText: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
});
