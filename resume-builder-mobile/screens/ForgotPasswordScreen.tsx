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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { theme } from '../lib/theme';
import type { AuthStackParamList } from '../App';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.forgotPassword(email.trim());
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            We&apos;ll email you a secure link to reset your password.
          </Text>

          {done ? (
            <View>
              <Text style={styles.successText}>
                If an account exists for {email}, a reset link has been sent.
              </Text>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => navigation.navigate('Login')}>
                <Text style={styles.btnPrimaryText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <TextInput
                style={styles.input}
                placeholder="Email"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              <TouchableOpacity style={styles.btnPrimary} onPress={handleSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Send Reset Link</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.linkText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.colors.bg },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: theme.colors.primary, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, backgroundColor: '#fafbfc' },
  btnPrimary: { backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkText: { color: theme.colors.primaryHover, fontSize: 14, textAlign: 'center', marginTop: 4 },
  successText: { color: theme.colors.success, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  errorText: { color: theme.colors.danger, fontSize: 13, textAlign: 'center', marginTop: 12, backgroundColor: '#fff0f0', padding: 10, borderRadius: 8 },
});
