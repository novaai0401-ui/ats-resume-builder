import React, { useState } from 'react';
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { theme } from '../lib/theme';
import type { AuthStackParamList } from '../App';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

// We default to passwordless OTP because we no longer pay for Google /
// LinkedIn / Yahoo / GitHub OAuth integrations. Existing users with
// passwords keep working — they tap "Use password instead." Both flows
// hit the same backend tokens issuer, so the rest of the app doesn't
// know or care which one ran.
type LoginMethod = 'otp' | 'password';
type OtpStage = 'email' | 'code';

export default function LoginScreen({ navigation }: Props) {
  const { signIn, setAuth } = useAuth();
  const [method, setMethod] = useState<LoginMethod>('otp');
  const [otpStage, setOtpStage] = useState<OtpStage>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  function startCooldown() {
    setResendCooldown(60);
    const tick = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) { clearInterval(tick); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function handlePasswordLogin() {
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

  async function handleRequestOtp() {
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setLoading(true);
    setError('');
    setStatus('');
    try {
      await api.requestOtp(email.trim());
      setOtpStage('code');
      setStatus('We just emailed you a 6-digit code. It expires in 10 minutes.');
      startCooldown();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const auth = await api.verifyOtp(email.trim(), otp.trim());
      // verifyOtp returns the same { accessToken, refreshToken, user }
      // shape as a password login, so we drop it straight into the
      // AuthContext just like signIn() would.
      await setAuth(auth);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.subtitle}>
            {method === 'otp'
              ? 'Enter your email — we’ll send you a one-time code.'
              : 'Use the same account as the web app.'}
          </Text>

          {method === 'otp' ? (
            otpStage === 'email' ? (
              <View>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                />
                <TouchableOpacity style={styles.btnPrimary} onPress={handleRequestOtp} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Send code</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setMethod('password'); setError(''); setStatus(''); }}>
                  <Text style={styles.linkText}>Use password instead</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.label}>6-digit code sent to {email}</Text>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  placeholder="000000"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  value={otp}
                  onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                />
                <TouchableOpacity
                  style={[styles.btnPrimary, otp.length !== 6 && { opacity: 0.5 }]}
                  onPress={handleVerifyOtp}
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Verify & sign in</Text>}
                </TouchableOpacity>
                <View style={styles.otpFooter}>
                  <TouchableOpacity onPress={() => { setOtpStage('email'); setOtp(''); setError(''); setStatus(''); }}>
                    <Text style={styles.linkText}>Change email</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={resendCooldown > 0 || loading}
                    onPress={handleRequestOtp}
                  >
                    <Text style={[styles.linkText, resendCooldown > 0 && { opacity: 0.4 }]}>
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          ) : (
            <View>
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
              <TouchableOpacity style={styles.btnPrimary} onPress={handlePasswordLogin} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Sign In</Text>}
              </TouchableOpacity>
              <View style={styles.otpFooter}>
                <TouchableOpacity onPress={() => { setMethod('otp'); setError(''); setStatus(''); }}>
                  <Text style={styles.linkText}>Email me a code instead</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                  <Text style={styles.linkText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>New to Pocket Resume?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}> Create an account</Text>
            </TouchableOpacity>
          </View>

          {status ? <Text style={styles.statusText}>{status}</Text> : null}
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
  label: { fontSize: 13, color: theme.colors.muted, marginBottom: 8, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, backgroundColor: '#fafbfc' },
  otpInput: { letterSpacing: 6, fontSize: 22, textAlign: 'center', fontWeight: '600' },
  btnPrimary: { backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkText: { color: theme.colors.primaryHover, fontSize: 14, textAlign: 'center', marginVertical: 4 },
  otpFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  footerText: { color: theme.colors.muted, fontSize: 14 },
  footerLink: { color: theme.colors.primaryHover, fontSize: 14, fontWeight: '600' },
  statusText: { color: theme.colors.success, fontSize: 13, textAlign: 'center', marginTop: 12, backgroundColor: '#e8f5ec', padding: 10, borderRadius: 8 },
  errorText: { color: theme.colors.danger, fontSize: 13, textAlign: 'center', marginTop: 12, backgroundColor: '#fff0f0', padding: 10, borderRadius: 8 },
});
