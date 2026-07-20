'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/src/lib/api';
import { LoginPageView } from '../login/LoginPageView';
import { readNextParamFromLocation } from '../next-param';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    // Already signed in: honour a validated ?next=<path> (gallery CTAs
    // link here with one) instead of bouncing to the dashboard.
    if (getAccessToken()) router.replace(readNextParamFromLocation() ?? '/dashboard');
  }, [router]);

  return <LoginPageView defaultMode="register" />;
}
