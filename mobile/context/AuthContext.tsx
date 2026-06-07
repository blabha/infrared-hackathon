import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { API_BASE } from '../constants/api';

WebBrowser.maybeCompleteAuthSession();

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
    await WebBrowser.openAuthSessionAsync(
      `${API_BASE}/api/auth/google/start`,
      'climateplanner://auth-callback',
    );
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
