'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TkxButton, TkxModal } from 'tekivex-ui';
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
      <TkxModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={featureInfo.title}
        size="sm"
        footer={
          <TkxButton variant="ghost" size="sm" onClick={() => setShowModal(false)}>
            Continue with free features
          </TkxButton>
        }
      >
        <p style={{ margin: '0 0 16px' }}>{featureInfo.description}</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <TkxButton
            isFullWidth
            onClick={async () => {
              try {
                await api.addPremiumCredits(5);
                setCredits(5);
                setShowModal(false);
                setAccessGranted(true);
              } catch {
                router.push('/billing');
              }
            }}
          >
            Get Boost Pack (5 credits) — Free Trial
          </TkxButton>
          <TkxButton variant="outline" isFullWidth onClick={() => router.push('/billing')}>
            View All Plans
          </TkxButton>
        </div>
        {credits > 0 && (
          <p style={{ marginTop: 12, fontSize: '0.85rem', color: '#5a6778' }}>
            You have {credits} premium credit{credits !== 1 ? 's' : ''} remaining.
          </p>
        )}
      </TkxModal>
    );
  }

  // Trigger button (replaces children until access is checked)
  return (
    <div style={{ textAlign: 'center', padding: 16 }}>
      <TkxButton onClick={checkAccess} isLoading={checking} loadingText="Checking access...">
        Unlock {featureInfo.title}
      </TkxButton>
      <p style={{ marginTop: 6, fontSize: '0.85rem', color: '#5a6778' }}>Premium feature — requires upgrade or credits</p>
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
