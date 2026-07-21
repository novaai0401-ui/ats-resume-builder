import { Suspense } from 'react';
import AuthGate from '@/src/components/AuthGate';
import ContactsClient from './ContactsClient';

export const dynamic = 'force-dynamic';

export default function ContactsPage() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="card">Loading Contacts...</div>}>
        <ContactsClient />
      </Suspense>
    </AuthGate>
  );
}
