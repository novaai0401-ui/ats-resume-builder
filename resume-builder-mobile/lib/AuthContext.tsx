import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { api, AuthData, clearAuth, loadAuth, saveAuth } from './api';
import { theme } from './theme';

type AuthContextValue = {
  auth: AuthData | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { fullName: string; email: string; mobile: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  setAuth: (next: AuthData) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuthState] = useState<AuthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuth()
      .then(setAuthState)
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback(async (next: AuthData) => {
    await saveAuth(next);
    setAuthState(next);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await api.login(email, password);
    await persist(data);
  }, [persist]);

  const signUp = useCallback(async (input: { fullName: string; email: string; mobile: string; password: string }) => {
    const data = await api.register(input);
    await persist(data);
  }, [persist]);

  const signOut = useCallback(async () => {
    await api.logout();
    await clearAuth();
    setAuthState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ auth, loading, signIn, signUp, signOut, setAuth: persist }),
    [auth, loading, signIn, signUp, signOut, persist],
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
