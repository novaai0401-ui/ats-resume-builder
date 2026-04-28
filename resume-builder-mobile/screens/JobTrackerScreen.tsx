import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../lib/api';
import { theme } from '../lib/theme';

type Job = {
  id: string;
  company?: string;
  role?: string;
  status?: string;
  link?: string;
  notes?: string;
};

const STATUSES = ['Applied', 'Interviewing', 'Offer', 'Rejected'];

export default function JobTrackerScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [newJob, setNewJob] = useState({ company: '', role: '', status: 'Applied', link: '' });

  const load = useCallback(async () => {
    setError('');
    try {
      const list = await api.listJobs();
      setJobs((list as Job[]) ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function addJob() {
    if (!newJob.company.trim() || !newJob.role.trim()) {
      setError('Company and role are required');
      return;
    }
    try {
      await api.createJob(newJob);
      setNewJob({ company: '', role: '', status: 'Applied', link: '' });
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not add job');
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await api.updateJob(id, { status });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update job');
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Job Tracker</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
          <Text style={styles.addBtnText}>{showForm ? 'Close' : '+ Add Job'}</Text>
        </TouchableOpacity>
      </View>

      {showForm && (
        <View style={styles.card}>
          <TextInput style={styles.input} placeholder="Company" value={newJob.company} onChangeText={(v) => setNewJob({ ...newJob, company: v })} />
          <TextInput style={styles.input} placeholder="Role" value={newJob.role} onChangeText={(v) => setNewJob({ ...newJob, role: v })} />
          <TextInput style={styles.input} placeholder="Posting URL (optional)" value={newJob.link} onChangeText={(v) => setNewJob({ ...newJob, link: v })} autoCapitalize="none" />
          <View style={styles.statusRow}>
            {STATUSES.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.statusChip, newJob.status === s && styles.statusChipActive]}
                onPress={() => setNewJob({ ...newJob, status: s })}
              >
                <Text style={[styles.statusChipText, newJob.status === s && styles.statusChipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.btnPrimary} onPress={addJob}>
            <Text style={styles.btnPrimaryText}>Save</Text>
          </TouchableOpacity>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {jobs.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No applications yet. Start tracking your job search.</Text>
        </View>
      ) : (
        jobs.map((job) => (
          <View key={job.id} style={styles.card}>
            <Text style={styles.jobRole}>{job.role || '—'}</Text>
            <Text style={styles.jobCompany}>{job.company || '—'}</Text>
            <View style={styles.statusRow}>
              {STATUSES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusChip, job.status === s && styles.statusChipActive]}
                  onPress={() => updateStatus(job.id, s)}
                >
                  <Text style={[styles.statusChipText, job.status === s && styles.statusChipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: theme.colors.text },
  addBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: '#fff', marginBottom: 10 },
  jobRole: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
  jobCompany: { fontSize: 13, color: theme.colors.muted, marginTop: 2, marginBottom: 8 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  statusChip: { backgroundColor: '#eef3f8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusChipActive: { backgroundColor: theme.colors.primary },
  statusChipText: { color: theme.colors.text, fontSize: 12, fontWeight: '500' },
  statusChipTextActive: { color: '#fff' },
  btnPrimary: { backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyBox: { padding: 24, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  emptyText: { fontSize: 14, color: theme.colors.muted, textAlign: 'center' },
  errorText: { color: theme.colors.danger, fontSize: 13, backgroundColor: '#fff0f0', padding: 10, borderRadius: 8, marginBottom: 12 },
});
