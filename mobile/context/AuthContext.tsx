import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API_BASE } from '../constants/api';

WebBrowser.maybeCompleteAuthSession();

type AuthState = {
  user_id: string | null;
  email: string | null;
  name: string | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user_id: null,
  email: null,
  name: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user_id, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const handleAuthUrl = async (url: string) => {
    if (!url.includes('climateplanner://auth')) return;
    const { queryParams } = Linking.parse(url);
    if (!queryParams) return;
    const uid   = queryParams.user_id as string | undefined;
    const em    = queryParams.email   as string | undefined;
    const nm    = queryParams.name    as string | undefined;
    const err   = queryParams.error   as string | undefined;
    if (err || !uid) {
      console.error('[auth] callback error:', err);
      return;
    }
    setUserId(uid);
    setEmail(em ?? null);
    setName(nm ?? null);
    await AsyncStorage.multiSet([
      ['user_id', uid],
      ['email',   em  ?? ''],
      ['name',    nm  ?? ''],
    ]);
  };

  // Restore persisted session on mount + listen for deep links
  useEffect(() => {
    AsyncStorage.multiGet(['user_id', 'email', 'name']).then(pairs => {
      const m = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? '']));
      if (m.user_id) {
        setUserId(m.user_id);
        setEmail(m.email || null);
        setName(m.name  || null);
      }
    }).finally(() => setLoading(false));

    // Cold-start: app was opened by the deep link
    Linking.getInitialURL().then(url => { if (url) handleAuthUrl(url); });

    // Foreground: app was already open when the deep link arrived
    const sub = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url));
    return () => sub.remove();
  }, []);

  const signIn = async () => {
    const result = await WebBrowser.openAuthSessionAsync(
      `${API_BASE}/api/auth/google/start`,
      'climateplanner://auth',
    );
    if (result.type === 'success' && result.url) {
      await handleAuthUrl(result.url);
    }
  };

  const signOut = async () => {
    setUserId(null);
    setEmail(null);
    setName(null);
    await AsyncStorage.multiRemove(['user_id', 'email', 'name']);
  };

  return (
    <AuthContext.Provider value={{ user_id, email, name, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
