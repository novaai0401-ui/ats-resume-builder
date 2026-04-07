'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TkxButton, TkxModal } from 'tekivex-ui';
import { api, getAccessToken, clearAuthTokens, refresh, setAuthTokens } from '@/src/lib/api';

/** Session duration in ms (30 minutes). */
const SESSION_DURATION_MS = 30 * 60 * 1000;
/** Warning appears at 25 minutes (5 minutes before expiry). */
const WARNING_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
/** Check interval (every 10 seconds). */
const CHECK_INTERVAL_MS = 10_000;
/** Countdown tick interval. */
const COUNTDOWN_TICK_MS = 1_000;

function getSessionStartMs(): number {
  if (typeof window === 'undefined') return 0;
  const stored = localStorage.getItem('rb_session_start');
  const value = Number(stored || '0');
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function setSessionStart() {
  if (typeof window === 'undefined') return;
  localStorage.setItem('rb_session_start', String(Date.now()));
}

function clearSessionStart() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('rb_session_start');
}

export default function SessionWarningModal() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const [extending, setExtending] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doLogout = useCallback(async () => {
    setVisible(false);
    if (countdownRef.current) clearInterval(countdownRef.current);
    clearSessionStart();
    try {
      await api.logout();
    } catch {
      clearAuthTokens();
    }
    router.push('/auth/login');
  }, [router]);

  const startCountdown = useCallback((remainingMs: number) => {
    setSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
    setVisible(true);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          doLogout();
          return 0;
        }
        return prev - 1;
      });
    }, COUNTDOWN_TICK_MS);
  }, [doLogout]);

  useEffect(() => {
    // Initialize session start if authenticated and not already set
    if (getAccessToken() && !getSessionStartMs()) {
      setSessionStart();
    }

    // Listen for auth changes to reset session start
    const onAuthChange = () => {
      if (getAccessToken()) {
        if (!getSessionStartMs()) setSessionStart();
      } else {
        clearSessionStart();
        setVisible(false);
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    };
    window.addEventListener('auth-state-changed', onAuthChange);
    window.addEventListener('storage', onAuthChange);

    // Periodic check
    checkRef.current = setInterval(() => {
      if (!getAccessToken()) {
        setVisible(false);
        if (countdownRef.current) clearInterval(countdownRef.current);
        return;
      }
      const sessionStart = getSessionStartMs();
      if (!sessionStart) return;
      const elapsed = Date.now() - sessionStart;
      const remaining = SESSION_DURATION_MS - elapsed;

      if (remaining <= 0) {
        doLogout();
      } else if (remaining <= WARNING_BEFORE_EXPIRY_MS && !visible) {
        startCountdown(remaining);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener('auth-state-changed', onAuthChange);
      window.removeEventListener('storage', onAuthChange);
      if (checkRef.current) clearInterval(checkRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [doLogout, startCountdown, visible]);

  async function handleContinue() {
    setExtending(true);
    try {
      const storedRefreshToken = typeof window !== 'undefined' ? localStorage.getItem('rb_refreshToken') : null;
      const storedUserId = typeof window !== 'undefined' ? localStorage.getItem('rb_userId') : null;
      if (!storedRefreshToken || !storedUserId) {
        await doLogout();
        return;
      }
      const auth = await refresh({ userId: storedUserId, refreshToken: storedRefreshToken });
      setAuthTokens(auth);
      setSessionStart();
      setVisible(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
    } catch {
      await doLogout();
    } finally {
      setExtending(false);
    }
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeDisplay = `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <TkxModal
      isOpen={visible}
      onClose={doLogout}
      title="Session Expiring Soon"
      size="sm"
      closeOnOverlayClick={false}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <TkxButton onClick={handleContinue} isLoading={extending} loadingText="Extending...">
            Continue Session
          </TkxButton>
          <TkxButton variant="outline" onClick={doLogout}>
            Logout
          </TkxButton>
        </div>
      }
    >
      <p style={{ margin: 0 }}>Your session will expire in:</p>
      <div style={{ fontSize: '2rem', fontWeight: 700, textAlign: 'center', margin: '12px 0' }}>{timeDisplay}</div>
      <p style={{ margin: 0 }}>Would you like to continue your session?</p>
    </TkxModal>
  );
}
