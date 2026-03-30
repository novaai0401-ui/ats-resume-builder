import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const API_BASE = 'http://10.0.2.2:3001'; // Android emulator → localhost

type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string };
};

type SocialProvider = { id: string; name: string; url: string };

type Props = {
  onLoginSuccess: (auth: AuthResult) => void;
  apiBase?: string;
};

export default function LoginScreen({ onLoginSuccess, apiBase = API_BASE }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [providers, setProviders] = useState<SocialProvider[]>([]);

  useEffect(() => {
    fetch(`${apiBase}/auth/social/providers`)
      .then((res) => res.json())
      .then((data) => setProviders(data.providers || []))
      .catch(() => {});
  }, [apiBase]);

  async function handlePasswordLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');
      onLoginSuccess(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!fullName.trim() || !email.trim() || !mobile.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          mobile: mobile.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed');
      onLoginSuccess(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  function openProvider(url: string) {
    Linking.openURL(url).catch(() => setError('Could not open browser for sign-in.'));
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </Text>
          <Text style={styles.subtitle}>
            {mode === 'login' ? 'Choose your preferred sign-in method.' : 'Get started with your free account.'}
          </Text>

          {/* Social Providers */}
          {providers.length > 0 && (
            <View style={{ marginBottom: 16, gap: 10 }}>
              {providers.map((p) => (
                <TouchableOpacity key={p.id} style={styles.providerBtn} onPress={() => openProvider(p.url)}>
                  <Text style={styles.providerBtnText}>Continue with {p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {providers.length > 0 && (
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or use email</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

          {mode === 'login' ? (
            <>
              <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
              <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
              <TouchableOpacity style={styles.btnPrimary} onPress={handlePasswordLogin} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Sign In</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput style={styles.input} placeholder="Full Name" value={fullName} onChangeText={setFullName} />
              <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
              <TextInput style={styles.input} placeholder="Mobile (+91XXXXXXXXXX)" keyboardType="phone-pad" value={mobile} onChangeText={setMobile} />
              <TextInput style={styles.input} placeholder="Password (min 8 chars)" secureTextEntry value={password} onChangeText={setPassword} />
              <TouchableOpacity style={styles.btnPrimary} onPress={handleRegister} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Create Account</Text>}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            <Text style={styles.linkText}>
              {mode === 'login' ? 'New here? Create account' : 'Already have an account? Sign in'}
            </Text>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a3a5c', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#d0dbe7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, backgroundColor: '#fafbfc' },
  btnPrimary: { backgroundColor: '#1a3a5c', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  providerBtn: { borderWidth: 1, borderColor: '#d0dbe7', borderRadius: 10, paddingVertical: 14, alignItems: 'center', backgroundColor: '#fafbfc' },
  providerBtnText: { color: '#1a3a5c', fontSize: 15, fontWeight: '500' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#ddd' },
  dividerText: { color: '#888', fontSize: 13 },
  linkText: { color: '#2a5a8a', fontSize: 14, textAlign: 'center', marginTop: 12 },
  errorText: { color: '#c53030', fontSize: 13, textAlign: 'center', marginTop: 12, backgroundColor: '#fff0f0', padding: 10, borderRadius: 8 },
});
