import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { signIn, loading } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🌡</Text>
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
    flex: 1, backgroundColor: '#f0f6fb',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  logo: { fontSize: 72, marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#0f2535', marginBottom: 10 },
  sub: {
    fontSize: 15, color: '#6b90a8', textAlign: 'center',
    marginBottom: 44, lineHeight: 22,
  },
  btn: {
    backgroundColor: '#0ea5e9', paddingHorizontal: 32, paddingVertical: 16,
    borderRadius: 16, width: '100%', alignItems: 'center',
    shadowColor: '#0ea5e9', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
