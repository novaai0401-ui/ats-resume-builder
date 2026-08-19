'use client';

/**
 * Sahaayak — emotional companion UI.
 *
 * Design choices, in priority order:
 *   1. Opt-in is loud and deliberate. Memory only starts after the user
 *      explicitly chooses a mode. No tracking-by-default — that would
 *      betray the entire premise of the feature.
 *   2. Calm interface. No streaks, no progress bars, no "you've reflected
 *      for 7 days in a row!" gamification. The page should feel quiet.
 *   3. Crisis resources surface inline AND are always reachable via a
 *      footer link — never hidden behind a state the model controls.
 */

import { useEffect, useRef, useState } from 'react';
import DataLoader from '@/src/components/DataLoader';
import { TkxAlert, TkxButton, TkxCard, TkxCardBody, TkxCardHeader, TkxInput, TkxRadio, TkxSelect, TkxSlider, TkxTextarea } from 'tekivex-ui';
import {
  api,
  isApiRequestError,
  type SahaayakChatResult,
  type SahaayakEvent,
  type SahaayakMessage,
  type SahaayakMode,
  type SahaayakProfile,
} from '@/src/lib/api';

const EVENT_KINDS: Array<{ kind: string; label: string }> = [
  { kind: 'rejection', label: 'Rejection' },
  { kind: 'interview', label: 'Interview' },
  { kind: 'offer', label: 'Offer' },
  { kind: 'layoff', label: 'Layoff' },
  { kind: 'win', label: 'Win' },
  { kind: 'mood', label: 'Mood check-in' },
  { kind: 'reflection', label: 'Reflection' },
];

const MODE_DESCRIPTIONS: Record<SahaayakMode, string> = {
  witness: 'Listens first. Reflects what it heard. Asks one short question. No advice unless you ask.',
  coach: 'Same as Witness, plus may offer ONE small concrete next step when it fits.',
  karmayoga: 'Witness + a Gita-inspired lens: focus on effort, release attachment to outcome. Never preaches.',
};

export default function SahaayakClient() {
  const [profile, setProfile] = useState<SahaayakProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await api.getSahaayakProfile();
        if (!cancelled) setProfile(p);
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <main style={pageStyle}><DataLoader label="Loading Sahaayak…" /></main>;
  }
  if (error) {
    return <main style={pageStyle}><TkxAlert variant="danger">{error}</TkxAlert></main>;
  }
  if (!profile?.optedIn) {
    return <OptInGate onOptedIn={setProfile} />;
  }
  return <SahaayakWorkspace profile={profile} onProfileChange={setProfile} />;
}

// ---------------------------------------------------------------------------
// Opt-in
// ---------------------------------------------------------------------------

function OptInGate({ onOptedIn }: { onOptedIn: (p: SahaayakProfile) => void }) {
  const [mode, setMode] = useState<SahaayakMode>('witness');
  const [guardrails, setGuardrails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await api.optInSahaayak({ mode, guardrails: guardrails.trim() || undefined });
      onOptedIn(p);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={pageStyle}>
      <TkxCard style={{ maxWidth: 720, margin: '0 auto' }}>
        <TkxCardHeader>
          <h2 style={{ margin: 0 }}>Sahaayak <span style={{ fontWeight: 400, color: 'var(--muted, #888)' }}>· सहायक</span></h2>
          <p style={{ margin: '6px 0 0', color: 'var(--muted, #888)' }}>
            A quiet companion for the job-search journey. Opt in once — change your mind anytime.
          </p>
        </TkxCardHeader>
        <TkxCardBody>
          <p style={{ marginTop: 0 }}>
            Sahaayak is different from a chat assistant. It remembers what you tell it: rejections,
            interviews, wins, the things that landed hard. Over time, it surfaces patterns you may
            not have noticed — without giving advice you didn&apos;t ask for.
          </p>
          <p style={{ color: 'var(--muted, #666)', fontSize: 14 }}>
            What we store: events you log, your chat messages, a short running summary. Nothing is
            shared. You can delete it all with one click.
          </p>

          <div style={{ marginTop: 18 }}>
            <label style={labelStyle}>Choose a mode</label>
            {/* The card chrome moves to a div: TkxRadio renders its own
             * <label>, and nesting it inside the old card label would ship
             * the invalid label-in-label markup. */}
            {(Object.keys(MODE_DESCRIPTIONS) as SahaayakMode[]).map((m) => (
              <div key={m} style={{ display: 'block', padding: '10px 12px', border: '1px solid var(--border, #ddd)', borderRadius: 8, marginBottom: 8, background: mode === m ? 'rgba(0,120,255,0.05)' : 'transparent' }}>
                <TkxRadio
                  name="mode"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  label={
                    <>
                      <strong style={{ textTransform: 'capitalize' }}>{m}</strong>
                      <div style={{ color: 'var(--muted, #666)', fontSize: 13, marginTop: 2 }}>
                        {MODE_DESCRIPTIONS[m]}
                      </div>
                    </>
                  }
                />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <TkxTextarea
              label="Guardrails (optional)"
              value={guardrails}
              onChange={(e) => setGuardrails(e.target.value)}
              placeholder={`Examples: "Don't bring up my last layoff." "Don't suggest job boards."`}
              minRows={3}
              style={textareaStyle}
            />
          </div>

          {error && <TkxAlert variant="danger" style={{ marginTop: 12 }}>{error}</TkxAlert>}
          <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
            <TkxButton onClick={submit} disabled={busy}>
              {busy ? 'Starting…' : 'Begin'}
            </TkxButton>
          </div>
        </TkxCardBody>
      </TkxCard>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Main workspace: chat + event log
// ---------------------------------------------------------------------------

function SahaayakWorkspace({ profile, onProfileChange }: { profile: SahaayakProfile; onProfileChange: (p: SahaayakProfile) => void }) {
  const [messages, setMessages] = useState<SahaayakMessage[]>([]);
  const [events, setEvents] = useState<SahaayakEvent[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [checkInPrompt, setCheckInPrompt] = useState<string | null>(null);
  const [crisis, setCrisis] = useState<SahaayakChatResult['crisis'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const refresh = async () => {
    const [m, e, c] = await Promise.all([
      api.listSahaayakMessages(30).catch(() => []),
      api.listSahaayakEvents(50).catch(() => []),
      api.getSahaayakCheckIn().catch(() => ({ prompt: '' })),
    ]);
    setMessages(m);
    setEvents(e);
    setCheckInPrompt(c.prompt || null);
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    // Optimistic: render the user turn immediately.
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tempId,
      role: 'user',
      content: text,
      crisisFlag: false,
      createdAt: new Date().toISOString(),
    }]);
    setInput('');
    try {
      const result = await api.chatSahaayak(text);
      if (result.crisis.flag) setCrisis(result.crisis);
      await refresh();
    } catch (err) {
      setError(extractErrorMessage(err));
      // Roll back optimistic message on error.
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const onOptOut = async () => {
    if (!confirm('Pause Sahaayak? Your memory stays saved — you can resume anytime.')) return;
    await api.optOutSahaayak();
    onProfileChange({ ...profile, optedIn: false });
  };

  const onForget = async () => {
    if (!confirm('Delete all Sahaayak memory permanently? This cannot be undone.')) return;
    await api.forgetSahaayak();
    onProfileChange({ optedIn: false });
  };

  return (
    <main style={{ ...pageStyle, maxWidth: 1100 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>
            Sahaayak <span style={{ fontWeight: 400, color: 'var(--muted, #888)', fontSize: 16 }}>· {profile.mode} mode</span>
          </h2>
          {/* One-line purpose subtitle so users can tell Sahaayak apart
             from Mentor at a glance. Sahaayak = companion for the
             hard days; Mentor = career strategy. Adapted slightly per
             mode so the framing matches what the user opted into. */}
          <p style={{ margin: '4px 0 0', color: 'var(--muted, #5a6778)', fontSize: 13, lineHeight: 1.45 }}>
            A companion for the hard days — listens, reflects, holds space.{' '}
            {profile.mode === 'karmayoga' && 'Gita lens: focus on effort, release the outcome.'}
            {profile.mode === 'coach' && 'May offer one small next step when it feels right.'}
            {profile.mode === 'witness' && 'No advice unless you ask — just presence.'}{' '}
            <span style={{ color: 'var(--muted, #8a98ac)' }}>
              Not the same as Mentor (career strategy) or ATS / JD Match (resume tools).
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <TkxButton variant="outline" onClick={onOptOut}>Pause</TkxButton>
          <TkxButton variant="outline" onClick={onForget}>Delete memory</TkxButton>
        </div>
      </header>

      <ByokHintForFreeUsers />

      <div className="sahaayak-workspace-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
        <TkxCard>
          <TkxCardHeader>
            <strong>Conversation</strong>
            {checkInPrompt && messages.length === 0 && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(0,120,255,0.06)', borderRadius: 8, fontSize: 14 }}>
                {checkInPrompt}
              </div>
            )}
          </TkxCardHeader>
          <TkxCardBody>
            {crisis?.flag && <CrisisCard crisis={crisis} onDismiss={() => setCrisis(null)} />}
            <div
              ref={threadRef}
              style={{
                minHeight: 360,
                maxHeight: '60vh',
                overflowY: 'auto',
                padding: '4px 2px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {messages.length === 0 && (
                <div style={{ color: 'var(--muted, #888)', fontStyle: 'italic' }}>
                  Start when you&apos;re ready. There&apos;s no script.
                </div>
              )}
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              {/* Chat composer — a visible label above the box would be noise,
               * so the accessible name is kept for screen readers only. */}
              <div className="hide-field-label" style={{ flex: 1 }}>
                <TkxTextarea
                  label="Message Sahaayak"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  minRows={2}
                  placeholder="Say what's on your mind. Enter to send, Shift+Enter for newline."
                  style={{ ...textareaStyle, marginBottom: 0 }}
                  disabled={sending}
                />
              </div>
              <TkxButton onClick={send} disabled={sending || !input.trim()}>
                {sending ? '…' : 'Send'}
              </TkxButton>
            </div>
            {error && <TkxAlert variant="danger" style={{ marginTop: 10 }}>{error}</TkxAlert>}
          </TkxCardBody>
        </TkxCard>

        <EventSidebar events={events} onChanged={refresh} />
      </div>

      <footer style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: 'var(--muted, #888)' }}>
        <div>
          In crisis? Reach a trained counsellor now:{' '}
          <a href="tel:+919152987821">iCall +91 9152987821</a> ·{' '}
          <a href="tel:18602662345">Vandrevala 1860-2662-345</a> ·{' '}
          <a href="https://findahelpline.com" target="_blank" rel="noreferrer">findahelpline.com</a>
        </div>
        <div style={{ marginTop: 6 }}>
          Questions or feedback about CallbackCV?{' '}
          <a href="mailto:novaai0401@gmail.com">novaai0401@gmail.com</a>
        </div>
      </footer>
    </main>
  );
}

function MessageBubble({ message }: { message: SahaayakMessage }) {
  const isUser = message.role === 'user';
  return (
    <div style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
      <div
        style={{
          padding: '10px 14px',
          borderRadius: 14,
          background: isUser ? 'rgba(0,120,255,0.10)' : 'var(--surface-alt, #f3f3f3)',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
          fontSize: 15,
        }}
      >
        {message.content}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted, #888)', marginTop: 2, textAlign: isUser ? 'right' : 'left' }}>
        {formatTimestamp(message.createdAt)}
      </div>
    </div>
  );
}

function CrisisCard({ crisis, onDismiss }: { crisis: SahaayakChatResult['crisis']; onDismiss: () => void }) {
  return (
    <TkxAlert variant="danger" style={{ marginBottom: 12 }}>
      <strong>You don&apos;t have to be alone with this.</strong>
      <ul style={{ marginTop: 8, marginBottom: 4, paddingLeft: 20 }}>
        {crisis.resources.slice(0, 3).map((r) => (
          <li key={r.name}>
            {r.name}{r.phone ? <> — <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a></> : null} ({r.hours})
          </li>
        ))}
      </ul>
      <TkxButton
        onClick={onDismiss}
        style={{ marginTop: 6, background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}
      >
        Acknowledge
      </TkxButton>
    </TkxAlert>
  );
}

// ---------------------------------------------------------------------------
// Event sidebar
// ---------------------------------------------------------------------------

function EventSidebar({ events, onChanged }: { events: SahaayakEvent[]; onChanged: () => void }) {
  const [kind, setKind] = useState('rejection');
  const [company, setCompany] = useState('');
  const [note, setNote] = useState('');
  const [mood, setMood] = useState<number>(3);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      if (kind === 'rejection' || kind === 'interview' || kind === 'offer' || kind === 'layoff') {
        if (company.trim()) payload.company = company.trim();
      }
      await api.recordSahaayakEvent({
        kind,
        payload,
        note: note.trim() || undefined,
        moodRating: kind === 'mood' ? mood : undefined,
      });
      setCompany('');
      setNote('');
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <TkxCard>
      <TkxCardHeader><strong>Log an event</strong></TkxCardHeader>
      <TkxCardBody>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Note a career moment — a rejection, interview, or offer. It feeds your Outcome timeline so
          you (and Sahaayak) can see patterns over time. Optional and private.
        </p>
        <TkxSelect
          label="Kind"
          value={kind}
          options={EVENT_KINDS.map((k) => ({ value: k.kind, label: k.label }))}
          onChange={(value) => setKind(String(value || ''))}
        />

        {(kind === 'rejection' || kind === 'interview' || kind === 'offer' || kind === 'layoff') && (
          <>
            <TkxInput label="Company" value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} placeholder="Acme Corp" />
          </>
        )}

        {kind === 'mood' && (
          <>
            <TkxSlider
              label="Mood (1–5)"
              min={1}
              max={5}
              step={1}
              value={mood}
              onChange={(value) => setMood(value)}
              showValue
            />
          </>
        )}

        <TkxTextarea
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          minRows={2}
          style={textareaStyle}
          placeholder="A line for future-you."
        />

        <TkxButton onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</TkxButton>

        <hr style={{ margin: '18px 0', border: 0, borderTop: '1px solid var(--border, #eee)' }} />
        <strong style={{ display: 'block', marginBottom: 8 }}>Recent</strong>
        {events.length === 0 ? (
          <p style={{ color: 'var(--muted, #888)', fontSize: 14, margin: 0 }}>Nothing logged yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
            {events.slice(0, 12).map((e) => (
              <li key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <strong style={{ textTransform: 'capitalize' }}>{e.kind}</strong>
                {' · '}
                <span style={{ color: 'var(--muted, #888)' }}>{formatTimestamp(e.occurredAt)}</span>
                {e.payload && typeof (e.payload as any).company === 'string' && (
                  <> — {(e.payload as any).company}</>
                )}
                {e.moodRating ? <> · {e.moodRating}/5</> : null}
                {e.note ? <div style={{ color: 'var(--muted, #666)', marginTop: 2 }}>{e.note}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </TkxCardBody>
    </TkxCard>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const pageStyle: React.CSSProperties = { padding: '32px 20px', maxWidth: 720, margin: '0 auto' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 4, color: 'var(--ink, #222)' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border, #ddd)', borderRadius: 6, fontSize: 14, background: 'var(--surface, #fff)', color: 'var(--ink, #222)' };
const textareaStyle: React.CSSProperties = { ...inputStyle, fontFamily: 'inherit', resize: 'vertical', marginBottom: 4 };

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function extractErrorMessage(err: unknown): string {
  if (isApiRequestError(err)) return err.message || 'Something went wrong.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

/**
 * Small banner shown above the conversation when:
 *   - the user is on the FREE plan, AND
 *   - they have NOT configured a BYOK AI key.
 *
 * Without an AI key on free tier, the chat falls back to the offline
 * companion (warm but not a full dialogue). The banner explains the
 * trade-off and points at Settings to plug in a Groq key (free).
 * Hidden entirely for paid users and for free users who already
 * added a key.
 */
function ByokHintForFreeUsers() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const plan = (window.localStorage.getItem('rb_plan') || 'FREE').toUpperCase();
      if (plan === 'STUDENT' || plan === 'PRO') return;
      const stored = window.localStorage.getItem('rb_user_ai_key');
      if (!stored) setShow(true);
    } catch {
      setShow(false);
    }
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        background: '#fff7e0',
        border: '1px solid #e9d27a',
        borderRadius: 8,
        color: '#5a4400',
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <strong>Heads up:</strong> on the free plan, Sahaayak runs in offline mode — warm
      replies but not a full conversation.{' '}
      <a href="/settings" style={{ color: '#1a3a5c', fontWeight: 600 }}>
        Add a free Groq key in Settings
      </a>{' '}
      to unlock the real dialogue, or{' '}
      <a href="/billing" style={{ color: '#1a3a5c', fontWeight: 600 }}>
        upgrade
      </a>{' '}
      to get it included.
    </div>
  );
}
