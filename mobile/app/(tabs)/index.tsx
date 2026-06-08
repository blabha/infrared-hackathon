import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, Alert, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import WebView from 'react-native-webview';
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

function utciColor(v: number | null): string {
  if (v == null) return '#94a3b8';
  return (UTCI_BANDS.find(b => v < b.max) ?? UTCI_BANDS.at(-1)!).color;
}

function fmtShort(iso: string): string {
  try {
    const str = iso?.length === 10 ? iso + 'T00:00:00' : iso;
    return new Date(str).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

const DAYS = ['All', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Coord = { latitude: number; longitude: number };
type EventItem = Record<string, any>;
type Selected = { ev: EventItem; idx: number };

function buildLeafletHTML(
  events: EventItem[],
  coords: Record<number, Coord>,
  selectedDay: string,
  apiBase: string,
): string {
  const visible = events
    .map((ev, i) => ({ ev, i, coord: coords[i] }))
    .filter(({ ev, i, coord }) => {
      if (!coord) return false;
      if (selectedDay === 'All') return true;
      try {
        const t = ev.time?.length === 10 ? ev.time + 'T00:00:00' : ev.time;
        return new Date(t).toLocaleDateString('en-US', { weekday: 'short' }) === selectedDay;
      } catch { return false; }
    });

  const markersPayload = visible.map(({ ev, i, coord }) => ({
    idx: i,
    lat: coord.latitude,
    lng: coord.longitude,
    title: ev.title ?? 'Event',
    time: fmtShort(ev.time ?? ''),
    utci: ev.climate?.thermal_comfort_utci_c?.mean ?? null,
    color: utciColor(ev.climate?.thermal_comfort_utci_c?.mean ?? null),
  }));

  const overlaysPayload = events
    .map((ev) => {
      const ov = ev.climate?.utci_overlay;
      if (!ov?.png_url || !ov?.bounds) return null;
      const [[s, w], [n, e]] = ov.bounds;
      return { url: `${apiBase}${ov.png_url}`, bounds: [[s, w], [n, e]] };
    })
    .filter(Boolean);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%}
.leaflet-popup-content-wrapper{border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,.18)}
.leaflet-popup-content{margin:12px 14px}
.leaflet-popup-tip-container{display:none}
.edit-btn{background:#0ea5e9;color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer;width:100%;margin-top:8px}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map',{zoomControl:true}).setView([41.3851,2.1734],13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19,
  attribution:'&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
}).addTo(map);

var overlays=${JSON.stringify(overlaysPayload)};
overlays.forEach(function(o){if(o)L.imageOverlay(o.url,o.bounds,{opacity:0.65}).addTo(map);});

var markers=${JSON.stringify(markersPayload)};
var bounds=[];
markers.forEach(function(m){
  bounds.push([m.lat,m.lng]);
  var lbl=m.utci!=null?Math.round(m.utci)+'°':'?';
  var icon=L.divIcon({
    html:'<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">'
        +'<div style="width:44px;height:44px;border-radius:22px;border:2.5px solid '+m.color
        +';background:'+m.color+'22;display:flex;align-items:center;justify-content:center'
        +';font-size:11px;font-weight:800;color:'+m.color+'">'+lbl+'</div>'
        +'<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent'
        +';border-top:8px solid '+m.color+'"></div></div>',
    className:'',iconAnchor:[22,52],popupAnchor:[0,-56]
  });
  var utciRow=m.utci!=null
    ?'<div style="font-size:12px;font-weight:700;color:'+m.color+';margin-bottom:4px">UTCI '+m.utci.toFixed(1)+'</div>'
    :'';
  var popup='<div style="min-width:160px">'
    +'<div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:3px">'+m.title+'</div>'
    +'<div style="font-size:11px;color:#6b7280;margin-bottom:4px">'+m.time+'</div>'
    +utciRow
    +'<button class="edit-btn" onclick="window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:\'edit\',idx:'+m.idx+'}))">'
    +'Edit →</button></div>';
  L.marker([m.lat,m.lng],{icon:icon}).addTo(map).bindPopup(popup,{maxWidth:240});
});
if(bounds.length>1) map.fitBounds(bounds,{padding:[50,50]});
else if(bounds.length===1) map.setView(bounds[0],14);
</script>
</body>
</html>`;
}

export default function MapScreen() {
  const { user_id } = useAuth();
  const [events, setEvents]     = useState<EventItem[]>([]);
  const [coords, setCoords]     = useState<Record<number, Coord>>({});
  const [selectedDay, setSelectedDay] = useState('All');
  const [selected, setSelected] = useState<Selected | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [editTitle, setEditTitle]     = useState('');
  const [editTime, setEditTime]       = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editNotes, setEditNotes]     = useState('');
  const [editSaving, setEditSaving]   = useState(false);
  const [newTitle, setNewTitle]       = useState('');
  const [newTime, setNewTime]         = useState('');
  const [newLocation, setNewLocation] = useState('');
  const webRef = useRef<WebView>(null);

  const leafletHTML = useMemo(
    () => buildLeafletHTML(events, coords, selectedDay, API_BASE),
    [events, coords, selectedDay],
  );

  const loadEvents = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/events${user_id ? `?user_id=${user_id}` : ''}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('not array');
      setEvents(data);
      const instant: Record<number, Coord> = {};
      data.forEach((ev: EventItem, i: number) => {
        if (ev.climate?.lat != null && ev.climate?.lon != null)
          instant[i] = { latitude: ev.climate.lat, longitude: ev.climate.lon };
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
    const needsEnrich: number[] = [];
    for (let i = 0; i < evts.length; i++) {
      if (already[i]) continue;
      const loc = evts[i].location;
      if (!loc) continue;
      try {
        const res = await fetch(`${API_BASE}/api/geocode?address=${encodeURIComponent(loc)}`);
        const d   = await res.json();
        if (d.lat != null && d.lng != null) {
          setCoords(prev => ({ ...prev, [i]: { latitude: d.lat, longitude: d.lng } }));
          needsEnrich.push(i);
        }
      } catch {}
      await new Promise(r => setTimeout(r, 1100));
    }
    if (needsEnrich.length > 0) {
      fetch(`${API_BASE}/api/enrich${user_id ? `?user_id=${user_id}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indices: needsEnrich }),
      }).catch(() => {});
    }
  };

  const handleWebMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'edit' && events[msg.idx]) {
        const ev = events[msg.idx];
        setTimeout(() => {
          setEditTitle(ev.title ?? '');
          setEditTime(ev.time ?? '');
          setEditLocation(ev.location ?? '');
          setEditNotes(ev.notes ?? '');
          setSelected({ ev, idx: msg.idx });
        }, 50);
      }
    } catch {}
  };

  const openEdit = (ev: EventItem, idx: number) => {
    setTimeout(() => {
      setEditTitle(ev.title ?? '');
      setEditTime(ev.time ?? '');
      setEditLocation(ev.location ?? '');
      setEditNotes(ev.notes ?? '');
      setSelected({ ev, idx });
    }, 50);
  };

  const saveEdit = async () => {
    if (!selected) return;
    setEditSaving(true);
    try {
      await fetch(`${API_BASE}/api/events/${selected.idx}${user_id ? `?user_id=${user_id}` : ''}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:    editTitle,
          time:     editTime,
          location: editLocation || null,
          notes:    editNotes    || null,
        }),
      });
      setSelected(null);
      loadEvents();
    } catch {
      Alert.alert('Error', 'Could not update event.');
    } finally {
      setEditSaving(false);
    }
  };

  const addEvent = async () => {
    if (!newTitle.trim() || !newTime.trim()) {
      Alert.alert('Missing fields', 'Title and time are required.');
      return;
    }
    try {
      await fetch(`${API_BASE}/api/events${user_id ? `?user_id=${user_id}` : ''}`, {
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
          <WebView
            ref={webRef}
            source={{ html: leafletHTML }}
            style={styles.map}
            onMessage={handleWebMessage}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="always"
            allowFileAccess
          />

          {/* UTCI legend */}
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Edit Event</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.input}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Event title"
                placeholderTextColor="#94a3b8"
              />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Date & Time</Text>
              <TextInput
                style={styles.input}
                value={editTime}
                onChangeText={setEditTime}
                placeholder="2025-06-12T09:00:00"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Location</Text>
              <TextInput
                style={styles.input}
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder="Barceloneta Beach, Barcelona"
                placeholderTextColor="#94a3b8"
                autoCapitalize="words"
              />
              <Text style={styles.fieldHint}>Changing the address recalculates climate data</Text>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Notes</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Any extra notes about this event…"
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <View style={[styles.row, { marginTop: 16 }]}>
                <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => setSelected(null)}>
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={saveEdit} disabled={editSaving}>
                  {editSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.btnPrimaryText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Date & Time</Text>
            <TextInput
              style={styles.input}
              value={newTime}
              onChangeText={setNewTime}
              placeholder="2025-06-12T07:00:00"
              placeholderTextColor="#94a3b8"
            />
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Location (optional)</Text>
            <TextInput
              style={styles.input}
              value={newLocation}
              onChangeText={setNewLocation}
              placeholder="Barceloneta Beach, Barcelona"
              placeholderTextColor="#94a3b8"
            />
            <View style={[styles.row, { marginTop: 16 }]}>
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
  container:  { flex: 1, backgroundColor: '#EFF8FF' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8',
  },
  title:         { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refreshBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e8e8e8',
    justifyContent: 'center', alignItems: 'center',
  },
  refreshBtnText: { fontSize: 18, color: '#0ea5e9', lineHeight: 22 },
  addBtn:         { backgroundColor: '#F97316', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  addBtnText:     { color: '#fff', fontWeight: '700', fontSize: 13 },
  filterBar:    { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8e8e8', maxHeight: 50 },
  filterContent: { paddingHorizontal: 12, paddingVertical: 9, gap: 8, flexDirection: 'row' },
  pill:          { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e8e8e8' },
  pillActive:    { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  pillText:      { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  pillTextActive: { color: '#fff' },
  map:          { flex: 1 },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText:  { color: '#6b7280', fontSize: 14 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 24, gap: 10,
  },
  sheetTitle:   { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  fieldLabel:   { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldHint:    { fontSize: 11, color: '#94a3b8', marginTop: 4, marginBottom: 2 },
  input: {
    backgroundColor: '#fafafa', borderRadius: 10, borderWidth: 1,
    borderColor: '#e8e8e8', padding: 12, fontSize: 14, color: '#111827',
  },
  inputMultiline: { minHeight: 72, paddingTop: 12 },
  row:            { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn:            { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  btnPrimary:     { backgroundColor: '#0ea5e9' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnSecondary:   { backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e8e8e8' },
  btnSecondaryText: { color: '#6b7280', fontWeight: '600', fontSize: 15 },
  legend: {
    position: 'absolute', bottom: 24, left: 12,
    backgroundColor: 'rgba(255,255,255,0.93)', borderRadius: 10,
    padding: 9, gap: 5,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  legendTitle: { fontSize: 9, fontWeight: '800', color: '#6b7280', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  legendRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:   { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, color: '#111827', fontWeight: '500' },
});
