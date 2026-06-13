import React, { useState } from 'react';
import {
  ScrollView, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api, type RecruiterSimResult, type Resume } from '../lib/api';
import { resumeStore } from '../lib/storageMode';
import { presentVerdict } from '../lib/outcomePresentation';

function buildResumeText(resume: Resume): string {
  const parts: string[] = [];
  if (resume.summary) parts.push(resume.summary);
  if (Array.isArray(resume.skills) && resume.skills.length) parts.push(`Skills: ${resume.skills.join(', ')}`);
  for (const exp of resume.experience ?? []) {
    parts.push(`${exp.role ?? ''} at ${exp.company ?? ''}: ${(exp.highlights ?? []).join(' ')}`);
  }
  return parts.filter(Boolean).join('\n');
}

export default function RecruiterAiScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { resumeId } = (route.params as { resumeId: string });
  const onGoBack = () => (navigation.canGoBack() ? navigation.goBack() : null);

  const [jdText, setJdText] = useState('');
  const [result, setResult] = useState<RecruiterSimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setError('');
    setResult(null);
    if (jdText.trim().length < 50) {
      setError('Paste a longer job description (at least a couple of paragraphs).');
      return;
    }
    setLoading(true);
    try {
      const resume = await resumeStore.get(resumeId);
      if (!resume) throw new Error('Resume not found on this device.');
      const resumeText = buildResumeText(resume);
      if (resumeText.trim().length < 20) throw new Error('Add more resume content before running the screen.');
      const res = await api.recruiterSim({ resumeText, jdText: jdText.trim(), currentSkills: resume.skills ?? [] });
      setResult(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Simulation failed';
      setError(/FREE_PLAN_AI_BLOCKED/i.test(msg) ? 'This is a Student/Pro feature. Upgrade to run the AI screen.' : msg);
    } finally {
      setLoading(false);
    }
  }

  const v = result ? presentVerdict(result.verdict) : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#f2f5f8' }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onGoBack}><Text style={styles.backBtn}>Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Recruiter AI</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Job Description</Text>
          <Text style={styles.hint}>See the verdict an AI hiring screen would give you for this role.</Text>
          <TextInput
            style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
            multiline
            placeholder="Paste the full job description..."
            value={jdText}
            onChangeText={setJdText}
          />
          <TouchableOpacity style={styles.btnPrimary} onPress={run} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Run the AI screen</Text>}
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {result && v && (
          <>
            <View style={styles.scoreCard}>
              <View style={[styles.verdictPill, { backgroundColor: v.background }]}>
                <Text style={[styles.verdictText, { color: v.color }]}>{v.label}</Text>
              </View>
              <Text style={styles.scoreNumber}>{result.score}<Text style={styles.scoreLabel}> / 100 fit</Text></Text>
              <Text style={styles.blurb}>{v.blurb}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>What the AI would tell the recruiter</Text>
              <Text style={styles.cardBody}>“{result.recruiterNote}”</Text>
              {result.provider === 'rule-based' ? (
                <Text style={styles.providerNote}>Offline estimate — based on keyword coverage.</Text>
              ) : null}
            </View>

            {result.strengths.length > 0 && (
              <View style={styles.card}>
                <Text style={[styles.cardTitle, { color: '#147a3a' }]}>Strengths</Text>
                {result.strengths.map((s, i) => <Text key={i} style={styles.listItem}>• {s}</Text>)}
              </View>
            )}

            {result.concerns.length > 0 && (
              <View style={styles.card}>
                <Text style={[styles.cardTitle, { color: '#b07906' }]}>Concerns</Text>
                {result.concerns.map((c, i) => <Text key={i} style={styles.listItem}>• {c}</Text>)}
              </View>
            )}

            {result.missingMustHaves.length > 0 && (
              <View style={styles.card}>
                <Text style={[styles.cardTitle, { color: '#a8412c' }]}>Missing must-haves</Text>
                <View style={styles.chips}>
                  {result.missingMustHaves.map((m, i) => (
                    <View key={i} style={styles.chipRed}><Text style={styles.chipRedText}>{m}</Text></View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { color: '#2f5f8f', fontSize: 15, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1a3a5c' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1a3a5c', marginBottom: 8 },
  cardBody: { fontSize: 14, color: '#444', lineHeight: 20 },
  hint: { fontSize: 13, color: '#5a6778', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#d0dbe7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: '#fafbfc', marginBottom: 12 },
  btnPrimary: { backgroundColor: '#1a3a5c', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  errorText: { color: '#c53030', fontSize: 13, backgroundColor: '#fff0f0', padding: 10, borderRadius: 8, marginBottom: 12 },
  scoreCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  verdictPill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 10 },
  verdictText: { fontSize: 15, fontWeight: '700' },
  scoreNumber: { fontSize: 44, fontWeight: '800', color: '#10243a' },
  scoreLabel: { fontSize: 16, color: '#888', fontWeight: '400' },
  blurb: { fontSize: 13, color: '#5a6778', marginTop: 8, textAlign: 'center' },
  providerNote: { fontSize: 12, color: '#9aa7b8', marginTop: 8 },
  listItem: { fontSize: 14, color: '#333', lineHeight: 22, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipRed: { backgroundColor: '#fff0f0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  chipRedText: { fontSize: 12, color: '#7a1f1f', fontWeight: '500' },
});
