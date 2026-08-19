'use client';

/**
 * Zero-knowledge encrypted backup / restore.
 *
 * The pragmatic alternative to full local-first: the user encrypts their
 * resumes into a file with a passphrase only they hold. We never see the
 * plaintext or the key, so device loss is recoverable (keep the file +
 * passphrase) without us ever being able to read it.
 */

import { useState } from 'react';
import { api } from '@/src/lib/api';
import { encryptBackup, decryptBackup } from '@/src/lib/zk-crypto';
import { TkxButton, TkxInput } from 'tekivex-ui';

export default function EncryptedBackupCard() {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function handleExport() {
    setError('');
    setStatus('');
    if (passphrase.length < 8) {
      setError('Use a passphrase of at least 8 characters. Store it safely — it cannot be recovered.');
      return;
    }
    setBusy(true);
    try {
      const resumes = await api.listResumes();
      const blob = await encryptBackup({ exportedAt: new Date().toISOString(), resumes }, passphrase);
      const file = new Blob([blob], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pocket-resume-${new Date().toISOString().slice(0, 10)}.zkbackup`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('Encrypted backup downloaded. Keep the file and passphrase together — safely.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the backup.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(file: File) {
    setError('');
    setStatus('');
    if (passphrase.length < 8) {
      setError('Enter the passphrase you used when you created this backup.');
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const restored = await decryptBackup<{ resumes?: unknown[] }>(text, passphrase);
      const count = Array.isArray(restored?.resumes) ? restored.resumes.length : 0;
      setStatus(`Backup decrypted successfully — ${count} resume${count === 1 ? '' : 's'} found. Import wiring lands next; your file is valid and readable with this passphrase.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this backup.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" data-testid="encrypted-backup-card">
      <h2 style={{ marginTop: 0 }}>Encrypted backup</h2>
      <p className="small" style={{ color: 'var(--muted)' }}>
        Download your resumes as a single encrypted file. We can never read it — only your
        passphrase can. This is the safety net for the privacy-first storage model: lose your
        device, keep your data.
      </p>
      <TkxInput label="Passphrase"
        id="zk-pass"
       
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="At least 8 characters — store it safely"
        autoComplete="off"
        style={{ marginTop: 4, marginBottom: 10 }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <TkxButton type="button" onClick={handleExport} disabled={busy}>
          {busy ? 'Working…' : 'Download encrypted backup'}
        </TkxButton>
        <label className="btn secondary" style={{ cursor: 'pointer', margin: 0 }}>
          Restore from backup
          <input
            type="file"
            accept=".zkbackup,application/json"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRestore(f); e.target.value = ''; }}
            disabled={busy}
          />
        </label>
      </div>
      {status && <p className="small" style={{ color: 'var(--success)', marginTop: 10 }}>{status}</p>}
      {error && <p className="small" style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</p>}
    </section>
  );
}
