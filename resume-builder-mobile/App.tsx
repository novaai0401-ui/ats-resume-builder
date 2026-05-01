import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Alert, Linking as RNLinking, Text, View } from 'react-native';
import * as Linking from 'expo-linking';

import { AuthProvider, useAuth } from './lib/AuthContext';
import { theme } from './lib/theme';
import { biometricGate, isBiometricEnabled, verifyAppSignature } from './lib/security';
import { checkForUpdate } from './lib/updateCheck';
import { getApiBase } from './lib/api';
import { migrateCloudToLocalIfNeeded } from './lib/storageMode';

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import DashboardScreen from './screens/DashboardScreen';
import TemplateSelectionScreen from './screens/TemplateSelectionScreen';
import ResumeEditorScreen from './screens/ResumeEditorScreen';
import AtsScoreScreen from './screens/AtsScoreScreen';
import ProfileScreen from './screens/ProfileScreen';
import JobTrackerScreen from './screens/JobTrackerScreen';
import CoverLetterScreen from './screens/CoverLetterScreen';
import SettingsScreen from './screens/SettingsScreen';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  TemplateSelection: { templateId: string };
  ResumeEditor: { resumeId: string };
  AtsScore: { resumeId: string };
  CoverLetter: { resumeId?: string } | undefined;
  Settings: undefined;
};

export type TabsParamList = {
  Resumes: undefined;
  Templates: undefined;
  Jobs: undefined;
  Profile: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<TabsParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.card,
    primary: theme.colors.primary,
    text: theme.colors.text,
    border: theme.colors.border,
  },
};

function tabIcon(label: string) {
  return () => <Text style={{ fontSize: 18 }}>{label}</Text>;
}

function HomeTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTitleStyle: { color: '#fff', fontWeight: '700' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
      }}
    >
      <Tabs.Screen name="Resumes" component={DashboardScreen} options={{ tabBarIcon: tabIcon('📄') }} />
      <Tabs.Screen name="Templates" component={TemplateSelectionScreen} options={{ tabBarIcon: tabIcon('🎨') }} />
      <Tabs.Screen name="Jobs" component={JobTrackerScreen} options={{ tabBarIcon: tabIcon('💼') }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: tabIcon('👤') }} />
    </Tabs.Navigator>
  );
}

function AuthFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

function AppFlow() {
  return (
    <AppStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTitleStyle: { color: '#fff', fontWeight: '700' },
        headerTintColor: '#fff',
      }}
    >
      <AppStack.Screen name="Tabs" component={HomeTabs} options={{ headerShown: false }} />
      <AppStack.Screen name="TemplateSelection" component={TemplateSelectionScreen} options={{ title: 'Pick a template' }} />
      <AppStack.Screen name="ResumeEditor" component={ResumeEditorScreen} options={{ title: 'Edit Resume' }} />
      <AppStack.Screen name="AtsScore" component={AtsScoreScreen} options={{ title: 'ATS Score' }} />
      <AppStack.Screen name="CoverLetter" component={CoverLetterScreen} options={{ title: 'Cover Letter' }} />
      <AppStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </AppStack.Navigator>
  );
}

function RootNavigator() {
  const { auth, signOut } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [tamperBlocked, setTamperBlocked] = useState<string | null>(null);

  // Run startup security checks once. Tamper check is fail-closed —
  // if the APK signing cert doesn't match, we refuse to render the app
  // and ask the user to download a fresh copy from the official site.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sig = await verifyAppSignature();
      if (cancelled) return;
      if (!sig.ok) {
        setTamperBlocked(sig.reason ?? 'App integrity check failed.');
        return;
      }
      const checkBio = await isBiometricEnabled();
      if (!checkBio) { setUnlocked(true); return; }
      const ok = await biometricGate('Unlock Pocket Resume to view your resumes');
      if (!ok) {
        await signOut();
        setUnlocked(true);
      } else {
        setUnlocked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [signOut]);

  // For accounts with existing cloud-stored resumes, pull them into the
  // device once on first authenticated launch so the user keeps every
  // resume they had — and from now on, all writes stay on-device.
  useEffect(() => {
    if (!auth) return;
    migrateCloudToLocalIfNeeded();
  }, [auth]);

  // Background update check; non-blocking. Force-upgrade hard-stops the
  // app for users running a build older than minSupported.
  useEffect(() => {
    if (!auth) return;
    checkForUpdate(getApiBase()).then((info) => {
      if (!info) return;
      if (info.isUnsupported && info.forceUpgrade) {
        Alert.alert(
          'Update required',
          `This version is no longer supported. Please install Pocket Resume ${info.latest}.`,
          [{ text: 'Get update', onPress: () => {
            const url = info.android?.url || info.ios?.testflightUrl || info.web?.url;
            if (url) RNLinking.openURL(url);
          }}],
          { cancelable: false },
        );
      } else if (info.isOutdated) {
        Alert.alert(
          'Update available',
          `Pocket Resume ${info.latest} is out.${info.notes ? `\n\n${info.notes}` : ''}`,
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Update', onPress: () => {
              const url = info.android?.url || info.ios?.testflightUrl || info.web?.url;
              if (url) RNLinking.openURL(url);
            }},
          ],
        );
      }
    });
  }, [auth]);

  if (tamperBlocked) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.danger, textAlign: 'center', marginBottom: 12 }}>
          App integrity check failed
        </Text>
        <Text style={{ fontSize: 14, color: theme.colors.muted, textAlign: 'center', lineHeight: 20 }}>
          {tamperBlocked}{'\n\n'}Please uninstall this build and reinstall from the official site:
        </Text>
        <Text
          style={{ fontSize: 15, color: theme.colors.primaryHover, marginTop: 8, fontWeight: '600' }}
          onPress={() => RNLinking.openURL('https://pocketresume.app/download')}
        >
          pocketresume.app/download
        </Text>
      </View>
    );
  }

  if (!unlocked) return null;
  return auth ? <AppFlow /> : <AuthFlow />;
}

const linking = {
  prefixes: [Linking.createURL('/'), 'pocketresume://', 'https://pocketresume.app'],
  config: {
    screens: {
      Login: 'login',
      Register: 'register',
      ForgotPassword: 'forgot-password',
      Tabs: {
        screens: {
          Resumes: 'resumes',
          Templates: 'templates',
          Jobs: 'jobs',
          Profile: 'profile',
        },
      },
      ResumeEditor: 'resume/:resumeId',
      AtsScore: 'resume/:resumeId/ats',
      CoverLetter: 'cover-letter',
      Settings: 'settings',
    },
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer theme={navTheme} linking={linking}>
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
