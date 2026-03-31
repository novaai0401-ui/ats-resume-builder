import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Props = {
  onLogout: () => void;
  onGoBack: () => void;
};

export default function ProfileScreen({ onLogout, onGoBack }: Props) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('rb_auth').then((raw) => {
      if (!raw) return;
      try {
        const auth = JSON.parse(raw);
        setEmail(auth.user?.email || '');
        setFullName(auth.user?.fullName || '');
      } catch {}
    });
  }, []);

  function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: onLogout },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f2f5f8' }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onGoBack}><Text style={styles.backBtn}>Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(fullName[0] || email[0] || '?').toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{fullName || 'User'}</Text>
          <Text style={styles.email}>{email}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Plan</Text>
            <Text style={styles.rowValue}>Free</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue}>{email}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>App</Text>
            <Text style={styles.rowValue}>ATS Resume Builder</Text>
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

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { color: '#2f5f8f', fontSize: 15, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1a3a5c' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#1a3a5c', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', color: '#1a3a5c' },
  email: { fontSize: 14, color: '#5a6778', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a3a5c', marginBottom: 12, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f3f6' },
  rowLabel: { fontSize: 14, color: '#5a6778' },
  rowValue: { fontSize: 14, color: '#1a3a5c', fontWeight: '500' },
  logoutBtn: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: '#f5a3a3' },
  logoutBtnText: { color: '#c53030', fontSize: 16, fontWeight: '600' },
});
