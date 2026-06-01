'use client';

import AuthGate from '@/src/components/AuthGate';
import SahaayakClient from './SahaayakClient';

export default function SahaayakPage() {
  return (
    <AuthGate>
      <SahaayakClient />
    </AuthGate>
  );
}
