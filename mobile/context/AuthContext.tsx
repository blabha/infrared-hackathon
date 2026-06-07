import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { API_BASE } from '../constants/api';

WebBrowser.maybeCompleteAuthSession();

// Web application OAuth client — code exchange is done server-side
const GOOGLE_CLIENT_ID = '100317843416-mn5tuvffq37g4ih2q37cvd8npfa3ff1o.apps.googleusercontent.com';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

// Expo auth proxy — already registered in Google Cloud Console for this client
const REDIRECT_URI = 'https://auth.expo.io/@bha03/climate-planner';

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

  const [, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scopes: SCOPES,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: false,
      extraParams: {
        prompt: 'select_account',
        access_type: 'offline',
      },
    },
    DISCOVERY,
  );

  // Restore persisted session on mount
  useEffect(() => {
    AsyncStorage.multiGet(['user_id', 'email', 'name'])
      .then(pairs => {
        const m = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? '']));
        if (m.user_id) {
          setUserId(m.user_id);
          setEmail(m.email || null);
          setName(m.name || null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Send auth code to backend — backend holds the client secret and does the exchange
  useEffect(() => {
    if (response?.type !== 'success') return;
    const { code } = response.params;
    if (!code) return;

    fetch(`${API_BASE}/api/auth/google/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
    })
      .then(r => r.json())
      .then(async data => {
        if (!data.user_id) return;
        setUserId(data.user_id);
        setEmail(data.email ?? null);
        setName(data.name ?? null);
        await AsyncStorage.multiSet([
          ['user_id', data.user_id],
          ['email', data.email ?? ''],
          ['name', data.name ?? ''],
        ]);
      })
      .catch(e => console.error('[auth] error:', e));
  }, [response]);

  const signIn = async () => {
    await promptAsync();
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
