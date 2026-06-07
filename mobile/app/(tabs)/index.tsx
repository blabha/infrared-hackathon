import { useState, useRef, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Callout, Overlay } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';

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

function fmtShort(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

const DAYS = ['All', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function UtciMarker({ utci }: { utci: number | null }) {
  const color = utciColor(utci);
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[markerStyles.circle, { borderColor: color, backgroundColor: color + '33' }]}>
        <Text style={[markerStyles.label, { color }]}>
          {utci != null ? `${Math.round(utci)}°` : '?'}
        </Text>
      </View>
      <View style={[markerStyles.pin, { borderTopColor: color }]} />
    </View>
  );
}

const markerStyles = StyleSheet.create({
  circle: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 2.5,
    justifyContent: 'center', alignItems: 'center',
  },
  label: { fontSize: 11, fontWeight: '800' },
  pin: {
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
});

const DEFAULT_REGION = { latitude: 41.3851, longitude: 2.1734, latitudeDelta: 0.12, longitudeDelta: 0.12 };

const MAP_STYLE = [
  // Land base — warm cream
  { elementType: 'geometry',              stylers: [{ color: '#FFF8F5' }] },
  // Text
  { elementType: 'labels.text.fill',      stylers: [{ color: '#6B7280' }] },
  { elementType: 'labels.text.stroke',    stylers: [{ color: '#FFFFFF' }] },
  // Water — sky blue
  { featureType: 'water', elementType: 'geometry',          stylers: [{ color: '#BAE6FD' }] },
  { featureType: 'water', elementType: 'labels.text.fill',  stylers: [{ color: '#0EA5E9' }] },
  // Roads — white with very light stroke
  { featureType: 'road',          elementType: 'geometry',        stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road',          elementType: 'geometry.stroke',  stylers: [{ color: '#E5E7EB' }] },
  // Highways — light orange tint to match palette
  { featureType: 'road.highway',  elementType: 'geometry',        stylers: [{ color: '#FED7AA' }] },
  { featureType: 'road.highway',  elementType: 'geometry.stroke',  stylers: [{ color: '#FDBA74' }] },
  // Parks — very light sage
  { featureType: 'poi.park', elementType: 'geometry',          stylers: [{ color: '#D1FAE5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill',  stylers: [{ color: '#9CA3AF' }] },
  // Hide noisy POI icons and transit
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi',          elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',      stylers: [{ visibility: 'off' }] },
  // Admin borders
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#E5E7EB' }] },
  // Buildings — barely there
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F3F4F6' }] },
  // Natural landscape — faint sky tint
  { featureType: 'landscape.natural',  elementType: 'geometry', stylers: [{ color: '#EFF8FF' }] },
];

type Coord = { latitude: number; longitude: number };
type EventItem = Record<string, any>;
type Selected = { ev: EventItem; idx: number };

export default function MapScreen() {
  const { user_id } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [coords, setCoords] = useState<Record<number, Coord>>({});
  const region = DEFAULT_REGION;
  const [selectedDay, setSelectedDay] = useState('All');
  const [selected, setSelected] = useState<Selected | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editTitle, setEditTitle] = useState('');
  const [editTime, setEditTime] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const mapRef = useRef<MapView>(null);

  const loadEvents = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/events${user_id ? `?user_id=${user_id}` : ''}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Events response is not an array');
      setEvents(data);
      const instant: Record<number, Coord> = {};
      data.forEach((ev: EventItem, i: number) => {
        if (ev.climate?.lat != null && ev.climate?.lon != null) {
          instant[i] = { latitude: ev.climate.lat, longitude: ev.climate.lon };
        }
      });
      setCoords(instant);
      geocodeFallback(data, instant);
    } catch (e) {
      console.error('loadEvents failed:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadEvents(true); }, []));
  useEffect(() => { loadEvents(); }, []);

  const geocodeFallback = async (evts: EventItem[], already: Record<number, Coord>) => {
    for (let i = 0; i < evts.length; i++) {
      if (already[i]) continue;
      const loc = evts[i].location;
      if (!loc) continue;
      try {
        const res = await fetch(`${API_BASE}/api/geocode?address=${encodeURIComponent(loc)}`);
        const d = await res.json();
        if (d.lat != null && d.lng != null) {
          setCoords(prev => ({ ...prev, [i]: { latitude: d.lat, longitude: d.lng } }));
        }
      } catch {}
      await new Promise(r => setTimeout(r, 1100));
    }
  };

  const isVisible = (ev: EventItem, i: number) => {
    if (!coords[i]) return false;
    if (selectedDay === 'All') return true;
    try {
      const day = new Date(ev.time).toLocaleDateString('en-US', { weekday: 'short' });
      return day === selectedDay;
    } catch { return false; }
  };

  const openEdit = (ev: EventItem, idx: number) => {
    setTimeout(() => {
      setEditTitle(ev.title ?? '');
      setEditTime(ev.time ?? '');
      setSelected({ ev, idx });
    }, 50);
  };

  const saveEdit = async () => {
    if (!selected) return;
    try {
      await fetch(`${API_BASE}/api/events/${selected.idx}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, time: editTime }),
      });
      setSelected(null);
      loadEvents();
    } catch {
      Alert.alert('Error', 'Could not update event.');
    }
  };

  const addEvent = async () => {
    if (!newTitle.trim() || !newTime.trim()) {
      Alert.alert('Missing fields', 'Title and time are required.');
      return;
    }
    try {
      await fetch(`${API_BASE}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), time: newTime.trim(), location: newLocation.trim() || undefined }),
      });
      setShowAdd(false);
      setNewTitle(''); setNewTime(''); setNewLocation('');
      loadEvents();
    } catch {
      Alert.alert('Error', 'Could not add event.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Climate Planner</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => loadEvents()}>
            <Text style={styles.refreshBtnText}>↺</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Day filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        {DAYS.map(d => (
          <TouchableOpacity
            key={d}
            style={[styles.pill, selectedDay === d && styles.pillActive]}
            onPress={() => setSelectedDay(d)}
          >
            <Text style={[styles.pillText, selectedDay === d && styles.pillTextActive]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Map */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.loadingText}>Loading events…</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <MapView ref={mapRef} style={styles.map} region={region} showsUserLocation customMapStyle={MAP_STYLE} showsTraffic={false} showsPointsOfInterest={false}>

            {/* UTCI heatmap overlay */}
            {events.map((ev, i) => {
              const ov = ev.climate?.utci_overlay;
              if (!ov?.png_url || !ov?.bounds) return null;
              const [[s, w], [n, e]] = ov.bounds;
              return (
                <Overlay
                  key={`o-${i}`}
                  image={{ uri: `${API_BASE}${ov.png_url}` }}
                  bounds={[[s, w], [n, e]]}
                  opacity={0.65}
                />
              );
            })}
            {events.map((ev, i) => {
              if (!isVisible(ev, i)) return null;
              const utci = ev.climate?.thermal_comfort_utci_c?.mean ?? null;
              const color = utciColor(utci);
              return (
                <Marker key={`m-${i}`} coordinate={coords[i]} tracksViewChanges={false}>
                  <UtciMarker utci={utci} />
                  <Callout onPress={() => openEdit(ev, i)}>
                    <View style={styles.callout}>
                      <Text style={styles.calloutTitle}>{ev.title}</Text>
                      <Text style={styles.calloutTime}>{fmtShort(ev.time)}</Text>
                      {utci != null && (
                        <Text style={[styles.calloutUtci, { color }]}>
                          UTCI {utci.toFixed(1)}
                        </Text>
                      )}
                      <Text style={styles.calloutEdit}>Tap to edit →</Text>
                    </View>
                  </Callout>
                </Marker>
              );
            })}
          </MapView>

          <View style={styles.legend}>
            <Text style={styles.legendTitle}>UTCI</Text>
            {UTCI_BANDS.map(b => (
              <View key={b.label} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: b.color }]} />
                <Text style={styles.legendLabel}>{b.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Edit modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Edit Event</Text>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Event title"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.fieldLabel}>Time (ISO)</Text>
            <TextInput
              style={styles.input}
              value={editTime}
              onChangeText={setEditTime}
              placeholder="2025-06-02T09:00:00"
              placeholderTextColor="#94a3b8"
            />
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => setSelected(null)}>
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveEdit}>
                <Text style={styles.btnPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add modal */}
      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>New Event</Text>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Morning run"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.fieldLabel}>Time (ISO)</Text>
            <TextInput
              style={styles.input}
              value={newTime}
              onChangeText={setNewTime}
              placeholder="2025-06-02T07:00:00"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.fieldLabel}>Location (optional)</Text>
            <TextInput
              style={styles.input}
              value={newLocation}
              onChangeText={setNewLocation}
              placeholder="Cubbon Park, Bengaluru"
              placeholderTextColor="#94a3b8"
            />
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => setShowAdd(false)}>
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={addEvent}>
                <Text style={styles.btnPrimaryText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EFF8FF' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refreshBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e8e8e8', justifyContent: 'center', alignItems: 'center' },
  refreshBtnText: { fontSize: 18, color: '#0ea5e9', lineHeight: 22 },
  addBtn: { backgroundColor: '#F97316', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  filterBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8', maxHeight: 50 },
  filterContent: { paddingHorizontal: 12, paddingVertical: 9, gap: 8, flexDirection: 'row' },
  pill: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16,
    backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e8e8e8',
  },
  pillActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  pillTextActive: { color: '#fff' },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#6b7280', fontSize: 14 },
  callout: { padding: 8, minWidth: 160, maxWidth: 220 },
  calloutTitle: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 3 },
  calloutTime: { fontSize: 11, color: '#6b7280', marginBottom: 3 },
  calloutUtci: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  calloutEdit: { fontSize: 11, color: '#0ea5e9' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 24, gap: 10,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#fafafa', borderRadius: 10, borderWidth: 1,
    borderColor: '#e8e8e8', padding: 12, fontSize: 14, color: '#111827',
  },
  row: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#0ea5e9' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnSecondary: { backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e8e8e8' },
  btnSecondaryText: { color: '#6b7280', fontWeight: '600', fontSize: 15 },
  legend: {
    position: 'absolute', bottom: 24, left: 12,
    backgroundColor: 'rgba(255,255,255,0.93)', borderRadius: 10,
    padding: 9, gap: 5,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  legendTitle: { fontSize: 9, fontWeight: '800', color: '#6b7280', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, color: '#111827', fontWeight: '500' },
});
