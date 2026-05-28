'use client';

import AuthGate from '@/src/components/AuthGate';
import PatternReviewView from './PatternReviewView';

export default function PatternReviewPage() {
  return (
    <AuthGate>
      <PatternReviewView />
    </AuthGate>
  );
}
