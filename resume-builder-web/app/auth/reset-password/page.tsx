import { Suspense } from 'react';
import ResetPasswordView from './ResetPasswordView';

export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="card">Loading…</div>}>
      <ResetPasswordView />
    </Suspense>
  );
}
