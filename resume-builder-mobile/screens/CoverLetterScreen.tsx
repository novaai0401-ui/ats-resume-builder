import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { api, type Resume } from '../lib/api';
import { theme } from '../lib/theme';

const TONES = ['Professional', 'Friendly', 'Concise', 'Enthusiastic'];

export default function CoverLetterScreen() {
  const route = useRoute();
  const params = (route.params as { resumeId?: string } | undefined) ?? {};
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<string | undefined>(params.resumeId);
  const [jdText, setJdText] = useState('');
  const [tone, setTone] = useState('Professional');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listResumes().then((list) => {
      setResumes(list);
      if (!resumeId && list.length) setResumeId(list[0].id);
    }).catch(() => {});
  }, [resumeId]);

  async function generate() {
    if (!resumeId || !jdText.trim()) {
      setError('Pick a resume and paste a job description.');
      return;
    }
    setLoading(true);
    setError('');
    setOutput('');
    try {
      const result = await api.coverLetter({ resumeId, jdText: jdText.trim(), tone });
      setOutput(result.content || '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  async function shareOutput() {
    if (!output) return;
    await Share.share({ message: output });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>AI Cover Letter</Text>
          <Text style={styles.subtitle}>Tailored to a job description, using your resume.</Text>

          <Text style={styles.label}>Resume</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {resumes.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.chip, resumeId === r.id && styles.chipActive]}
                onPress={() => setResumeId(r.id)}
              >
                <Text style={[styles.chipText, resumeId === r.id && styles.chipTextActive]} numberOfLines={1}>
                  {r.title || 'Untitled'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>Tone</Text>
          <View style={styles.toneRow}>
            {TONES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, tone === t && styles.chipActive]}
                onPress={() => setTone(t)}
              >
                <Text style={[styles.chipText, tone === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Job description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            placeholder="Paste the job posting here…"
            value={jdText}
            onChangeText={setJdText}
          />

          <TouchableOpacity style={styles.btnPrimary} onPress={generate} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Generate</Text>}
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {output ? (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.title}>Result</Text>
              <TouchableOpacity onPress={shareOutput} style={styles.shareBtn}>
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.output}>{output}</Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontSize: 18, fontWeight: '700', color: theme.colors.primary },
  subtitle: { fontSize: 13, color: theme.colors.muted, marginBottom: 12 },
  label: { fontSize: 13, color: theme.colors.muted, marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: '#fff' },
  textArea: { minHeight: 140, textAlignVertical: 'top', marginBottom: 12 },
  toneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { backgroundColor: '#eef3f8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 6 },
  chipActive: { backgroundColor: theme.colors.primary },
  chipText: { color: theme.colors.text, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  btnPrimary: { backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  errorText: { color: theme.colors.danger, fontSize: 13, backgroundColor: '#fff0f0', padding: 10, borderRadius: 8, marginTop: 10 },
  output: { fontSize: 14, lineHeight: 21, color: theme.colors.text },
  shareBtn: { backgroundColor: '#eef3f8', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  shareBtnText: { color: theme.colors.primary, fontWeight: '600' },
});
