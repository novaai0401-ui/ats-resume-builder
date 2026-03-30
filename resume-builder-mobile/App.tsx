import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DashboardScreen from './screens/DashboardScreen';
import TemplateSelectionScreen from './screens/TemplateSelectionScreen';
import LoginScreen from './screens/LoginScreen';

type Route =
  | { screen: 'login' }
  | { screen: 'dashboard' }
  | { screen: 'templateSelection'; templateId: string };

const AUTH_STORAGE_KEY = 'rb_auth';

export default function App() {
  const [route, setRoute] = useState<Route>({ screen: 'login' });
  const [selectedTemplateId, setSelectedTemplateId] = useState('classic');
  const [authChecked, setAuthChecked] = useState(false);

  // Check for existing auth on mount
  useEffect(() => {
    AsyncStorage.getItem(AUTH_STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          try {
            const auth = JSON.parse(stored);
            if (auth?.accessToken) {
              setRoute({ screen: 'dashboard' });
            }
          } catch {
            // Invalid stored auth — stay on login
          }
        }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  const handleLogin = useCallback(async (auth: { accessToken: string; refreshToken: string; user: { id: string; email: string; fullName: string } }) => {
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
    setRoute({ screen: 'dashboard' });
  }, []);

  const handleLogout = useCallback(async () => {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    setRoute({ screen: 'login' });
  }, []);

  if (!authChecked) {
    return <SafeAreaView style={styles.root} />;
  }

  if (route.screen === 'login') {
    return (
      <SafeAreaView style={styles.root}>
        <LoginScreen onLoginSuccess={handleLogin} />
      </SafeAreaView>
    );
  }

  if (route.screen === 'templateSelection') {
    return (
      <SafeAreaView style={styles.root}>
        <TemplateSelectionScreen
          initialTemplateId={route.templateId}
          onGoBack={() => setRoute({ screen: 'dashboard' })}
          onApplyTemplate={(id) => {
            setSelectedTemplateId(id);
            setRoute({ screen: 'dashboard' });
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <DashboardScreen
        selectedTemplateId={selectedTemplateId}
        onNavigateToTemplate={(id) =>
          setRoute({ screen: 'templateSelection', templateId: id })
        }
        onLogout={handleLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f2f5f8',
  },
});
