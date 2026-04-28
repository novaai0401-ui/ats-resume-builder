import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, getApiBase } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { theme } from '../lib/theme';
import type { AuthStackParamList } from '../App';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;
type Provider = { id: string; name: string; configured: boolean; url?: string };

export default function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]);

  useEffect(() => {
    api.getSocialProviders()
      .then((d) => setProviders((d.providers || []).filter((p) => p.configured)))
      .catch(() => {});
  }, []);

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function openProvider(p: Provider) {
    const url = p.url || `${getApiBase()}/auth/social/${p.id}/start`;
    await WebBrowser.openAuthSessionAsync(url, 'pocketresume://callback');
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.brandTitle}>Pocket Resume</Text>
          <Text style={styles.brandSub}>ATS-optimized resumes in your pocket</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Sign In</Text>
          <Text style={styles.subtitle}>Use the same account as the web app.</Text>

          {providers.length > 0 && (
            <View style={{ marginBottom: 16, gap: 10 }}>
              {providers.map((p) => (
                <TouchableOpacity key={p.id} style={styles.providerBtn} onPress={() => openProvider(p)}>
                  <Text style={styles.providerBtnText}>Continue with {p.name}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or use email</Text>
                <View style={styles.dividerLine} />
              </View>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Sign In</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={styles.linkText}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New to Pocket Resume?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}> Create an account</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.colors.bg },
  brand: { alignItems: 'center', marginBottom: 24 },
  brandTitle: { fontSize: 28, fontWeight: '800', color: theme.colors.primary },
  brandSub: { fontSize: 14, color: theme.colors.muted, marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  title: { fontSize: 22, fontWeight: '700', color: theme.colors.primary, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, backgroundColor: '#fafbfc' },
  btnPrimary: { backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  providerBtn: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingVertical: 14, alignItems: 'center', backgroundColor: '#fafbfc' },
  providerBtnText: { color: theme.colors.primary, fontSize: 15, fontWeight: '500' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 4, gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#ddd' },
  dividerText: { color: '#888', fontSize: 13 },
  linkText: { color: theme.colors.primaryHover, fontSize: 14, textAlign: 'center', marginTop: 4 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  footerText: { color: theme.colors.muted, fontSize: 14 },
  footerLink: { color: theme.colors.primaryHover, fontSize: 14, fontWeight: '600' },
  errorText: { color: theme.colors.danger, fontSize: 13, textAlign: 'center', marginTop: 12, backgroundColor: '#fff0f0', padding: 10, borderRadius: 8 },
});
