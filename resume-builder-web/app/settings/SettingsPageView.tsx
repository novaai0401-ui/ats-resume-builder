'use client';

import { useEffect, useState } from 'react';
import { api, readByokAiKey, writeByokAiKey } from '@/src/lib/api';

/**
 * User settings. Currently limited to the bring-your-own-key AI form.
 * Key is stored in this browser only (localStorage) and forwarded with
 * AI requests so the server uses it in place of the shared free-tier key.
 */
export default function SettingsPageView() {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const existing = readByokAiKey();
    setHasKey(Boolean(existing));
  }, []);

  async function handleSave() {
    writeByokAiKey(key);
    const nowHasKey = Boolean(key.trim());
    setSaved(true);
    setHasKey(nowHasKey);
    setKey('');
    // Sync the boolean flag to the server so the admin dashboard can count it.
    // Best-effort only — failures are silent so settings UX isn't blocked.
    try {
      await api.setByokKeyFlag(nowHasKey);
    } catch {
      // ignore
    }
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleClear() {
    writeByokAiKey('');
    setHasKey(false);
    setKey('');
    setSaved(false);
    try {
      await api.setByokKeyFlag(false);
    } catch {
      // ignore
    }
  }

  return (
    <main className="container">
      <section className="card">
        <h1 style={{ marginTop: 0 }}>Settings</h1>
        <p className="small" style={{ marginTop: 0 }}>
          Manage your personal free-tier AI key. The key stays in this browser and is forwarded with your AI requests.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Your AI key (BYOK)</h2>
        <p className="small">
          Paste a Groq / XAI API key to power your ATS score and tech-gap analyses. Leaving it empty uses the shared free-tier key.
        </p>
        <p className="small" style={{ color: '#6b5200', background: '#fff8e1', borderLeft: '3px solid #f4d37a', padding: '6px 10px' }}>
          Stored in this browser&rsquo;s local storage only. Clearing browser data removes it.
        </p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 520, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="small">API key</span>
            <input
              type="password"
              className="input"
              placeholder={hasKey ? 'A key is saved (enter a new one to replace)' : 'gsk_... or xai-...'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={handleSave} disabled={!key.trim()}>
              {hasKey ? 'Replace key' : 'Save key'}
            </button>
            <button className="btn secondary" onClick={handleClear} disabled={!hasKey}>
              Clear saved key
            </button>
          </div>
          {saved && <p className="small" style={{ color: '#1e7a46' }}>Saved.</p>}
          <p className="small" style={{ color: '#5a6778' }}>
            {hasKey ? 'AI requests will use your key.' : 'AI requests will use the shared free-tier key.'}
          </p>
        </div>
      </section>
    </main>
  );
}
