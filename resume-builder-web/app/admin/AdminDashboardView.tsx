'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, isCurrentUserAdmin, isApiRequestError } from '@/src/lib/api';
import DataLoader from '@/src/components/DataLoader';

type Summary = Awaited<ReturnType<typeof api.getAdminAnalyticsSummary>>;
type UsersResponse = Awaited<ReturnType<typeof api.getAdminUsers>>;
type ActivityResponse = Awaited<ReturnType<typeof api.getAdminRecentActivity>>;
type LocationsResponse = Awaited<ReturnType<typeof api.getAdminLocations>>;

/**
 * Admin dashboard. Renders the aggregate figures from
 * /admin/analytics/summary plus the latest users, login events, and IPs.
 * Only rendered for callers with admin privilege; AuthGate upstream covers
 * unauthenticated access and the API guard enforces authorization server-side.
 */
export default function AdminDashboardView() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<UsersResponse['users']>([]);
  const [activity, setActivity] = useState<ActivityResponse['events']>([]);
  const [locations, setLocations] = useState<LocationsResponse['top']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!isCurrentUserAdmin()) {
      setAllowed(false);
      setError('Admin access required.');
      setLoading(false);
      return;
    }
    setAllowed(true);
    let cancelled = false;
    async function load() {
      try {
        const [s, u, a, l] = await Promise.all([
          api.getAdminAnalyticsSummary(),
          api.getAdminUsers(50),
          api.getAdminRecentActivity(25),
          api.getAdminLocations(30),
        ]);
        if (cancelled) return;
        setSummary(s);
        setUsers(u.users);
        setActivity(a.events);
        setLocations(l.top);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = isApiRequestError(err) ? err.message : err instanceof Error ? err.message : 'Failed to load admin data.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!allowed) {
    return (
      <main className="container">
        <section className="card" style={{ marginTop: 16 }}>
          <h1 style={{ marginTop: 0 }}>Admin</h1>
          <p className="small" style={{ color: '#b91c1c' }}>{error || 'Admin access required.'}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>Admin dashboard</h1>
          <Link className="small" href="/admin/settings">Feature flags &rarr;</Link>
        </div>
      </section>

      {loading && (
        <section className="card" style={{ marginTop: 16 }}>
          <DataLoader label="Loading admin dashboard…" />
        </section>
      )}

      {!loading && error && (
        <section className="card" style={{ marginTop: 16 }}>
          <p className="small" style={{ color: '#b91c1c' }}>{error}</p>
        </section>
      )}

      {!loading && !error && summary && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Summary</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Metric label="Total users" value={summary.totalRegisteredUsers} />
            <Metric label="Paid subscribers" value={summary.paidSubscribers} />
            <Metric label="Active right now" value={summary.activeRightNow} hint="Last 5 minutes" />
            <Metric label="Logins (24h)" value={summary.logins24h} />
            <Metric label="New users (7d)" value={summary.newUsers7d} />
            <Metric label="Total logins" value={summary.totalLoginEvents} />
          </div>
          <div className="admin-2col" style={{ marginTop: 16 }}>
            <div>
              <h3 style={{ marginBottom: 6 }}>Plan breakdown</h3>
              <ul className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
                {summary.planBreakdown.map((row) => (
                  <li key={row.plan}>{row.plan}: {row.count}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 style={{ marginBottom: 6 }}>Primary auth provider</h3>
              <ul className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
                {summary.providerBreakdown.map((row) => (
                  <li key={row.provider}>{row.provider}: {row.count}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {!loading && !error && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Recent users</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="small" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Plan</th>
                  <th style={thStyle}>Provider</th>
                  <th style={thStyle}>Last active</th>
                  <th style={thStyle}>Logins</th>
                  <th style={thStyle}>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={tdStyle}>{u.fullName}{u.isAdmin ? ' *' : ''}</td>
                    <td style={tdStyle}>{u.email}</td>
                    <td style={tdStyle}>{u.plan}</td>
                    <td style={tdStyle}>{u.primaryAuthProvider}</td>
                    <td style={tdStyle}>{u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString() : '—'}</td>
                    <td style={tdStyle}>{u.loginCount}</td>
                    <td style={tdStyle}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && !error && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Recent login activity</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="small" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={thStyle}>When</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Method</th>
                  <th style={thStyle}>IP</th>
                  <th style={thStyle}>Device</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((e) => (
                  <tr key={e.id}>
                    <td style={tdStyle}>{new Date(e.createdAt).toLocaleString()}</td>
                    <td style={tdStyle}>{e.email}</td>
                    <td style={tdStyle}>{e.method}</td>
                    <td style={tdStyle}>{e.ip || '—'}</td>
                    <td style={tdStyle} title={e.userAgent || ''}>{truncate(e.userAgent || '—', 40)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && !error && (
        <section className="card" style={{ marginTop: 16, marginBottom: 24 }}>
          <h2 style={{ marginTop: 0 }}>Top login IPs (last 30 days)</h2>
          <p className="small" style={{ marginTop: 0, color: '#5a6778' }}>
            IP is a rough location proxy. Plug in MaxMind / ipinfo on the API to resolve country and city.
          </p>
          <ul className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.9 }}>
            {locations.length === 0 && <li>No login events in the selected window.</li>}
            {locations.map((loc, i) => (
              <li key={`${loc.ip}-${i}`}>{loc.ip || 'unknown'} — {loc.count} logins</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

const thStyle: React.CSSProperties = {
  borderBottom: '1px solid #d0dbe7',
  padding: '6px 8px',
  fontWeight: 600,
};
const tdStyle: React.CSSProperties = {
  borderBottom: '1px solid #eef1f5',
  padding: '6px 8px',
};

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div style={{ padding: 10, background: '#f4f8fc', border: '1px solid #d0dbe7', borderRadius: 8 }}>
      <div className="small" style={{ color: '#5a6778' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1a3a5c' }}>{value.toLocaleString()}</div>
      {hint && <div className="small" style={{ color: '#888' }}>{hint}</div>}
    </div>
  );
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
