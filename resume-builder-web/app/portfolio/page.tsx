'use client';

import AuthGate from '@/src/components/AuthGate';
import PortfolioClient from './PortfolioClient';

export default function PortfolioPage() {
  return (
    <AuthGate>
      <PortfolioClient />
    </AuthGate>
  );
}
