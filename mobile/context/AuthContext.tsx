import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
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

  // Process an incoming deep-link URL and save session if it's an auth callback
  const applyAuthUrl = async (url: string) => {
    if (!url.includes('auth-callback')) return;
    const { queryParams } = Linking.parse(url);
    const uid = queryParams?.['user_id']       as string | undefined;
    const em  = queryParams?.['email']         as string | undefined;
    const nm  = queryParams?.['name']          as string | undefined;
    const at  = queryParams?.['access_token']  as string | undefined;
    const rt  = queryParams?.['refresh_token'] as string | undefined;
    if (!uid) return;
    const pairs: [string, string][] = [
      ['user_id', uid],
      ['email',   em ?? ''],
      ['name',    nm ?? ''],
    ];
    if (at) pairs.push(['access_token',  at]);
    if (rt) pairs.push(['refresh_token', rt]);
    await AsyncStorage.multiSet(pairs);
    setUserId(uid);
    setEmail(em || null);
    setName(nm || null);
  };

  useEffect(() => {
    loadSession().finally(() => setLoading(false));

    // Handle deep link when app was already running (backgrounded)
    const sub = Linking.addEventListener('url', ({ url }) => applyAuthUrl(url));

    // Handle deep link that cold-launched or resumed the app
    Linking.getInitialURL().then(url => { if (url) applyAuthUrl(url); });

    return () => sub.remove();
  }, []);

  const signIn = async () => {
    const redirectUrl = Linking.createURL('auth-callback');
    const startUrl = `${API_BASE}/api/auth/google/start?app_redirect=${encodeURIComponent(redirectUrl)}`;
    const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUrl);
    if (result.type === 'success') {
      await applyAuthUrl(result.url);
    }
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
