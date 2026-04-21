import { Suspense } from 'react';
import AuthGate from '@/src/components/AuthGate';
import CareerNavigatorClient from './CareerNavigatorClient';

export const dynamic = 'force-dynamic';

export default function CareerNavigatorPage() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="card">Loading Career Navigator...</div>}>
        <CareerNavigatorClient />
      </Suspense>
    </AuthGate>
  );
}
