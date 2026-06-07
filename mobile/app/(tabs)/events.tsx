import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';

type ActivityType = 'outdoor_exercise' | 'indoor_exercise' | 'outdoor_leisure' | 'work' | 'other';

function getActivityType(ev: Record<string, any>): ActivityType {
  const t = (ev.title ?? '').toLowerCase();
  const exercise = /run|jog|cycl|yoga|gym|pilates|swim|workout|exercise|hiit|crossfit|training|spin|bootcamp|tennis|football|basketball|5k|10k|marathon/.test(t);
  const outdoorEx = /run|jog|cycl|hike|bike|surf|outdoor run|outdoor swim/.test(t);
  const outdoorLeisure = /beach|park|picnic|walk|stroll|garden|sightseeing|hike/.test(t);
  const work = /meeting|work|office|class|lecture|seminar|conference|school|university|eada|presentation|interview|workshop/.test(t);
  if (exercise && (outdoorEx || ev.setting === 'outdoor')) return 'outdoor_exercise';
  if (exercise) return 'indoor_exercise';
  if (outdoorLeisure || ev.setting === 'outdoor') return 'outdoor_leisure';
  if (work) return 'work';
  return 'other';
}

// Cycle day is counted from period START (day 1 = first day of period)
function getCyclePhaseNote(
  eventDate: Date,
  lastPeriodStart: Date,
  utci: number | null,
  ev: Record<string, any>,
): { note: string; food: string; color: string; bg: string } {
  const raw = Math.floor((eventDate.getTime() - lastPeriodStart.getTime()) / 86400000) + 1;
  const d = ((raw - 1) % 28) + 1; // 1–28
  const hot = utci != null && utci >= 32;
  const act = getActivityType(ev);

  // Days 1–5: Menstrual
  if (d <= 5) return {
    color: '#ec4899', bg: '#fdf2f8',
    note: act === 'outdoor_exercise'
      ? (hot ? `Your period is active and it's hot — this is not the day for a hard session outside. Go very easy or rest, and stop immediately if cramping kicks in.`
             : `Your period is active — gentle movement is fine, but don't push pace or distance. Listen to your body and rest if needed.`)
      : act === 'indoor_exercise'
      ? `Your period is active — gentle indoor movement is fine. Yoga or a light walk is ideal; ease off any high-intensity work.`
      : act === 'outdoor_leisure'
      ? (hot ? `Your period is active and it's warm — take it slow, stay in shade and keep water close.`
             : `Your period is active. A quiet time outside is fine — just don't overdo it.`)
      : act === 'work'
      ? `Your period is active — energy and focus may be low. Keep expectations of yourself realistic and front-load any important points early.`
      : (hot ? `Your period is active and it's a hot one — take it easy, your body needs extra care right now.`
             : `Your period is active. Be gentle with yourself — rest matters more than output today.`),
    food: (act === 'outdoor_exercise' || act === 'indoor_exercise')
      ? `Iron-rich foods (lentils, spinach, red meat) help replace what you've lost. Keep a light snack ready — banana or dates work well before gentle movement. Avoid heavy meals before exercise.`
      : `Iron-rich foods like lentils, spinach or red meat help replace what you've lost. Ginger tea and dark chocolate ease cramps.`,
  };

  // Days 6–13: Follicular
  if (d <= 13) return {
    color: '#3b82f6', bg: '#eff6ff',
    note: act === 'outdoor_exercise'
      ? (hot ? `Follicular phase is your power window — heat tolerance is at its monthly best. Still drink plenty; even strong phases need hydration in this warmth.`
             : `Follicular phase is your power window — oestrogen is rising, heat tolerance is high and energy is building. A great time to push your training.`)
      : act === 'indoor_exercise'
      ? `Follicular phase: strength, coordination and endurance are all rising with oestrogen. A brilliant week to challenge yourself in the studio or gym.`
      : act === 'outdoor_leisure'
      ? (hot ? `Follicular phase — heat tolerance is strong this week. Even so, drink plenty and don't skip the sunscreen.`
             : `Follicular phase — oestrogen is building and energy is up. A naturally good day to be outside.`)
      : act === 'work'
      ? `Follicular phase boosts focus, verbal fluency and confidence. Strong timing for presentations, pitches or anything that needs clear thinking.`
      : (hot ? `Follicular phase — heat tolerance is at its monthly peak. Still stay hydrated in this warmth.`
             : `Follicular phase — energy is building and heat tolerance is high. One of the best times of your cycle.`),
    food: (act === 'outdoor_exercise' || act === 'indoor_exercise')
      ? `Flaxseed and pumpkin seeds support rising oestrogen. A light carb + protein combo before training works well — oat bar, banana and yogurt. Refuel with protein and colourful veg after.`
      : `Flaxseed and pumpkin seeds support rising oestrogen. Light proteins, fermented foods (yogurt, kefir) and colourful veg keep energy steady.`,
  };

  // Days 14–15: Ovulatory
  if (d <= 15) return {
    color: '#8b5cf6', bg: '#f5f3ff',
    note: act === 'outdoor_exercise'
      ? (hot ? `Around ovulation — basal temp is elevated and it's warm. That's a double heat load. Shift to early morning or evening if you can, and hydrate before you start.`
             : `Around ovulation — basal temp is slightly up so you may feel warmer mid-session than expected. Extra recovery time and consistent sipping help.`)
      : act === 'indoor_exercise'
      ? `Around ovulation, joints can be slightly more lax due to peak oestrogen — warm up carefully before any high-impact work. Endurance is still strong.`
      : act === 'outdoor_leisure'
      ? (hot ? `Around ovulation — basal temp is elevated and it's warm outside. Plan for shade breaks and keep fluids topped up.`
             : `Around ovulation — basal temp is slightly higher so you may feel warmer in the sun. Lighter layers and shade help.`)
      : act === 'work'
      ? `Ovulation often brings a social and communication confidence peak — well timed for any high-visibility moment, negotiation or team event.`
      : (hot ? `Around ovulation — basal temp is elevated and it's warm. You may feel hotter than expected; try to stay cool.`
             : `Around ovulation — your basal temp is slightly higher, so you may feel warmer than usual today.`),
    food: (act === 'outdoor_exercise' || act === 'indoor_exercise')
      ? `Cooling foods — cucumber, watermelon, mint — help offset the temp rise. Coconut water is great for hydration. A light carb + protein snack before training works well.`
      : `Cooling foods like cucumber, watermelon and mint help balance the temp rise. Coconut water is great for hydration around ovulation.`,
  };

  // Days 16–21: Luteal
  if (d <= 21) return {
    color: '#f59e0b', bg: '#fffbeb',
    note: act === 'outdoor_exercise'
      ? (hot ? `Luteal phase with heat — progesterone has raised your core temp and it's warm outside. Your body is working harder than it looks. Shorten the session, take proper shade breaks and stop if you feel faint.`
             : `Luteal phase — progesterone has raised your core temp, so you'll fatigue faster than usual. Shorter intervals, more recovery time, and don't skip the cool-down.`)
      : act === 'indoor_exercise'
      ? `Luteal phase: core temp is elevated and you'll fatigue faster. Drop the intensity a notch, focus on form over pace and prioritise your cool-down.`
      : act === 'outdoor_leisure'
      ? (hot ? `Luteal phase and it's warm — you'll feel the heat more acutely than usual. Seek shade, drink often and take your time.`
             : `Luteal phase — you'll feel warmer outside than usual this week. Build in shade breaks and sip water regularly.`)
      : act === 'work'
      ? `Luteal phase can bring more brain fog and lower verbal sharpness. Front-load cognitively demanding tasks early in the day and be kind to yourself if things feel slower than usual.`
      : (hot ? `Luteal phase — progesterone has raised your core temp and it's warm. Your body is working harder than it looks; take proper breaks.`
             : `Luteal phase — progesterone has nudged your core temp up, so you'll warm up faster than usual. Take it steady.`),
    food: (act === 'outdoor_exercise' || act === 'indoor_exercise')
      ? `Magnesium (dark chocolate, almonds, leafy greens) supports muscle recovery and mood. Sweet potato or oats before training keeps energy even. Banana or avocado post-workout helps potassium.${hot ? ' Electrolytes or coconut water are a must in this heat.' : ''}`
      : `Magnesium from dark chocolate, almonds and leafy greens helps with mood and muscle recovery. Complex carbs like sweet potato and oats steady energy and reduce cravings.${hot ? ' Coconut water or electrolytes help with extra sweating.' : ''}`,
  };

  // Days 22–28: Late luteal / PMS
  return {
    color: '#ef4444', bg: '#fef2f2',
    note: act === 'outdoor_exercise'
      ? (hot ? `Late luteal is your most heat-sensitive phase and it's hot — seriously consider moving this session indoors or to very early morning. If you go ahead, keep it short and stop at the first sign of dizziness.`
             : `PMS week — fatigue and heat sensitivity are at their peak. Keep the session significantly shorter than usual, expect more tiredness and prioritise cool-down over pace.`)
      : act === 'indoor_exercise'
      ? `PMS week — progesterone and fatigue are highest right now. Lower the intensity today, focus on how you feel rather than hitting targets, and give yourself extra recovery time.`
      : act === 'outdoor_leisure'
      ? (hot ? `Late luteal and it's hot — the toughest combination for heat sensitivity. Find shade early, limit direct sun and drink significantly more than you think you need.`
             : `PMS week — heat hits hardest now. Take it slow, drink plenty and don't push yourself to stay out longer than feels good.`)
      : act === 'work'
      ? `Late luteal often brings heightened emotional sensitivity and difficulty concentrating. Protect your schedule where you can — avoid high-stakes decisions if possible, take real breaks and be patient with yourself.`
      : (hot ? `Late luteal is your most heat-sensitive time and conditions are tough — keep outdoor exposure short, find shade and drink far more than usual.`
             : `PMS week — your body feels heat the most right now. Go easy, stay hydrated and avoid the hottest part of the day.`),
    food: (act === 'outdoor_exercise' || act === 'indoor_exercise')
      ? `Calcium (dairy, fortified oat milk) and magnesium (spinach, dark chocolate) ease PMS symptoms. Anti-inflammatory salmon or walnuts support recovery. Avoid salty snacks that worsen bloating. Chamomile tea can help with cramps.${hot ? ' Extra coconut water or electrolytes for the heat.' : ''}`
      : `Calcium (dairy or fortified oat milk) and magnesium (spinach, dark chocolate) ease PMS symptoms. Anti-inflammatory foods like salmon and walnuts, plus chamomile or raspberry leaf tea, make a real difference.${hot ? ' Coconut water helps with the extra heat sensitivity.' : ''}`,
  };
}

const UTCI_BANDS = [
  { max: 9,        color: '#0000B4', label: 'Extreme cold' },
  { max: 18,       color: '#4682FF', label: 'Cold stress' },
  { max: 26,       color: '#00C850', label: 'Comfortable' },
  { max: 32,       color: '#FFDC00', label: 'Moderate heat' },
  { max: 38,       color: '#FF6400', label: 'Strong heat' },
  { max: Infinity, color: '#C80000', label: 'Extreme heat' },
];

function utciColor(v: number | null) {
  if (v == null) return '#94a3b8';
  return (UTCI_BANDS.find(b => v < b.max) ?? UTCI_BANDS.at(-1)!).color;
}
function utciLabel(v: number | null) {
  if (v == null) return 'No data';
  return (UTCI_BANDS.find(b => v < b.max) ?? UTCI_BANDS.at(-1)!).label;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

export default function EventsScreen() {
  const { user_id } = useAuth();
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newHour, setNewHour] = useState('09:00');
  const [newLocation, setNewLocation] = useState('');
  const [newLocationZip, setNewLocationZip] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [lastPeriodStart, setLastPeriodStart] = useState<Date | null>(null);
  const [isWoman, setIsWoman] = useState(false);

  const fmtDDMMYY = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
  };

  const formatDateInput = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
    return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
  };

  const formatTimeInput = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0,2)}:${digits.slice(2)}`;
  };

  const openAdd = () => {
    setNewTitle('');
    setNewDate(fmtDDMMYY(selectedDate));
    setNewHour('09:00');
    setNewLocation('');
    setNewLocationZip('');
    setShowAdd(true);
  };

  const lookupZip = async (address: string) => {
    if (address.trim().length < 3) return;
    setGeocoding(true);
    try {
      const res = await fetch(`${API_BASE}/api/geocode?address=${encodeURIComponent(address)}`);
      const d = await res.json();
      if (d.lat != null) {
        if (d.display_name) {
          const parts = d.display_name.split(',').map((p: string) => p.trim());
          const short = parts.slice(0, 3).join(', ');
          setNewLocation(short);
        }
        const rev = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${d.lat}&lon=${d.lng}&format=json`, {
          headers: { 'User-Agent': 'ClimateApp/1.0' },
        });
        const rd = await rev.json();
        const zip = rd.address?.postcode ?? '';
        setNewLocationZip(zip);
      }
    } catch {} finally { setGeocoding(false); }
  };

  const saveEvent = async () => {
    if (!newTitle.trim()) { Alert.alert('Title required'); return; }
    if (!newLocation.trim()) { Alert.alert('Location required'); return; }
    const digits = newDate.replace(/\D/g, '');
    if (digits.length !== 6) { Alert.alert('Invalid date', 'Use DD/MM/YY'); return; }
    const dd = digits.slice(0,2), mm = digits.slice(2,4), yy = digits.slice(4,6);
    const iso = `20${yy}-${mm}-${dd}T${newHour || '09:00'}:00`;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), time: iso, location: newLocation.trim() || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowAdd(false);
      load();
      if (newLocation.trim()) {
        setEnriching(true);
        setTimeout(() => { load(); setEnriching(false); }, 60000);
      }
    } catch (e: any) {
      Alert.alert('Error', `Could not save event: ${e?.message ?? 'unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/events${user_id ? `?user_id=${user_id}` : ''}`);
      const data = await res.json();
      if (Array.isArray(data)) setEvents(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [user_id]);

  const deleteEvent = async (idx: number, title: string) => {
    Alert.alert('Delete event', `Remove "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API_BASE}/api/events/${idx}`, { method: 'DELETE' });
            setExpanded(null);
            load();
          } catch {
            Alert.alert('Error', 'Could not delete event.');
          }
        },
      },
    ]);
  };

  useEffect(() => {
    load();
    fetch(`${API_BASE}/api/health-profile`)
      .then(r => r.json())
      .then(data => {
        const g = data?.gender?.toLowerCase() ?? '';
        setIsWoman(g === 'female' || g === 'woman');
      })
      .catch(() => {});
    // Use period START for cycle phase calculations
    fetch(`${API_BASE}/api/health/logs`)
      .then(r => r.json())
      .then(logs => {
        const starts: string[] = (logs.period || [])
          .filter((e: any) => e.event === 'start')
          .map((e: any) => e.date)
          .sort()
          .reverse();
        if (starts.length) setLastPeriodStart(new Date(starts[0]));
      })
      .catch(() => {});
  }, []);

  // Build calendar grid
  const firstDay = startOfMonth(calYear, calMonth).getDay();
  const totalDays = daysInMonth(calYear, calMonth);
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventDays = new Set<number>();
  const eventColorByDay: Record<number, string> = {};
  events.forEach(ev => {
    if (!ev.time) return;
    const d = new Date(ev.time);
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
      eventDays.add(d.getDate());
      eventColorByDay[d.getDate()] = utciColor(ev.climate?.thermal_comfort_utci_c?.mean ?? null);
    }
  });

  const dayEvents = events.filter(ev => {
    if (!ev.time) return false;
    try { return isSameDay(new Date(ev.time), selectedDate); } catch { return false; }
  });

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  if (loading) return (
    <SafeAreaView style={s.center}>
      <ActivityIndicator size="large" color="#0ea5e9" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        stickyHeaderIndices={[0]}
      >
        {/* Calendar header */}
        <View style={s.calendarCard}>
          <View style={s.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
              <Text style={s.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={s.monthTitle}>
              {MONTH_NAMES[calMonth]} {calYear}
            </Text>
            <View style={s.monthNavRight}>
              <TouchableOpacity onPress={nextMonth} style={s.navBtn}>
                <Text style={s.navArrow}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openAdd} style={s.addBtn}>
                <Text style={s.addBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.dayLabels}>
            {DAY_LABELS.map(d => (
              <Text key={d} style={s.dayLabel}>{d}</Text>
            ))}
          </View>

          <View style={s.grid}>
            {cells.map((day, idx) => {
              if (!day) return <View key={`e-${idx}`} style={s.cell} />;
              const date = new Date(calYear, calMonth, day);
              const isToday = isSameDay(date, today);
              const isSelected = isSameDay(date, selectedDate);
              const hasEvent = eventDays.has(day);
              const dotColor = eventColorByDay[day] ?? '#0ea5e9';
              return (
                <TouchableOpacity
                  key={`d-${day}`}
                  style={s.cell}
                  onPress={() => setSelectedDate(date)}
                >
                  <View style={[
                    s.dayCircle,
                    isSelected && s.dayCircleSelected,
                    isToday && !isSelected && s.dayCircleToday,
                  ]}>
                    <Text style={[
                      s.dayNum,
                      isSelected && s.dayNumSelected,
                      isToday && !isSelected && s.dayNumToday,
                    ]}>
                      {day}
                    </Text>
                  </View>
                  {hasEvent && (
                    <View style={[s.dot, { backgroundColor: isSelected ? '#fff' : dotColor }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={s.dayHeading}>
          {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>

        {enriching && (
          <View style={s.enrichBanner}>
            <ActivityIndicator size="small" color="#FBBF24" style={{ marginRight: 8 }} />
            <Text style={s.enrichText}>Fetching climate data for your new event — pull to refresh when ready.</Text>
          </View>
        )}

        {dayEvents.length === 0 ? (
          <View style={s.noEvents}>
            <Text style={s.noEventsText}>No events</Text>
          </View>
        ) : (
          <View style={s.eventList}>
            {dayEvents.map((ev, i) => {
              const utci = ev.climate?.thermal_comfort_utci_c?.mean ?? null;
              const color = utciColor(utci);
              const time = ev.time ? new Date(ev.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
              const isOpen = expanded === i;
              return (
                <TouchableOpacity
                  key={i}
                  style={s.eventRow}
                  onPress={() => setExpanded(isOpen ? null : i)}
                  activeOpacity={0.7}
                >
                  <Text style={s.eventTime}>{time}</Text>
                  <View style={[s.eventBar, { borderLeftColor: color }]}>
                    <View style={s.eventBarTop}>
                      <Text style={s.eventTitle}>{ev.title}</Text>
                      {utci != null && (
                        <View style={[s.badge, { backgroundColor: color }]}>
                          <Text style={s.badgeText}>{utci.toFixed(1)}°</Text>
                        </View>
                      )}
                    </View>
                    {ev.location && (
                      <Text style={s.eventLocation} numberOfLines={1}>{ev.location.split(',').slice(0, 2).join(',')}</Text>
                    )}
                    {utci != null && (
                      <Text style={[s.utciLabel, { color }]}>{utciLabel(utci)}</Text>
                    )}
                    {isOpen && (
                      <View style={s.suggestions}>
                        {ev.climate?.solar_radiation_wm2?.mean != null && (
                          <Text style={s.metric}>Solar {ev.climate.solar_radiation_wm2.mean} W/m²  ·  Wind {ev.climate.wind_speed_ms?.mean} m/s</Text>
                        )}
                        {ev.weather?.precipitation_mm != null && (
                          <Text style={s.metric}>Rain {ev.weather.precipitation_mm} mm  ·  {ev.weather.relative_humidity_pct}% humidity</Text>
                        )}
                        {ev.suggestions?.clothing && (
                          <>
                            <Text style={s.sugLabel}>CLOTHING</Text>
                            <Text style={s.sugText}>{ev.suggestions.clothing}</Text>
                          </>
                        )}
                        {ev.suggestions?.wellness && (
                          <>
                            <Text style={s.sugLabel}>WELLNESS</Text>
                            <Text style={s.sugText}>{ev.suggestions.wellness}</Text>
                          </>
                        )}
                        {isWoman && lastPeriodStart && ev.time && (() => {
                          const pn = getCyclePhaseNote(new Date(ev.time), lastPeriodStart, utci, ev);
                          return (
                            <>
                              <Text style={s.sugLabel}>CYCLE & THERMAL</Text>
                              <View style={[s.cycleNote, { backgroundColor: pn.bg, borderColor: pn.color }]}>
                                <Text style={[s.cycleNoteText, { color: pn.color }]}>{pn.note}</Text>
                              </View>
                              <Text style={s.sugLabel}>NUTRITION</Text>
                              <Text style={s.cycleFood}>{pn.food}</Text>
                            </>
                          );
                        })()}
                        <TouchableOpacity
                          style={s.deleteBtn}
                          onPress={() => deleteEvent(events.indexOf(ev), ev.title)}
                        >
                          <Text style={s.deleteBtnText}>Delete event</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Text style={s.sheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={s.sheetTitle}>New Event</Text>
              <TouchableOpacity onPress={saveEvent} disabled={saving}>
                <Text style={[s.sheetDone, saving && { opacity: 0.4 }]}>Add</Text>
              </TouchableOpacity>
            </View>

            <View style={s.formGroup}>
              <Text style={s.formLabel}>TITLE</Text>
              <TextInput
                style={s.formInput}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Event title"
                placeholderTextColor="#c7c7cc"
                autoFocus
              />
            </View>

            <View style={s.formRow}>
              <View style={[s.formGroup, { flex: 1 }]}>
                <Text style={s.formLabel}>DATE (DD/MM/YY)</Text>
                <TextInput
                  style={s.formInput}
                  value={newDate}
                  onChangeText={v => setNewDate(formatDateInput(v))}
                  placeholder="e.g. 02/06/25"
                  placeholderTextColor="#c7c7cc"
                  keyboardType="numeric"
                  maxLength={8}
                />
              </View>
              <View style={[s.formGroup, { flex: 1 }]}>
                <Text style={s.formLabel}>TIME</Text>
                <TextInput
                  style={s.formInput}
                  value={newHour}
                  onChangeText={v => setNewHour(formatTimeInput(v))}
                  placeholder="09:00"
                  placeholderTextColor="#c7c7cc"
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
            </View>

            <View style={s.formGroup}>
              <Text style={s.formLabel}>LOCATION</Text>
              <TextInput
                style={s.formInput}
                value={newLocation}
                onChangeText={v => { setNewLocation(v); setNewLocationZip(''); }}
                onBlur={() => lookupZip(newLocation)}
                placeholder="e.g. Barceloneta Beach, Barcelona"
                placeholderTextColor="#c7c7cc"
              />
              {(geocoding || newLocationZip) && (
                <Text style={s.zipHint}>
                  {geocoding ? 'Looking up postcode…' : `Postcode: ${newLocationZip}`}
                </Text>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFBEB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFBEB' },

  calendarCard: { backgroundColor: '#fff', paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e8' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  monthTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 22, color: '#0ea5e9', fontWeight: '400' },

  dayLabels: { flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 4 },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#9ca3af', letterSpacing: 0.2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 4 },
  cell: { width: '14.28%', alignItems: 'center', paddingVertical: 2 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  dayCircleSelected: { backgroundColor: '#0ea5e9' },
  dayCircleToday: { backgroundColor: 'transparent' },
  dayNum: { fontSize: 15, color: '#111827', fontWeight: '400' },
  dayNumSelected: { color: '#fff', fontWeight: '600' },
  dayNumToday: { color: '#0ea5e9', fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 1 },

  dayHeading: { fontSize: 15, fontWeight: '600', color: '#374151', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },

  noEvents: { alignItems: 'center', paddingVertical: 48 },
  noEventsText: { color: '#9ca3af', fontSize: 15 },

  eventList: { paddingHorizontal: 16, gap: 10 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  eventTime: { width: 44, fontSize: 12, color: '#9ca3af', paddingTop: 14, textAlign: 'right' },
  eventBar: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    borderLeftWidth: 4, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  eventBarTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 },
  eventTitle: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 },
  eventLocation: { fontSize: 12, color: '#9ca3af', marginBottom: 2 },
  utciLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  suggestions: { marginTop: 10, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e8e8e8', paddingTop: 10 },
  metric: { fontSize: 12, color: '#6b7280' },
  sugLabel: { fontSize: 10, fontWeight: '700', color: '#8B5CF6', letterSpacing: 0.8, marginTop: 4 },
  sugText: { fontSize: 12, color: '#374151', lineHeight: 18 },
  cycleNote: { borderRadius: 8, borderWidth: 1.5, padding: 8, marginTop: 2 },
  cycleNoteText: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  cycleFood: { fontSize: 12, color: '#374151', lineHeight: 18 },
  enrichBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FBBF24' },
  enrichText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  deleteBtn: { marginTop: 12, paddingVertical: 10, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff' },
  deleteBtnText: { fontSize: 13, fontWeight: '600', color: '#ef4444' },

  monthNavRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F97316', justifyContent: 'center', alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '400' },

  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#f5f5f5', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 40 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0', backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  sheetCancel: { fontSize: 17, color: '#0ea5e9' },
  sheetDone: { fontSize: 17, color: '#0ea5e9', fontWeight: '600' },

  formRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 24 },
  formGroup: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', marginHorizontal: 16, marginTop: 16 },
  formLabel: { fontSize: 11, fontWeight: '600', color: '#9ca3af', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  formInput: { fontSize: 16, color: '#111827', paddingHorizontal: 16, paddingBottom: 14 },
  zipHint: { fontSize: 12, color: '#9ca3af', paddingHorizontal: 16, paddingBottom: 10 },
});
