import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Download Pocket Resume',
  description: 'Install Pocket Resume on Android (APK), iOS (TestFlight or PWA), or as a web app on desktop. Verified downloads with published checksums.',
};

// We don't ship through the stores, so users need confidence the file
// they got matches what we published. Render the SHA-256 + APK signing
// fingerprint right next to the download button. They can verify with:
//
//   sha256sum pocket-resume-1.0.0.apk
//   apksigner verify --print-certs pocket-resume-1.0.0.apk
//
// Values come from /app/version on the API, which serves them from
// signed-storage so they can't drift between releases.

type ReleaseManifest = {
  latest: string;
  android: { url: string; sha256: string; signatureSha256: string; size?: number };
  ios?: { testflightUrl: string };
  web: { url: string };
  notes?: string;
  releasedAt?: string;
};

async function fetchManifest(): Promise<ReleaseManifest | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  try {
    const res = await fetch(`${apiUrl}/app/version?platform=web`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function DownloadPage() {
  const manifest = await fetchManifest();

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 80px' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Get Pocket Resume on your phone</h1>
      <p style={{ color: 'var(--muted)', lineHeight: 1.55, marginBottom: 24 }}>
        Pocket Resume isn&rsquo;t in the App Store or Play Store yet. Install one of the options
        below — your account works the same on every platform.
      </p>

      {/* ── Android APK ───────────────────────────────────────────── */}
      <section style={cardStyle}>
        <header style={cardHeader}>
          <h2 style={cardTitle}>Android (APK)</h2>
          {manifest?.latest ? <span style={pill}>v{manifest.latest}</span> : null}
        </header>
        <p style={cardBody}>
          Download the signed APK and install it directly. You may need to enable
          &ldquo;Install unknown apps&rdquo; for your browser the first time.
        </p>
        {manifest?.android?.url ? (
          <a
            href={manifest.android.url}
            rel="noopener nofollow"
            download
            style={primaryBtn}
          >
            Download APK ({manifest.android.size ? formatSize(manifest.android.size) : 'signed'})
          </a>
        ) : (
          <button disabled style={disabledBtn}>Build not yet published</button>
        )}

        {manifest?.android?.sha256 && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              Verify your download
            </summary>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink)' }}>
              <p style={{ margin: '4px 0' }}>
                After downloading, run these commands to confirm the file matches what we
                published. If either value differs, do not install — re-download from this
                page or report it to security@pocketresume.app.
              </p>
              <Code label="SHA-256 of the APK" value={manifest.android.sha256} command="sha256sum pocket-resume.apk" />
              <Code
                label="APK signing certificate (SHA-256)"
                value={manifest.android.signatureSha256}
                command="apksigner verify --print-certs pocket-resume.apk"
              />
            </div>
          </details>
        )}

        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Install steps (Android)</summary>
          <ol style={{ marginTop: 12, color: 'var(--ink)', lineHeight: 1.55, paddingLeft: 20 }}>
            <li>Tap <strong>Download APK</strong> above.</li>
            <li>When prompted, tap <strong>Open</strong>. Android will warn that the file is from an unknown source.</li>
            <li>Tap <strong>Settings</strong> → enable <em>&ldquo;Allow from this source&rdquo;</em> for your browser.</li>
            <li>Go back and tap <strong>Install</strong>.</li>
            <li>Open Pocket Resume and sign in with your existing account.</li>
          </ol>
        </details>
      </section>

      {/* ── iOS ────────────────────────────────────────────────────── */}
      <section style={cardStyle}>
        <header style={cardHeader}>
          <h2 style={cardTitle}>iPhone &amp; iPad</h2>
          <span style={pill}>PWA recommended</span>
        </header>
        <p style={cardBody}>
          Apple doesn&rsquo;t allow direct APK-style installs. Two options:
        </p>
        <ol style={{ color: 'var(--ink)', lineHeight: 1.6, paddingLeft: 20 }}>
          <li style={{ marginBottom: 12 }}>
            <strong>Install as a PWA</strong> (works today, no developer account needed).{' '}
            Open this site in Safari → tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.
            You get an icon on your home screen and a full-screen app experience.
          </li>
          {manifest?.ios?.testflightUrl ? (
            <li>
              <strong>Join TestFlight</strong>: <a href={manifest.ios.testflightUrl} rel="noopener">{manifest.ios.testflightUrl}</a>
            </li>
          ) : (
            <li>
              <strong>TestFlight beta</strong>: link will appear here once we open public beta.
            </li>
          )}
        </ol>
      </section>

      {/* ── Desktop / web ──────────────────────────────────────────── */}
      <section style={cardStyle}>
        <header style={cardHeader}>
          <h2 style={cardTitle}>Desktop &amp; web</h2>
        </header>
        <p style={cardBody}>
          Just visit <a href="/dashboard">pocketresume.app/dashboard</a> in any browser. Same login,
          same data. You can also install it as an app from Chrome, Edge, or Brave (look for the
          install icon in the address bar).
        </p>
      </section>

      {/* ── Trust footer ───────────────────────────────────────────── */}
      <section style={{ ...cardStyle, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Why no app store yet?</h2>
        <p style={{ color: 'var(--ink)', lineHeight: 1.55, margin: 0 }}>
          We&rsquo;re a small team and the App Store + Play Store fees ($99/yr + $25 one-time) plus
          weeks of review aren&rsquo;t worth it until we have product-market fit. Our APK is signed
          with a stable key, served over HTTPS, and verified at runtime — see{' '}
          <a href="/security">how we secure sideloaded installs</a>.
        </p>
      </section>
    </main>
  );
}

function Code({ label, value, command }: { label: string; value: string; command: string }) {
  return (
    <div style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, marginTop: 8, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, overflowX: 'auto' }}>
      <div style={{ color: '#94a3b8', marginBottom: 4 }}>{label}</div>
      <div style={{ wordBreak: 'break-all' }}>{value}</div>
      <div style={{ color: '#94a3b8', marginTop: 8 }}>$ {command}</div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 24,
  marginBottom: 16,
};
const cardHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
  gap: 12,
};
const cardTitle: React.CSSProperties = { fontSize: 18, margin: 0, color: 'var(--primary)' };
const cardBody: React.CSSProperties = { color: 'var(--ink)', lineHeight: 1.55, margin: '0 0 16px' };
const pill: React.CSSProperties = { background: 'var(--surface-alt)', color: 'var(--primary)', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 };
const primaryBtn: React.CSSProperties = { display: 'inline-block', background: 'var(--primary)', color: '#fff', padding: '12px 18px', borderRadius: 'var(--radius)', fontWeight: 600, textDecoration: 'none' };
const disabledBtn: React.CSSProperties = { background: '#cbd5e0', color: '#fff', padding: '12px 18px', borderRadius: 'var(--radius)', fontWeight: 600, border: 0, cursor: 'not-allowed' };
