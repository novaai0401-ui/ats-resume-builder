import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getApiBase, setApiBase } from '../lib/api';
import { theme } from '../lib/theme';

export default function SettingsScreen() {
  const [base, setBase] = useState(getApiBase());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save() {
    setSaving(true);
    setApiBase(base.trim());
    setTimeout(() => {
      setSaving(false);
      setSavedAt(Date.now());
    }, 250);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.card}>
          <Text style={styles.title}>API endpoint</Text>
          <Text style={styles.subtitle}>
            Override the backend URL. Useful for switching between local dev and staging.
            Default is set at build time via EXPO_PUBLIC_API_BASE.
          </Text>
          <TextInput
            style={styles.input}
            value={base}
            onChangeText={setBase}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TouchableOpacity style={styles.btnPrimary} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Save</Text>}
          </TouchableOpacity>
          {savedAt ? <Text style={styles.savedText}>Saved. Restart any in-flight requests to pick up.</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Account sharing</Text>
          <Text style={styles.subtitle}>
            Your Pocket Resume account is the same one you use on the web at the configured web URL.
            Sign in here, sign in there — same data, same JWT.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontSize: 16, fontWeight: '700', color: theme.colors.primary, marginBottom: 6 },
  subtitle: { fontSize: 13, color: theme.colors.muted, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: '#fafbfc', marginBottom: 12 },
  btnPrimary: { backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  savedText: { color: theme.colors.success, fontSize: 13, marginTop: 8, textAlign: 'center' },
});
