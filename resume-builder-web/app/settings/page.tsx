'use client';

import AuthGate from '@/src/components/AuthGate';
import SettingsPageView from './SettingsPageView';

export default function SettingsPage() {
  return (
    <AuthGate>
      <SettingsPageView />
    </AuthGate>
  );
}
