import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import * as Linking from 'expo-linking';

import { AuthProvider, useAuth } from './lib/AuthContext';
import { theme } from './lib/theme';

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
  const { auth } = useAuth();
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
