import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import TemplateSelectionScreen from './screens/TemplateSelectionScreen';
import ResumeEditorScreen from './screens/ResumeEditorScreen';
import AtsScoreScreen from './screens/AtsScoreScreen';
import ProfileScreen from './screens/ProfileScreen';

type Route =
  | { screen: 'login' }
  | { screen: 'home'; tab: 'resumes' | 'templates' | 'profile' }
  | { screen: 'templateSelection'; templateId: string }
  | { screen: 'resumeEditor'; resumeId: string }
  | { screen: 'atsScore'; resumeId: string };

const AUTH_KEY = 'rb_auth';

export default function App() {
  const [route, setRoute] = useState<Route>({ screen: 'login' });
  const [selectedTemplateId, setSelectedTemplateId] = useState('classic');
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<'resumes' | 'templates' | 'profile'>('resumes');

  useEffect(() => {
    AsyncStorage.getItem(AUTH_KEY)
      .then((stored) => {
        if (stored) {
          try {
            const auth = JSON.parse(stored);
            if (auth?.accessToken) {
              setRoute({ screen: 'home', tab: 'resumes' });
            }
          } catch {}
        }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  const handleLogin = useCallback(async (auth: { accessToken: string; refreshToken: string; user: { id: string; email: string; fullName: string } }) => {
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    setRoute({ screen: 'home', tab: 'resumes' });
  }, []);

  const handleLogout = useCallback(async () => {
    await AsyncStorage.removeItem(AUTH_KEY);
    setRoute({ screen: 'login' });
  }, []);

  if (!authChecked) {
    return <SafeAreaView style={styles.root} />;
  }

  // ─── Login Screen ───
  if (route.screen === 'login') {
    return (
      <SafeAreaView style={styles.root}>
        <LoginScreen onLoginSuccess={handleLogin} />
      </SafeAreaView>
    );
  }

  // ─── Template Selection (full-screen) ───
  if (route.screen === 'templateSelection') {
    return (
      <SafeAreaView style={styles.root}>
        <TemplateSelectionScreen
          initialTemplateId={route.templateId}
          onGoBack={() => setRoute({ screen: 'home', tab: 'templates' })}
          onApplyTemplate={(id) => {
            setSelectedTemplateId(id);
            setRoute({ screen: 'home', tab: 'templates' });
          }}
        />
      </SafeAreaView>
    );
  }

  // ─── Resume Editor (full-screen) ───
  if (route.screen === 'resumeEditor') {
    return (
      <SafeAreaView style={styles.root}>
        <ResumeEditorScreen
          resumeId={route.resumeId}
          onGoBack={() => setRoute({ screen: 'home', tab: 'resumes' })}
          onViewAts={(id) => setRoute({ screen: 'atsScore', resumeId: id })}
        />
      </SafeAreaView>
    );
  }

  // ─── ATS Score (full-screen) ───
  if (route.screen === 'atsScore') {
    return (
      <SafeAreaView style={styles.root}>
        <AtsScoreScreen
          resumeId={route.resumeId}
          onGoBack={() => setRoute({ screen: 'resumeEditor', resumeId: route.resumeId })}
        />
      </SafeAreaView>
    );
  }

  // ─── Home with Bottom Tabs ───
  return (
    <SafeAreaView style={styles.root}>
      <View style={{ flex: 1 }}>
        {activeTab === 'resumes' && (
          <DashboardScreen
            selectedTemplateId={selectedTemplateId}
            onNavigateToTemplate={(id) => setRoute({ screen: 'templateSelection', templateId: id })}
            onLogout={handleLogout}
            onEditResume={(id) => setRoute({ screen: 'resumeEditor', resumeId: id })}
          />
        )}
        {activeTab === 'templates' && (
          <DashboardScreen
            selectedTemplateId={selectedTemplateId}
            onNavigateToTemplate={(id) => setRoute({ screen: 'templateSelection', templateId: id })}
            onLogout={handleLogout}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileScreen
            onLogout={handleLogout}
            onGoBack={() => setActiveTab('resumes')}
          />
        )}
      </View>

      {/* ─── Bottom Tab Bar ─── */}
      <View style={styles.tabBar}>
        <TabButton icon="📄" label="Resumes" active={activeTab === 'resumes'} onPress={() => setActiveTab('resumes')} />
        <TabButton icon="🎨" label="Templates" active={activeTab === 'templates'} onPress={() => setActiveTab('templates')} />
        <TabButton icon="👤" label="Profile" active={activeTab === 'profile'} onPress={() => setActiveTab('profile')} />
      </View>
    </SafeAreaView>
  );
}

function TabButton({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tabItem} onPress={onPress}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f5f8' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingBottom: 4,
    paddingTop: 6,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabLabel: { fontSize: 11, color: '#5a6778', marginTop: 2, fontWeight: '500' },
  tabLabelActive: { color: '#1a3a5c', fontWeight: '700' },
});
