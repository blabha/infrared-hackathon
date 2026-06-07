import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { signIn, loading } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Climate Planner</Text>
      <Text style={styles.sub}>
        Connect your Google Calendar to get personalised climate and wellness insights for every event.
      </Text>
      {loading ? (
        <ActivityIndicator color="#0ea5e9" size="large" />
      ) : (
        <TouchableOpacity style={styles.btn} onPress={signIn} activeOpacity={0.85}>
          <Text style={styles.btnText}>Sign in with Google</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#FFF7ED',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 12 },
  sub: {
    fontSize: 15, color: '#6b7280', textAlign: 'center',
    marginBottom: 44, lineHeight: 22,
  },
  btn: {
    backgroundColor: '#F97316', paddingHorizontal: 32, paddingVertical: 16,
    borderRadius: 14, width: '100%', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
