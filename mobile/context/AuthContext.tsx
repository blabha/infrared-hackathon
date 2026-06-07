import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { API_BASE } from '../constants/api';

type AuthState = {
  user_id: string | null;
  email: string | null;
  name: string | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  loadSession: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user_id: null,
  email: null,
  name: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  loadSession: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user_id, setUserId] = useState<string | null>(null);
  const [email, setEmail]   = useState<string | null>(null);
  const [name, setName]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = async () => {
    const pairs = await AsyncStorage.multiGet(['user_id', 'email', 'name']);
    const m = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? '']));
    if (m.user_id) {
      setUserId(m.user_id);
      setEmail(m.email || null);
      setName(m.name  || null);
    }
  };

  useEffect(() => {
    loadSession().finally(() => setLoading(false));
  }, []);

  const signIn = async () => {
    const redirectUrl = Linking.createURL('auth-callback');
    const startUrl = `${API_BASE}/api/auth/google/start?app_redirect=${encodeURIComponent(redirectUrl)}`;
    await Linking.openURL(startUrl);
  };

  const signOut = async () => {
    setUserId(null);
    setEmail(null);
    setName(null);
    await AsyncStorage.multiRemove(['user_id', 'email', 'name']);
  };

  return (
    <AuthContext.Provider value={{ user_id, email, name, loading, signIn, signOut, loadSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
