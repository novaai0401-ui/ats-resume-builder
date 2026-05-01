import React, { useState } from 'react';
import {
  ScrollView, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api, type AtsScoreResult } from '../lib/api';
import { resumeStore } from '../lib/storageMode';

export default function AtsScoreScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { resumeId } = (route.params as { resumeId: string });
  const onGoBack = () => (navigation.canGoBack() ? navigation.goBack() : null);

  const isLocalId = resumeId.startsWith('local_');
  const [jdText, setJdText] = useState('');
  const [result, setResult] = useState<AtsScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function runAtsScore() {
    setLoading(true);
    setError('');
    try {
      let res: AtsScoreResult;
      if (isLocalId) {
        // Local-mode resume: send the content in the request body. The
        // server scores it in memory and returns the result without
        // ever writing the resume to its database.
        const resume = await resumeStore.get(resumeId);
        if (!resume) throw new Error('Resume not found on this device.');
        res = await api.atsScoreContent(resume, jdText.trim() || undefined);
      } else {
        res = await api.atsScore(resumeId, jdText.trim() || undefined);
      }
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scoring failed');
    } finally {
      setLoading(false);
    }
  }

  const scoreColor = !result ? '#888' : result.roleAdjustedScore >= 80 ? '#1e7a3a' : result.roleAdjustedScore >= 60 ? '#b88a00' : '#c53030';

  return (
    <View style={{ flex: 1, backgroundColor: '#f2f5f8' }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onGoBack}><Text style={styles.backBtn}>Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>ATS Score</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* JD Input */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Target Job Description</Text>
          <Text style={styles.hint}>Paste a job description to get targeted ATS feedback.</Text>
          <TextInput
            style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
            multiline
            numberOfLines={5}
            placeholder="Paste job description here (optional)..."
            value={jdText}
            onChangeText={setJdText}
          />
          <TouchableOpacity style={styles.btnPrimary} onPress={runAtsScore} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Analyze ATS Score</Text>}
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Score Result */}
        {result && (
          <>
            <View style={styles.scoreCard}>
              <Text style={[styles.scoreNumber, { color: scoreColor }]}>{result.roleAdjustedScore}</Text>
              <Text style={styles.scoreLabel}>/ 100</Text>
              <Text style={styles.roleLevel}>Role: {result.roleLevel}</Text>
            </View>

            {/* Guidance */}
            {result.guidance && (
              <>
                {result.guidance.scoreExplanation ? (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Why This Score</Text>
                    <Text style={styles.cardBody}>{result.guidance.scoreExplanation}</Text>
                  </View>
                ) : null}

                {result.guidance.topImpactActions.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Top Improvements</Text>
                    {result.guidance.topImpactActions.map((a, i) => (
                      <Text key={i} style={styles.listItem}>{i + 1}. {a}</Text>
                    ))}
                  </View>
                )}

                {result.guidance.matchedKeywords.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Matched Keywords</Text>
                    <View style={styles.chips}>
                      {result.guidance.matchedKeywords.map((k, i) => (
                        <View key={i} style={styles.chipGreen}><Text style={styles.chipGreenText}>{k}</Text></View>
                      ))}
                    </View>
                  </View>
                )}

                {result.guidance.missingKeywords.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Missing Keywords</Text>
                    <View style={styles.chips}>
                      {result.guidance.missingKeywords.map((k, i) => (
                        <View key={i} style={styles.chipRed}><Text style={styles.chipRedText}>{k}</Text></View>
                      ))}
                    </View>
                  </View>
                )}

                {result.guidance.roleAlignmentSummary ? (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Role Alignment</Text>
                    <Text style={styles.cardBody}>{result.guidance.roleAlignmentSummary}</Text>
                  </View>
                ) : null}

                {result.guidance.addOnlyIfTrue.length > 0 && (
                  <View style={[styles.card, { backgroundColor: '#fffcf0', borderColor: '#e8dca8' }]}>
                    <Text style={styles.cardTitle}>Add Only If True</Text>
                    <View style={styles.chips}>
                      {result.guidance.addOnlyIfTrue.map((k, i) => (
                        <View key={i} style={styles.chipYellow}><Text style={styles.chipYellowText}>{k}</Text></View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}

            {/* Fallback suggestions */}
            {result.improvementSuggestions.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Suggestions</Text>
                {result.improvementSuggestions.map((s, i) => (
                  <Text key={i} style={styles.listItem}>{s}</Text>
                ))}
              </View>
            )}

            {result.rejectionReasons.length > 0 && (
              <View style={[styles.card, { borderColor: '#f5a3a3' }]}>
                <Text style={[styles.cardTitle, { color: '#c53030' }]}>Issues</Text>
                {result.rejectionReasons.map((r, i) => (
                  <Text key={i} style={[styles.listItem, { color: '#c53030' }]}>{r}</Text>
                ))}
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
  scoreNumber: { fontSize: 56, fontWeight: '800' },
  scoreLabel: { fontSize: 18, color: '#888', marginTop: -4 },
  roleLevel: { fontSize: 14, color: '#5a6778', marginTop: 8 },
  listItem: { fontSize: 14, color: '#333', lineHeight: 22, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipGreen: { backgroundColor: '#e8f5ec', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  chipGreenText: { fontSize: 12, color: '#1e5b35', fontWeight: '500' },
  chipRed: { backgroundColor: '#fff0f0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  chipRedText: { fontSize: 12, color: '#7a1f1f', fontWeight: '500' },
  chipYellow: { backgroundColor: '#fef3cd', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  chipYellowText: { fontSize: 12, color: '#856404', fontWeight: '500' },
});
