'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/src/lib/api';
import { LoginPageView } from '../login/LoginPageView';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    if (getAccessToken()) router.replace('/dashboard');
  }, [router]);

  return <LoginPageView defaultMode="register" />;
}
