import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type Resume } from '../lib/api';
import { resumeStore } from '../lib/storageMode';
import { theme } from '../lib/theme';
import type { AppStackParamList } from '../App';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export default function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadResumes = useCallback(async () => {
    setError('');
    try {
      const list = await resumeStore.list();
      setResumes(Array.isArray(list) ? list : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load resumes');
    }
  }, []);

  useEffect(() => {
    loadResumes().finally(() => setLoading(false));
  }, [loadResumes]);

  // Re-fetch when the tab regains focus so edits show up.
  useFocusEffect(
    useCallback(() => {
      loadResumes();
    }, [loadResumes]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadResumes();
    setRefreshing(false);
  }

  async function createResume() {
    try {
      const created = await resumeStore.create({ title: 'Untitled Resume', summary: '', skills: [], experience: [], education: [] });
      navigation.navigate('ResumeEditor', { resumeId: created.id });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create resume');
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>My Resumes</Text>
        <Text style={styles.subtitle}>Tap to edit, or create a new one.</Text>
      </View>

      <TouchableOpacity style={styles.newBtn} onPress={createResume}>
        <Text style={styles.newBtnText}>+ New Resume</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading resumes…</Text>
        </View>
      ) : resumes.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No resumes yet. Create your first resume!</Text>
        </View>
      ) : (
        resumes.map((resume) => (
          <TouchableOpacity
            key={resume.id}
            style={styles.resumeCard}
            onPress={() => navigation.navigate('ResumeEditor', { resumeId: resume.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.resumeTitle}>{resume.title || 'Untitled Resume'}</Text>
              <Text style={styles.resumeMeta}>
                {resume.experience?.length || 0} experience · {resume.skills?.length || 0} skills
              </Text>
              <Text style={styles.resumeDate}>Updated {new Date(resume.updatedAt).toLocaleDateString()}</Text>
            </View>
            <TouchableOpacity
              style={styles.atsBtn}
              onPress={() => navigation.navigate('AtsScore', { resumeId: resume.id })}
            >
              <Text style={styles.atsBtnText}>ATS</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.text },
  subtitle: { fontSize: 14, color: theme.colors.muted, marginTop: 4 },
  newBtn: { backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  loadingText: { fontSize: 14, color: theme.colors.muted },
  emptyBox: { padding: 24, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  emptyText: { fontSize: 14, color: theme.colors.muted, textAlign: 'center' },
  resumeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  resumeTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.primary },
  resumeMeta: { fontSize: 12, color: theme.colors.muted, marginTop: 4 },
  resumeDate: { fontSize: 11, color: '#888', marginTop: 2 },
  atsBtn: { backgroundColor: '#eef5ff', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  atsBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 12 },
  errorText: { color: theme.colors.danger, fontSize: 13, textAlign: 'center', marginTop: 12, backgroundColor: '#fff0f0', padding: 10, borderRadius: 8 },
});
