// EAS builds set EXPO_PUBLIC_API_BASE to the Railway URL.
// Local dev falls back to the LAN IP.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? 'http://10.193.23.26:8000';
