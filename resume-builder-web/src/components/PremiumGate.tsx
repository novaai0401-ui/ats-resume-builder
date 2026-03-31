'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken, api } from '@/src/lib/api';

export type PremiumFeature =
  | 'ATS_100_BOOST'
  | 'JOB_GAP_ANALYSIS'
  | 'PREMIUM_JOB_MATERIALS'
  | 'BEST_COURSES'
  | 'PREMIUM_AI_GUIDANCE';

const FEATURE_LABELS: Record<PremiumFeature, { title: string; description: string }> = {
  ATS_100_BOOST: {
    title: 'ATS Score Optimization (90 → 100)',
    description: 'Unlock deep AI-powered ATS optimization to push your resume score from 90 to a perfect 100.',
  },
  JOB_GAP_ANALYSIS: {
    title: 'Job & Technology Gap Analysis',
    description: 'Get detailed analysis of skill gaps, career readiness, and a personalized learning roadmap.',
  },
  PREMIUM_JOB_MATERIALS: {
    title: 'Premium Job Materials',
    description: 'Access optimized cover letters, interview prep, and role-specific resume suggestions.',
  },
  BEST_COURSES: {
    title: 'Best Courses & Learning Path',
    description: 'Get personalized course recommendations to close skill gaps for your target role.',
  },
  PREMIUM_AI_GUIDANCE: {
    title: 'Premium AI Career Guidance',
    description: 'Unlock advanced AI-powered career planning, role benchmarking, and growth recommendations.',
  },
};

type PremiumGateProps = {
  feature: PremiumFeature;
  children?: React.ReactNode;
};

/**
 * Contextual premium feature gate.
 * Shows upgrade options only when user tries to access a premium feature.
 * Cheapest option (Boost Pack) shown first.
 */
export default function PremiumGate({ feature, children }: PremiumGateProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [credits, setCredits] = useState(0);

  const featureInfo = FEATURE_LABELS[feature];

  const checkAccess = useCallback(async () => {
    if (!getAccessToken()) {
      sessionStorage.setItem('rb_return_to', window.location.pathname);
      router.push('/auth/login');
      return;
    }
    setChecking(true);
    try {
      const result = await api.checkPremiumAccess();
      if (result.allowed) {
        // Consume a credit if on free plan with credits
        if (result.reason === 'credits') {
          await api.consumePremiumCredit(feature);
          setCredits(result.premiumCredits - 1);
        }
        setAccessGranted(true);
      } else {
        setCredits(result.premiumCredits);
        setShowModal(true);
      }
    } catch {
      setShowModal(true);
    } finally {
      setChecking(false);
    }
  }, [feature, router]);

  // If access already granted, render children
  if (accessGranted) {
    return <>{children}</>;
  }

  // Upgrade modal
  if (showModal) {
    return (
      <div className="premium-gate">
        <div className="premium-gate__icon">⭐</div>
        <h4 className="premium-gate__title">{featureInfo.title}</h4>
        <p className="small" style={{ marginBottom: 12 }}>{featureInfo.description}</p>

        <div style={{ display: 'grid', gap: 10, maxWidth: 340, margin: '0 auto' }}>
          {/* Cheapest option first */}
          <button
            className="btn"
            onClick={async () => {
              try {
                await api.addPremiumCredits(5);
                setCredits(5);
                setShowModal(false);
                setAccessGranted(true);
              } catch (e: unknown) {
                // fallback: redirect to billing
                router.push('/billing');
              }
            }}
            style={{ background: '#2f5f8f' }}
          >
            Get Boost Pack (5 credits) — Free Trial
          </button>

          <button className="btn secondary" onClick={() => router.push('/billing')}>
            View All Plans
          </button>

          <button
            className="btn ghost"
            onClick={() => setShowModal(false)}
            style={{ fontSize: '0.8rem' }}
          >
            Continue with free features
          </button>
        </div>

        {credits > 0 && (
          <p className="small" style={{ marginTop: 8, color: '#5a6778' }}>
            You have {credits} premium credit{credits !== 1 ? 's' : ''} remaining.
          </p>
        )}
      </div>
    );
  }

  // Trigger button (replaces children until access is checked)
  return (
    <div style={{ textAlign: 'center', padding: 16 }}>
      <button className="btn" onClick={checkAccess} disabled={checking}>
        {checking ? 'Checking access...' : `Unlock ${featureInfo.title}`}
      </button>
      <p className="small" style={{ marginTop: 6, color: '#5a6778' }}>Premium feature — requires upgrade or credits</p>
    </div>
  );
}

/**
 * Check if a premium feature is blocked for the current user.
 * Use in event handlers before triggering expensive operations.
 */
export function isPremiumFeatureBlocked(): boolean {
  if (typeof window === 'undefined') return true;
  if (!getAccessToken()) return true;
  const plan = localStorage.getItem('rb_plan') || 'FREE';
  return plan === 'FREE';
}
