import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../lib/AuthContext';
import { theme } from '../lib/theme';
import type { AppStackParamList } from '../App';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { auth, signOut } = useAuth();
  const email = auth?.user?.email ?? '';
  const fullName = auth?.user?.fullName ?? '';

  function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(fullName[0] || email[0] || '?').toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{fullName || 'User'}</Text>
          <Text style={styles.email}>{email}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Quick links</Text>
          <Row label="Cover Letter" onPress={() => navigation.navigate('CoverLetter')} />
          <Row label="Jobs Tracker" onPress={() => navigation.navigate('Tabs')} />
          <Row label="Settings" onPress={() => navigation.navigate('Settings')} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>App</Text>
            <Text style={styles.rowValue}>Pocket Resume</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValue}>1.0.0</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12, alignSelf: 'center' },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', color: theme.colors.primary, textAlign: 'center' },
  email: { fontSize: 14, color: theme.colors.muted, marginTop: 2, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.primary, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f3f6' },
  rowLabel: { fontSize: 14, color: theme.colors.text },
  rowValue: { fontSize: 16, color: theme.colors.muted, fontWeight: '500' },
  logoutBtn: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: '#f5a3a3' },
  logoutBtnText: { color: theme.colors.danger, fontSize: 16, fontWeight: '600' },
});
