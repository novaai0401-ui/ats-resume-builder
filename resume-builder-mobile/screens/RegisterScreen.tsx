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
import { useAuth } from '../lib/AuthContext';
import { theme } from '../lib/theme';
import type { AuthStackParamList } from '../App';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister() {
    if (!fullName.trim() || !email.trim() || !mobile.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    // Keep in sync with resume-builder-shared/src/auth.ts (server source of truth).
    if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(email.trim())) {
      setError('Enter a valid email address, e.g. you@example.com.');
      return;
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signUp({ fullName: fullName.trim(), email: email.trim(), mobile: mobile.trim(), password });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>One account works on mobile and the web app.</Text>

          <TextInput style={styles.input} placeholder="Full Name" value={fullName} onChangeText={setFullName} autoComplete="name" />
          <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="Mobile (+91XXXXXXXXXX)" keyboardType="phone-pad" autoComplete="tel" value={mobile} onChangeText={setMobile} />
          <TextInput style={styles.input} placeholder="Password (min 10 chars)" secureTextEntry value={password} onChangeText={setPassword} />

          <TouchableOpacity style={styles.btnPrimary} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Create Account</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.colors.bg },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  title: { fontSize: 22, fontWeight: '700', color: theme.colors.primary, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, backgroundColor: '#fafbfc' },
  btnPrimary: { backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkText: { color: theme.colors.primaryHover, fontSize: 14, textAlign: 'center', marginTop: 12 },
  errorText: { color: theme.colors.danger, fontSize: 13, textAlign: 'center', marginTop: 12, backgroundColor: '#fff0f0', padding: 10, borderRadius: 8 },
});
