'use client';

import AuthGate from '@/src/components/AuthGate';
import SkillDemandClient from './SkillDemandClient';

export default function SkillDemandPage() {
  return (
    <AuthGate>
      <SkillDemandClient />
    </AuthGate>
  );
}
