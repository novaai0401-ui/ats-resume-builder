import React, { useEffect, useState } from 'react';
import {
  ScrollView, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type Resume } from '../lib/api';
import { resumeStore } from '../lib/storageMode';
import { setSecureScreen } from '../lib/security';
import type { AppStackParamList } from '../App';

type Nav = NativeStackNavigationProp<AppStackParamList, 'ResumeEditor'>;

export default function ResumeEditorScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const { resumeId } = (route.params as { resumeId: string });
  const onGoBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs'));
  const onViewAts = (id: string) => navigation.navigate('AtsScore', { resumeId: id });
  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState<'contact' | 'summary' | 'skills' | 'experience' | 'education'>('summary');

  useEffect(() => {
    resumeStore.get(resumeId)
      .then((r) => {
        if (!r) throw new Error('Resume not found.');
        setResume(r);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [resumeId]);

  // Block screenshots / screen recording while editing — resumes contain
  // home address, phone, full work history. Re-enable on unmount so the
  // user can still screenshot non-sensitive screens.
  useEffect(() => {
    setSecureScreen(true);
    return () => { setSecureScreen(false); };
  }, []);

  async function handleSave() {
    if (!resume) return;
    setSaving(true);
    setError('');
    try {
      const updated = await resumeStore.update(resumeId, {
        title: resume.title,
        summary: resume.summary,
        skills: resume.skills,
        experience: resume.experience,
        education: resume.education,
      });
      setResume(updated);
      Alert.alert('Saved', 'Resume saved successfully.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a3a5c" />
        <Text style={styles.loadingText}>Loading resume...</Text>
      </View>
    );
  }

  if (!resume) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Resume not found'}</Text>
        <TouchableOpacity style={styles.btnPrimary} onPress={onGoBack}><Text style={styles.btnPrimaryText}>Go Back</Text></TouchableOpacity>
      </View>
    );
  }

  const SECTIONS = [
    { key: 'summary' as const, label: 'Summary' },
    { key: 'skills' as const, label: 'Skills' },
    { key: 'experience' as const, label: 'Experience' },
    { key: 'education' as const, label: 'Education' },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onGoBack}><Text style={styles.backBtn}>Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{resume.title || 'Resume'}</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.saveBtn, saving && { opacity: 0.5 }]}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      {/* Section Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {SECTIONS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.tab, activeSection === s.key && styles.tabActive]}
            onPress={() => setActiveSection(s.key)}
          >
            <Text style={[styles.tabText, activeSection === s.key && styles.tabTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.tab} onPress={() => onViewAts(resumeId)}>
          <Text style={[styles.tabText, { color: '#2f5f8f' }]}>ATS Score</Text>
        </TouchableOpacity>
      </ScrollView>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {activeSection === 'summary' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional Summary</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={6}
              placeholder="Write a concise professional summary..."
              value={resume.summary}
              onChangeText={(text) => setResume({ ...resume, summary: text })}
            />
            <Text style={styles.charCount}>{resume.summary.length} characters</Text>
          </View>
        )}

        {activeSection === 'skills' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <Text style={styles.hint}>{resume.skills.length} skills added</Text>
            {resume.skills.map((skill, i) => (
              <View key={i} style={styles.skillRow}>
                <Text style={styles.skillText}>{skill}</Text>
                <TouchableOpacity onPress={() => setResume({ ...resume, skills: resume.skills.filter((_, j) => j !== i) })}>
                  <Text style={styles.removeBtn}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
            <AddItemRow
              placeholder="Add a skill"
              onAdd={(val) => setResume({ ...resume, skills: [...resume.skills, val] })}
            />
          </View>
        )}

        {activeSection === 'experience' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {resume.experience.map((exp, i) => (
              <View key={i} style={styles.card}>
                <TextInput style={styles.input} placeholder="Company" value={exp.company} onChangeText={(v) => { const e = [...resume.experience]; e[i] = { ...e[i], company: v }; setResume({ ...resume, experience: e }); }} />
                <TextInput style={styles.input} placeholder="Role" value={exp.role} onChangeText={(v) => { const e = [...resume.experience]; e[i] = { ...e[i], role: v }; setResume({ ...resume, experience: e }); }} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="Start" value={exp.startDate} onChangeText={(v) => { const e = [...resume.experience]; e[i] = { ...e[i], startDate: v }; setResume({ ...resume, experience: e }); }} />
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="End" value={exp.endDate} onChangeText={(v) => { const e = [...resume.experience]; e[i] = { ...e[i], endDate: v }; setResume({ ...resume, experience: e }); }} />
                </View>
                <Text style={styles.hint}>Highlights</Text>
                {exp.highlights.map((h, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Achievement or responsibility" value={h} onChangeText={(v) => { const e = [...resume.experience]; const hl = [...e[i].highlights]; hl[j] = v; e[i] = { ...e[i], highlights: hl }; setResume({ ...resume, experience: e }); }} />
                  </View>
                ))}
                <TouchableOpacity onPress={() => { const e = [...resume.experience]; e[i] = { ...e[i], highlights: [...e[i].highlights, ''] }; setResume({ ...resume, experience: e }); }}>
                  <Text style={styles.addLink}>+ Add bullet</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setResume({ ...resume, experience: [...resume.experience, { company: '', role: '', startDate: '', endDate: '', highlights: [''] }] })}>
              <Text style={styles.btnSecondaryText}>+ Add Experience</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeSection === 'education' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {resume.education.map((edu, i) => (
              <View key={i} style={styles.card}>
                <TextInput style={styles.input} placeholder="Institution" value={edu.institution} onChangeText={(v) => { const e = [...resume.education]; e[i] = { ...e[i], institution: v }; setResume({ ...resume, education: e }); }} />
                <TextInput style={styles.input} placeholder="Degree" value={edu.degree} onChangeText={(v) => { const e = [...resume.education]; e[i] = { ...e[i], degree: v }; setResume({ ...resume, education: e }); }} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="Start" value={edu.startDate} onChangeText={(v) => { const e = [...resume.education]; e[i] = { ...e[i], startDate: v }; setResume({ ...resume, education: e }); }} />
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="End" value={edu.endDate} onChangeText={(v) => { const e = [...resume.education]; e[i] = { ...e[i], endDate: v }; setResume({ ...resume, education: e }); }} />
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setResume({ ...resume, education: [...resume.education, { institution: '', degree: '', startDate: '', endDate: '' }] })}>
              <Text style={styles.btnSecondaryText}>+ Add Education</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AddItemRow({ placeholder, onAdd }: { placeholder: string; onAdd: (val: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <TextInput style={[styles.input, { flex: 1 }]} placeholder={placeholder} value={value} onChangeText={setValue} />
      <TouchableOpacity style={styles.btnPrimary} onPress={() => { if (value.trim()) { onAdd(value.trim()); setValue(''); } }}>
        <Text style={styles.btnPrimaryText}>Add</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#5a6778', fontSize: 14 },
  errorText: { color: '#c53030', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  errorBanner: { color: '#c53030', fontSize: 13, backgroundColor: '#fff0f0', padding: 10, marginHorizontal: 16, borderRadius: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { color: '#2f5f8f', fontSize: 15, fontWeight: '500' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1a3a5c', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  saveBtn: { color: '#2f5f8f', fontSize: 15, fontWeight: '600' },
  tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 12, maxHeight: 48 },
  tab: { paddingHorizontal: 14, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1a3a5c' },
  tabText: { fontSize: 14, color: '#5a6778', fontWeight: '500' },
  tabTextActive: { color: '#1a3a5c', fontWeight: '600' },
  body: { flex: 1, backgroundColor: '#f2f5f8' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a3a5c', marginBottom: 12 },
  hint: { fontSize: 13, color: '#5a6778', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#d0dbe7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: '#fff', marginBottom: 10 },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  charCount: { fontSize: 12, color: '#888', textAlign: 'right' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  skillRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#eef5ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  skillText: { fontSize: 14, color: '#1a3a5c' },
  removeBtn: { color: '#c53030', fontSize: 13, fontWeight: '500' },
  addLink: { color: '#2f5f8f', fontSize: 14, fontWeight: '500', marginTop: 8 },
  btnPrimary: { backgroundColor: '#1a3a5c', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnSecondary: { borderWidth: 1, borderColor: '#d0dbe7', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  btnSecondaryText: { color: '#1a3a5c', fontSize: 14, fontWeight: '500' },
});
