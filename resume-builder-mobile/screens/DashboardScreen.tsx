import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, RefreshControl } from 'react-native';
import TemplateCard, { type TemplateCardItem } from '../components/TemplateCard';
import { api, type Resume } from '../lib/api';

const TEMPLATE_CATALOG: TemplateCardItem[] = [
  { id: 'classic', name: 'Classic ATS', description: 'Single-column, clean layout optimized for ATS parsers.', tags: ['ATS-safe', 'Classic'] },
  { id: 'modern', name: 'Modern Professional', description: 'Clean modern layout with subtle divider lines.', tags: ['ATS-safe', 'Modern'] },
  { id: 'executive', name: 'Executive Impact', description: 'Leadership-focused layout with strong visual hierarchy.', tags: ['ATS-safe', 'Leadership'] },
  { id: 'technical', name: 'Technical Compact', description: 'Dense layout for technical roles with many skills.', tags: ['ATS-safe', 'Technical'] },
  { id: 'minimal', name: 'Minimal Clean', description: 'Ultra-minimal recruiter-friendly layout.', tags: ['ATS-safe', 'Minimal'] },
  { id: 'consultant', name: 'Consultant Clean', description: 'Consulting and strategy-focused layout.', tags: ['ATS-safe', 'Consulting'] },
];

type Props = {
  onNavigateToTemplate: (templateId: string) => void;
  selectedTemplateId?: string;
  onLogout?: () => void;
  onEditResume?: (resumeId: string) => void;
};

export default function DashboardScreen({ onNavigateToTemplate, selectedTemplateId, onLogout, onEditResume }: Props) {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadResumes = async () => {
    try {
      const list = await api.listResumes();
      setResumes(Array.isArray(list) ? list : []);
    } catch {}
  };

  useEffect(() => {
    loadResumes().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadResumes();
    setRefreshing(false);
  };

  const templates = TEMPLATE_CATALOG.map((t) => ({
    ...t,
    isSelected: t.id === selectedTemplateId,
  }));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.title}>Dashboard</Text>
          {onLogout && (
            <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.subtitle}>Manage your resumes and browse templates.</Text>
      </View>

      {/* My Resumes */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Resumes</Text>
        <Text style={styles.sectionCount}>{resumes.length}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#1a3a5c" />
          <Text style={styles.loadingText}>Loading resumes...</Text>
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
            onPress={() => onEditResume?.(resume.id)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.resumeTitle}>{resume.title || 'Untitled Resume'}</Text>
              <Text style={styles.resumeMeta}>
                {resume.experience?.length || 0} experience entries | {resume.skills?.length || 0} skills
              </Text>
              <Text style={styles.resumeDate}>Updated {new Date(resume.updatedAt).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.arrowIcon}>{'>'}</Text>
          </TouchableOpacity>
        ))
      )}

      {/* Templates */}
      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Text style={styles.sectionTitle}>Templates</Text>
      </View>
      <View style={styles.grid}>
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onPreview={(id) => onNavigateToTemplate(id)}
            onSelect={(id) => onNavigateToTemplate(id)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#172332' },
  subtitle: { fontSize: 14, color: '#5a6778', marginTop: 4 },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#c4d5e0' },
  logoutText: { color: '#1a3a5c', fontSize: 13, fontWeight: '500' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#172332' },
  sectionCount: { fontSize: 14, fontWeight: '600', color: '#2f5f8f', backgroundColor: '#eef5ff', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12 },
  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  loadingText: { fontSize: 14, color: '#5a6778' },
  emptyBox: { padding: 24, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#5a6778', textAlign: 'center' },
  resumeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  resumeTitle: { fontSize: 15, fontWeight: '600', color: '#1a3a5c' },
  resumeMeta: { fontSize: 12, color: '#5a6778', marginTop: 4 },
  resumeDate: { fontSize: 11, color: '#888', marginTop: 2 },
  arrowIcon: { fontSize: 18, color: '#c4d5e0', fontWeight: '600' },
  grid: { gap: 16 },
});
